# AXLER8 Website

A separate static website for AXLER8, an automation systems agency.

## Preview

Open `index.html` in a browser, or serve this folder with any static web server.

## Positioning

AXLER8 builds CRM, automation, and integration systems that help businesses move faster with less manual work.

## Main CTA

Book free consultation.

## Booking system

The booking page is `booking.html`.

The frontend lets visitors choose a consultation type, weekday, time slot, and submit their details. The Cloudflare Pages Function at `functions/api/book-consultation.js` is prepared to:

1. authenticate with Google Calendar using a service account,
2. check if the selected slot is busy,
3. create a 30-minute calendar event, and
4. invite the visitor by email.

If Google Calendar variables are not configured yet, the form falls back to sending the request by email.

### Required Cloudflare environment variables

Set these in Cloudflare Pages, not in GitHub:

```text
GOOGLE_CLIENT_EMAIL
GOOGLE_PRIVATE_KEY
GOOGLE_CALENDAR_ID
BOOKING_TIMEZONE
```

Use `Asia/Manila` for Philippine Standard Time.

For local development, copy `.dev.vars.example` to `.dev.vars` and paste the real values there. `.dev.vars` is ignored by Git.
