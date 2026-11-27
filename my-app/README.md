# Orchid School

Orchid School is a responsive school-management UI built with the Next.js App Router. It groups the dashboard under `app/(dashboard)` so the shared sidebar and top navigation do not affect URLs. Shared controls use locally maintained shadcn/ui-style primitives in `components/ui`, with theme tokens and Tailwind CSS.

## Run locally

```bash
# Run from the workspace root (the directory containing this app folder).
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Routes

- `/` — overview
- `/students` and `/students/archived` — student directory
- `/biometrics`, `/biometrics/complete`, and `/biometrics/missing`
- `/contacts`, `/contacts/complete`, and `/contacts/missing`
- `/attendance`, `/attendance/today`, and `/attendance/reports`
- `/live-gate` — event monitor
- `/sms`, `/sms/sent`, `/sms/pending`, and `/sms/failed`
- `/alerts` — late arrival and check-in review
- `/settings`, `/settings/years`, `/settings/terms`, `/settings/classes`, `/settings/streams`, and `/settings/sections`
- `/devices` — device configuration and status
- `/audit-log` — administrative activity
- `/Dashboard/Analytics` — school attendance and record-completion analytics
- `/Dashboard/users` and `/Dashboard/users/[id]` — staff access directory and profiles
- `/biometrics/record` and `/contacts/record` — enrollment workflows

The student directory supports search, filters, CSV export, add/edit/archive/delete and student detail views backed by PostgreSQL. Staff user management at `/Dashboard/users` supports search, role/status filters, add/edit, and activation changes using the related staff-user and role tables. New staff accounts receive an SMS activation OTP and choose their own permanent password; forgotten passwords are recovered through a separate SMS OTP flow. Passwords and OTPs are stored as hashes, OTPs expire after five minutes, and administrative user changes require a Super Administrator. `/Dashboard/Analytics` reads attendance and active-student aggregates through `/api/analytics`; it reports recorded check-ins and does not infer absences from missing scans.

## Data and production readiness

The app uses a relational PostgreSQL schema for academic years, terms, classes, streams, sections, students, term enrollments, guardians, device mappings, attendance events, SMS notifications, staff users, roles, permissions, and audit logs. On a fresh database, the initializer seeds the permission catalog only; it does not add example school, student, attendance, SMS, or audit records. Student views, biometric/contact summaries, attendance reports, SMS, analytics, and audit history read from related database records. PostgreSQL transactions handle device ingestion and SMS queue claims. The worker does not receive provider delivery callbacks; a successful SMS provider response is recorded as `submitted`, not `delivered`.

### Configure Supabase PostgreSQL

1. Create a Supabase project, then copy its PostgreSQL connection string from **Project Settings → Database → Connection string**. For a serverless host such as Vercel, use Supabase's **Transaction pooler** connection string and port. Set it as `DATABASE_URL` in the server environment (or in the ignored `.env.local` for local development); replace the password placeholder, URL-encode special characters in the password, and include `sslmode=verify-full`. Keep this value private and never use a `NEXT_PUBLIC_` prefix.
2. Set `DATABASE_POOL_MAX=1` for serverless deployments such as Vercel; each serverless instance gets its own pool. You can use a larger value for local development. The app supplies Supabase's bundled root CA directly to the PostgreSQL driver and verifies the server certificate and hostname. The CA file and migration SQL are explicitly included in Next.js server output tracing for deployment. Run `npm install` and `npm run dev`; the app creates its PostgreSQL tables, indexes, view, and permission catalog automatically on first database access. Add years, terms, classes, streams, and sections under School Settings before enrolling students.
3. Keep Supabase credentials server-side. The app connects directly to Supabase PostgreSQL with the Node.js `pg` driver; it does not use Supabase Auth or the browser-facing Supabase API.
4. Register each device in `devices`, add its device-user-to-student mappings in `device_user_mappings`, and ensure its timezone is correct. Student placements and guardians are linked through `student_enrollments`, `streams`, `sections`, `student_guardians`, and `guardians`.
5. Configure the device adapter to POST the normalized event JSON shown below to `/api/device-events` over HTTPS with the `x-device-token` header. This is an application integration contract, not a claim that every Hikvision model can send this format directly.
6. Configure Yoola SMS using server-only `SMS_PROVIDER_URL`, `SMS_PROVIDER_TOKEN`, and an approved `SMS_PROVIDER_SENDER` in `.env.local`. The API key is sent only from server routes to Yoola's HTTPS REST API; it is never sent to the browser. New-user activation OTPs, password-recovery OTPs, and attendance notifications use this integration. Normal active-user sign-in uses the permanent password. Schedule POST requests to `/api/internal/sms/dispatch` with the `x-sms-dispatch-token` header; store that token in the scheduler's secret settings. Five delivery attempts are made with exponential backoff.
7. Check `/api/health` for PostgreSQL readiness.

Example normalized event:

```json
{
  "deviceKey": "main-gate",
  "eventId": "device-event-unique-id",
  "deviceUserId": "terminal-user-id",
  "occurredAt": "2026-10-19T08:02:00+03:00",
  "eventType": "fingerprint_check_in",
  "result": "verified"
}
```

The receiver retains verified, rejected, unknown-student and duplicate events; it records attendance and queues the guardian SMS in the same PostgreSQL transaction. Unknown students are never assigned by guess. Missing phone numbers create a blocked notification without losing attendance. A unique device/event key prevents delivery retries from creating repeated attendance, and one recognized check-in per student, school-local day, and event type is enforced. The current device endpoint expects the normalized contract above; the Hikvision-specific adapter cannot be safely completed until the exact terminal model, firmware, event subscription mode, and network setup are known. Hikvision's official SDK/download portal requires a Hikvision account for access: [official SDK/download portal](https://www.hikvision.com/en/support/download/sdk/).

The application connects to PostgreSQL from server-side Next.js [Route Handlers](https://nextjs.org/docs/app/api-reference/file-conventions/route); it requires Node.js 22.13 or later in the Node 22.x line and a reachable Supabase project.

### Deploy to Vercel

The project is an npm workspace. Push the repository to a Git provider, import it into Vercel, and set the project **Root Directory** to `my-app`. Use Node.js 22.13 or later in the Node 22.x line and the default Next.js build command (`npm run build`). The CA certificate and schema migration are included in the server bundles; Vercel does not need access to your local `.env.local`.

Add these as Vercel **Production** environment variables (do not use `NEXT_PUBLIC_` prefixes):

- `DATABASE_URL` — Supabase **Transaction pooler** URI with `sslmode=verify-full`.
- `DATABASE_POOL_MAX` — `1`.
- `SMS_PROVIDER_URL`, `SMS_PROVIDER_TOKEN`, `SMS_PROVIDER_SENDER`, and `SMS_DISPATCH_TOKEN` — copy the working server-side SMS settings from your local environment into Vercel's encrypted environment-variable settings.
- `DEVICE_WEBHOOK_TOKEN` — required only when connecting an attendance device.
- `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `GITHUB_REDIRECT_URI` — optional; required only for Super-Administrator GitHub sign-in.

