const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy";

class BookingError extends Error {
  constructor(message, status = 500, step = "server", detail = "") {
    super(message);
    this.name = "BookingError";
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
    throw new BookingError("Google private key is empty or formatted incorrectly.", 501, "config");
  }

  try {
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }
    return bytes.buffer;
  } catch (_) {
    throw new BookingError("Google private key could not be read. Check the private key formatting in Cloudflare.", 501, "config");
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
    throw new BookingError(message, response.status, step, String(googleMessage).slice(0, 280));
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
    if (error instanceof BookingError) throw error;
    throw new BookingError("Google private key could not be imported.", 501, "config");
  }

  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64Url(signature)}`;
}

async function getGoogleAccessToken(env) {
  const assertion = await signJwt(env);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion,
  });

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const token = await googleJson(response, "auth", "Unable to authenticate with Google Calendar.");

  if (!token.access_token) {
    throw new BookingError("Google authentication did not return an access token.", 502, "auth");
  }

  return token.access_token;
}

function buildDescription(payload) {
  return [
    "New AXLER8 consultation booking.",
    "",
    `Name: ${payload.Name || ""}`,
    `Email: ${payload.Email || ""}`,
    `Company: ${payload.Company || ""}`,
    `Consultation type: ${payload["Consultation type"] || ""}`,
    `Selected day: ${payload["Selected day"] || ""}`,
    `Selected time: ${payload["Selected time"] || ""}`,
    "",
    "Inquiry:",
    payload.Inquiry || "",
  ].join("\n");
}

async function handleBooking({ request, env }) {
  if (!env.GOOGLE_CLIENT_EMAIL || !env.GOOGLE_PRIVATE_KEY || !env.GOOGLE_CALENDAR_ID) {
    throw new BookingError("Google Calendar environment variables are not configured yet.", 501, "config");
  }

  let payload;
  try {
    payload = await request.json();
  } catch (_) {
    throw new BookingError("Invalid booking request.", 400, "request");
  }

  if (!payload.Name || !payload.Email || !payload["Selected start ISO"]) {
    throw new BookingError("Missing required booking details.", 400, "request");
  }

  const start = new Date(payload["Selected start ISO"]);
  if (Number.isNaN(start.getTime())) {
    throw new BookingError("Invalid selected time.", 400, "request");
  }

  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const accessToken = await getGoogleAccessToken(env);
  const calendarId = encodeURIComponent(env.GOOGLE_CALENDAR_ID);
  const timeZone = env.BOOKING_TIMEZONE || "Asia/Manila";

  const freeBusyResponse = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
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

  const freeBusy = await googleJson(freeBusyResponse, "availability", "Unable to check Google Calendar availability.");
  const busy = freeBusy.calendars?.[env.GOOGLE_CALENDAR_ID]?.busy || [];

  if (busy.length > 0) {
    throw new BookingError("Selected slot is no longer available.", 409, "availability");
  }

  const eventResponse = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?sendUpdates=all`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      summary: `AXLER8 Free Consultation — ${payload.Name}`,
      description: buildDescription(payload),
      start: { dateTime: start.toISOString(), timeZone },
      end: { dateTime: end.toISOString(), timeZone },
      attendees: [{ email: payload.Email, displayName: payload.Name }],
      guestsCanInviteOthers: false,
      guestsCanModify: false,
      guestsCanSeeOtherGuests: false,
      reminders: { useDefault: true },
    }),
  });

  const event = await googleJson(eventResponse, "create-event", "Unable to create Google Calendar event.");
  return json({ ok: true, eventId: event.id, htmlLink: event.htmlLink });
}

export async function onRequestPost(context) {
  try {
    return await handleBooking(context);
  } catch (error) {
    console.error("Booking failed", {
      message: error.message,
      step: error.step || "server",
      status: error.status || 500,
      detail: error.detail || "",
    });

    return json(
      {
        ok: false,
        message: error.message || "Unable to complete booking.",
        step: error.step || "server",
        detail: error.detail || "",
      },
      error.status || 500,
    );
  }
}
