# FarmRent API

Lightweight Express server used by the FarmRent demo. Provides endpoints for equipment and bookings with file-backed persistence.

> **Windows note:** PowerShell often blocks the `npx`/`npm` helper scripts (errors mentioning `npx.ps1` or `npm.ps1`).  If you see those, either run the commands from a plain **cmd.exe** window or temporarily relax the policy with:
>
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
> ```
>
> The frontend is just static HTML/JS; serve it over HTTP instead of opening `index.html` directly.  Two easy servers:
>
> ```powershell
> cd ..\   # back to farmrent-app root
> python -m http.server 8000          # works on Windows and macOS
> # or, if npx is permitted:
> npx http-server . -p 8000
> ```
>
> then open http://localhost:8000 in your browser.


Install and run:

```bash
cd server
npm install
npm start
```

API endpoints (base `http://localhost:4000/api`):

- `GET /equip` — list equipment
- `POST /equip` — add or replace equipment (payload must include `id`)
- `PUT /equip/:id` — update equipment
- `DELETE /equip/:id` — delete
- `GET /bookings` — list bookings
- `POST /bookings` — add booking (payload must include `id`)
- `PUT /bookings/:id` — update booking

Auth & Users (demo token sessions):

- `POST /signup` — create user. Payload: `{ name, email, pass, role?, contact? }`. Returns `{ token, user }`.
- `POST /login` — login. Payload: `{ email, pass }`. Returns `{ token, user }`.

Authentication:

- The server now issues JWTs for signup/login. The token should be sent in requests via the `Authorization: Bearer <token>` header. For backward compatibility the server still accepts `x-fr-token` header.
- Tokens are signed with a secret (`FR_SECRET` env var). Tokens expire after 7 days in this demo.

OTP Delivery:

- OTPs can be delivered via email or SMS when the appropriate env vars are set.
- For email delivery, configure SMTP using:
  - `SMTP_HOST`, `SMTP_PORT` (default 587), `SMTP_SECURE=true` for TLS
  - `SMTP_USER`, `SMTP_PASS` credentials
  - `SMTP_FROM` (sender address, defaults to SMTP_USER)
- For SMS via Twilio set `TWILIO_SID`, `TWILIO_TOKEN`, and `TWILIO_FROM` (Twilio phone number).
- Use `FR_DEV_OTP=1` to include the code in responses during development.

The `/api/request-otp` endpoint will send the code to the email provided and, if the user has a numeric `contact` field, also SMS that number. The server logs each OTP to console.

For signup flows there is also `POST /api/verify-otp-only` which simply checks the code without creating a user or issuing a token; this can be used by clients to pre-validate the OTP before submitting the signup form.

Chats:

- `GET /chats/:thread` — fetch messages for thread key (e.g. `equipId::tenantEmail`).
- `POST /chats/:thread` — add message. Payload: `{ text, from?, fromName? }`. If `x-fr-token` header provided, sender is resolved from session.

The server stores data in `db.json` in the same folder.
