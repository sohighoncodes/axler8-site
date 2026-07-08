const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
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
  const normalized = pem.replace(/\\n/g, "\n").replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").replace(/\s/g, "");
  const binary = atob(normalized);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes.buffer;
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
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(env.GOOGLE_PRIVATE_KEY),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
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

  if (!response.ok) {
    throw new Error("Unable to authenticate with Google Calendar");
  }

  const token = await response.json();
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
    "",
    "Inquiry:",
    payload.Inquiry || "",
  ].join("\n");
}

export async function onRequestPost({ request, env }) {
  if (!env.GOOGLE_CLIENT_EMAIL || !env.GOOGLE_PRIVATE_KEY || !env.GOOGLE_CALENDAR_ID) {
    return json({ ok: false, message: "Google Calendar environment variables are not configured yet." }, 501);
  }

  let payload;
  try {
    payload = await request.json();
  } catch (_) {
    return json({ ok: false, message: "Invalid booking request." }, 400);
  }

  if (!payload.Name || !payload.Email || !payload["Selected start ISO"]) {
    return json({ ok: false, message: "Missing required booking details." }, 400);
  }

  const start = new Date(payload["Selected start ISO"]);
  if (Number.isNaN(start.getTime())) {
    return json({ ok: false, message: "Invalid selected time." }, 400);
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

  if (!freeBusyResponse.ok) {
    throw new Error("Unable to check Google Calendar availability");
  }

  const freeBusy = await freeBusyResponse.json();
  const busy = freeBusy.calendars?.[env.GOOGLE_CALENDAR_ID]?.busy || [];
  if (busy.length > 0) {
    return json({ ok: false, message: "Selected slot is no longer available." }, 409);
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
      reminders: { useDefault: true },
    }),
  });

  if (!eventResponse.ok) {
    throw new Error("Unable to create Google Calendar event");
  }

  const event = await eventResponse.json();
  return json({ ok: true, eventId: event.id, htmlLink: event.htmlLink });
}
