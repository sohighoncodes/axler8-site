const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy";

class AvailabilityError extends Error {
  constructor(message, status = 500, step = "server", detail = "") {
    super(message);
    this.name = "AvailabilityError";
    this.status = status;
    this.step = step;
    this.detail = detail;
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

function cleanPrivateKey(value) {
  const raw = String(value || "").trim();

  if (raw.startsWith("{")) {
    try {
      const serviceAccount = JSON.parse(raw);
      if (serviceAccount.private_key) {
        return String(serviceAccount.private_key).trim().replace(/\\n/g, "\n");
      }
    } catch (_) {
      // Fall through to normal private-key cleanup below.
    }
  }

  return raw
    .trim()
    .replace(/^['"]|['"]$/g, "")
    .replace(/\\n/g, "\n");
}

function hasOAuthConfig(env) {
  return Boolean(env.GOOGLE_OAUTH_CLIENT_ID && env.GOOGLE_OAUTH_CLIENT_SECRET && env.GOOGLE_OAUTH_REFRESH_TOKEN);
}

function hasServiceAccountConfig(env) {
  return Boolean(env.GOOGLE_CLIENT_EMAIL && env.GOOGLE_PRIVATE_KEY);
}

function base64Url(input) {
  const bytes = input instanceof ArrayBuffer ? new Uint8Array(input) : new TextEncoder().encode(input);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function pemToArrayBuffer(pem) {
  const normalized = cleanPrivateKey(pem)
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");

  if (!normalized) {
    throw new AvailabilityError("Google private key is empty or formatted incorrectly.", 501, "config");
  }

  try {
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
  } catch (_) {
    throw new AvailabilityError("Google private key could not be read. Check the private key formatting in Cloudflare.", 501, "config");
  }
}

async function googleJson(response, step, message) {
  const text = await response.text();
  let body = {};

  try {
    body = text ? JSON.parse(text) : {};
  } catch (_) {
    body = { raw: text };
  }

  if (!response.ok) {
    const googleMessage = body?.error?.message || body?.error_description || body?.raw || "";
    throw new AvailabilityError(message, response.status, step, String(googleMessage).slice(0, 280));
  }

  return body;
}

async function signJwt(env) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: env.GOOGLE_CLIENT_EMAIL,
    scope: GOOGLE_CALENDAR_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    exp: now + 3600,
    iat: now,
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;

  let key;
  try {
    key = await crypto.subtle.importKey(
      "pkcs8",
      pemToArrayBuffer(env.GOOGLE_PRIVATE_KEY),
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
  } catch (error) {
    if (error instanceof AvailabilityError) throw error;
    throw new AvailabilityError("Google private key could not be imported.", 501, "config");
  }

  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64Url(signature)}`;
}

async function getServiceAccountAccessToken(env) {
  const assertion = await signJwt(env);
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });

  const token = await googleJson(response, "auth", "Unable to authenticate with Google Calendar.");

  if (!token.access_token) {
    throw new AvailabilityError("Google authentication did not return an access token.", 502, "auth");
  }

  return token.access_token;
}

async function getOAuthAccessToken(env) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      refresh_token: env.GOOGLE_OAUTH_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });

  const token = await googleJson(response, "oauth-auth", "Unable to authenticate with your Google account.");

  if (!token.access_token) {
    throw new AvailabilityError("Google OAuth did not return an access token.", 502, "oauth-auth");
  }

  return token.access_token;
}

async function getGoogleAccess(env) {
  if (hasOAuthConfig(env)) {
    return {
      accessToken: await getOAuthAccessToken(env),
      authMode: "oauth",
    };
  }

  if (hasServiceAccountConfig(env)) {
    return {
      accessToken: await getServiceAccountAccessToken(env),
      authMode: "service-account",
    };
  }

  throw new AvailabilityError("Google Calendar authentication is not configured yet.", 501, "config");
}

function parseDateParam(url, key) {
  const value = url.searchParams.get(key);
  const date = new Date(value || "");

  if (!value || Number.isNaN(date.getTime())) {
    throw new AvailabilityError("Invalid availability window.", 400, "request");
  }

  return date;
}

export async function onRequestGet({ request, env }) {
  try {
    if (!env.GOOGLE_CALENDAR_ID) {
      throw new AvailabilityError("Google Calendar ID is not configured yet.", 501, "config");
    }

    const url = new URL(request.url);
    const start = parseDateParam(url, "start");
    const end = parseDateParam(url, "end");

    if (end <= start) {
      throw new AvailabilityError("Invalid availability window.", 400, "request");
    }

    const { accessToken, authMode } = await getGoogleAccess(env);
    const response = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        items: [{ id: env.GOOGLE_CALENDAR_ID }],
      }),
    });

    const freeBusy = await googleJson(response, "availability", "Unable to check Google Calendar availability.");
    const busy = freeBusy.calendars?.[env.GOOGLE_CALENDAR_ID]?.busy || [];

    return json({ ok: true, busy, authMode });
  } catch (error) {
    console.error("Availability check failed", {
      message: error.message,
      step: error.step || "server",
      status: error.status || 500,
      detail: error.detail || "",
    });

    return json(
      {
        ok: false,
        message: error.message || "Unable to load availability.",
        step: error.step || "server",
        detail: error.detail || "",
      },
      error.status || 500,
    );
  }
}