Do not point Vercel Preview deployments at the production database; use separate Supabase credentials/database for Preview or leave those variables unset. After deployment, check `https://<your-domain>/api/health`. For a fresh database, create the first administrator with the production SMS provider configured; administrator setup is one-time. For the already-imported database, sign in with an existing staff account instead.

To enable automatic deployments, import the private GitHub repository through Vercel's **Add New → Project** flow (or connect it in **Project Settings → Git**), set **Root Directory** to `my-app`, and enable deployments for the desired branch. Vercel then creates Preview deployments for pull requests and Production deployments for the production branch. This uses Vercel's Git integration; no Vercel token or deployment secret is needed in this repository.

### Deploy to Netlify

Netlify runs Next.js proxy code as an Edge Function, where the Node.js PostgreSQL driver and the filesystem are unavailable. The proxy therefore stays free of Node-only modules and asks the `/api/internal/proxy-auth` route for the caller's session and setup state, so the same code deploys to Vercel and Netlify.

This repository is an npm workspace, so Netlify needs two settings:

- **Base directory** — leave it unset (the repository root), so dependency installation and the build command run where the root `package-lock.json` lives.
- **Package directory** — set it to `my-app`, so Netlify reads `my-app/netlify.toml`. All paths in that file are relative to the base directory.

`my-app/netlify.toml` sets the build command to `npm run build`, pins Node.js to the 22.x line, and sets `DATABASE_POOL_MAX` to `1`. Add the same environment variables as for Vercel (`DATABASE_URL`, `DATABASE_POOL_MAX`, the SMS settings, `DEVICE_WEBHOOK_TOKEN`, and the optional GitHub OAuth values) in **Site configuration → Environment variables**. After deployment, check `https://<your-domain>/api/health`.

### GitHub developer workflows

The repository includes GitHub Actions CI that runs `npm ci`, `npm run check`, and `npm run build` from `my-app` on pushes and pull requests. The lockfile lives at the repository root because this is an npm workspace, so the workflow caches it from there. Issue and pull-request templates remind contributors not to include credentials or real school records. GitHub repository access controls who can read or create issues and pull requests; keep the repository private and grant access only to trusted developers.

