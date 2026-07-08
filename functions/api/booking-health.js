function present(value) {
  return typeof value === "string" && value.trim().length > 0;
}

export async function onRequestGet({ env }) {
  const oauthReady =
    present(env.GOOGLE_OAUTH_CLIENT_ID) &&
    present(env.GOOGLE_OAUTH_CLIENT_SECRET) &&
    present(env.GOOGLE_OAUTH_REFRESH_TOKEN);
  const serviceAccountReady = present(env.GOOGLE_CLIENT_EMAIL) && present(env.GOOGLE_PRIVATE_KEY);

  return new Response(
    JSON.stringify(
      {
        ok: true,
        authMode: oauthReady ? "oauth" : serviceAccountReady ? "service-account" : "not-configured",
        environment: {
          GOOGLE_OAUTH_CLIENT_ID: present(env.GOOGLE_OAUTH_CLIENT_ID),
          GOOGLE_OAUTH_CLIENT_SECRET: present(env.GOOGLE_OAUTH_CLIENT_SECRET),
          GOOGLE_OAUTH_REFRESH_TOKEN: present(env.GOOGLE_OAUTH_REFRESH_TOKEN),
          GOOGLE_CLIENT_EMAIL: present(env.GOOGLE_CLIENT_EMAIL),
          GOOGLE_PRIVATE_KEY: present(env.GOOGLE_PRIVATE_KEY),
          GOOGLE_CALENDAR_ID: present(env.GOOGLE_CALENDAR_ID),
          BOOKING_TIMEZONE: present(env.BOOKING_TIMEZONE),
        },
      },
      null,
      2,
    ),
    {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    },
  );
}
