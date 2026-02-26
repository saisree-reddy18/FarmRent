# FarmRent (demo)

This demo includes a static frontend and a small Node/Express API used to sync equipment, bookings, users, and chats across devices.

Quick start (development):

1. Start API server

```bash
cd server
npm install
npm start
```

Server will listen on `http://localhost:4000/api` by default.

2. Open the frontend

- Open `index.html` in your browser (or serve with a static server). The frontend will try to contact the API and sync data.

### OTP Configuration

The demo can send OTPs via email or SMS if the API server is configured:

* Set `SMTP_*` env vars (host/port/user/pass) to send emails.
* Set `TWILIO_SID`, `TWILIO_TOKEN`, and `TWILIO_FROM` to send SMS via Twilio.
* For development you can enable `FR_DEV_OTP=1` to get codes in responses.

Populate a user’s `contact` field with a phone number to also receive SMS.

Test flow to verify cross-device behavior:

- Open the app in two separate browser windows or two devices reachable to the same API.
- Sign up / sign in on both (server-backed signups produce a token saved in session).
- In Window A, add an equipment listing (Owner role) or book an equipment (Tenant role).
- Window B will pick up the change within a few seconds (frontend polls the API every ~3s).

Notes and next steps:

- This is a demo server with plaintext passwords and a simple token map — do NOT use in production. For production, add password hashing and proper auth (JWT/OAuth).
- You can deploy the `server/` folder (Dockerfile included) to any container host or simple Node host (Heroku, Railway, Cloud Run).