### Optional GitHub sign-in for Super-Administrators

1. Create a GitHub **OAuth App**. Set its Authorization callback URL to the exact deployed URL `https://<your-domain>/api/auth/github/callback`. Use a separate OAuth App for local development if needed.
2. Add the app's client ID, client secret, and that exact callback URL as server-only `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `GITHUB_REDIRECT_URI` settings in Vercel (and `.env.local` for local development). Never add the client secret to Git, GitHub Actions, browser code, or a `NEXT_PUBLIC_` variable.
3. Sign in to Orchid School using an existing Super-Administrator account, open **My Profile**, and link the intended GitHub account. The linked GitHub account can then sign in from the login page. Only active accounts with the Super-Administrator role are eligible; password and SMS-based sign-in remain available.

The application requests only the GitHub `read:user` scope, stores the stable GitHub account ID (not an OAuth token), validates a one-time state value on callback, and does not grant GitHub sign-in to other staff roles. Enable two-factor authentication on the GitHub account. The database migration is applied automatically at first database access.

The SMS dispatch route currently accepts authenticated **POST** requests. Vercel Cron invokes **GET** requests, and Vercel Hobby schedules are limited to once daily; that is too slow for attendance notifications. Use an external scheduler that can send a POST with `x-sms-dispatch-token`, or choose a plan/scheduler that supports the frequency you need. The device webhook likewise remains unavailable until `DEVICE_WEBHOOK_TOKEN` and the device adapter are configured.

### How Supabase works with this system

Supabase hosts the PostgreSQL database; the Next.js server connects to its Transaction pooler using `pg`. The browser never connects directly to the database: it calls the app's server routes, which read and write PostgreSQL. Supabase Auth is not used—the app stores its own staff accounts and hashed passwords in PostgreSQL, and sends one-time codes through the configured SMS provider. Vercel runs the web/server code, while Supabase keeps the data independently, so redeploying the app does not erase database records.

### Database backups

The selected backup policy is Supabase-managed daily backups with 30-day retention. Supabase's current managed-backup retention depends on the plan: 7 days on Pro, 14 days on Team, and 30 days on Enterprise. Therefore, 30-day retention requires an Enterprise subscription and must be enabled/confirmed in Supabase's project billing and backup settings; this repository cannot upgrade the plan or configure the dashboard on your behalf. Do not place database dumps or school data in GitHub.

### Staff sign-in and permissions

1. Configure the Yoola SMS API key and approved sender ID in the server environment. In local development only, set `OTP_DELIVERY_MODE=development` in `.env.local` to show the initial administrator sign-in code in the browser without SMS; this requires `NODE_ENV=development` and a localhost request. Staff activation and password recovery codes are never returned to the browser. Never enable development OTP mode in production.
2. On a new database, create the first administrator by POSTing a username, password (at least 12 characters), and phone to `/api/auth/setup`. In local development OTP mode, no phone is required and the code is returned to the local setup caller. This endpoint is available only until the first staff account is created.
3. Staff activate accounts and recover passwords with a six-digit code sent to their registered phone. Codes expire after five minutes, can be resent once per minute, and allow at most five verification attempts. Active staff sign in with their permanent password.
4. Configure module access in Roles & Permissions. Unchecked modules are locked in navigation and rejected by the page/API access checks. The Super-Administrator role always has full system access.
5. Passwords are stored as scrypt hashes. Staff session cookies are HTTP-only browser-session cookies with an eight-hour absolute expiry and a 60-second active-tab heartbeat lease. Closing every app tab stops heartbeats, so the server rejects the session after the lease expires; an open tab keeps other tabs in the same session active. Logout revokes the server session immediately, and failed password attempts are temporarily rate-limited.
6. The proxy in `proxy.ts` is the only place that enforces module permissions, for both pages and API routes. It must not import Node-only modules, because Netlify runs proxy code as an Edge Function where the PostgreSQL driver and the filesystem are unavailable. The proxy therefore asks `/api/internal/proxy-auth` — a Node.js route handler — for the caller's setup state and permissions, and that route is the only place where a session is read for access decisions. The route answers with `503` when the database cannot be reached, and the proxy turns a failed lookup into a "service temporarily unavailable" response rather than an internal server error. The route only ever reports on the session of the request that called it.

Do not treat a missing scan as an absence without school calendar and cutoff rules. Review deployment backups, provider-specific delivery callbacks, and privacy/retention policies before production use.

## Checks

```bash
npm run lint
npm run typecheck
npm run build
```
