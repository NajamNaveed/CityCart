# 17. Deployment

## 1. Purpose

This document defines how CityCart is developed, configured, deployed, monitored, and maintained across environments.

The deployment architecture should initially target a **$0/month setup using free tiers**, while keeping the application structured so individual services can be upgraded later without major architectural changes.

---

## 2. Deployment Architecture

Initial deployment:

```text
                    Internet
                       │
             ┌─────────┴─────────┐
             │                   │
        React Frontend       Node/Express API
          Vercel                Render
             │                   │
             └──────────┬────────┘
                        │
                   MongoDB Atlas
                     Database
                        │
                    Cloudinary
                   Media Storage
```

Recommended services:

* Frontend → Vercel
* Backend → Render
* Database → MongoDB Atlas
* Images/media → Cloudinary
* Source control → GitHub

Exact free-tier limits may change and should be verified before deployment.

---

## 3. Environments

CityCart should separate environments:

```text
Development
     ↓
Testing
     ↓
Production
```

At minimum:

```text
Local Development
Production
```

A dedicated staging environment can be introduced later.

Production must never share unrestricted development secrets or databases.

---

## 4. Frontend Deployment

The React/Vite frontend should be deployed as a static web application.

Build command:

```text
npm run build
```

Typical output:

```text
dist/
```

The deployment platform should serve the generated frontend.

Frontend environment variables should contain only values safe for browser exposure.

Example:

```text
VITE_API_URL
```

Never place:

```text
JWT secrets
Database credentials
Cloudinary private credentials
Admin secrets
```

in frontend environment variables.

---

## 5. Backend Deployment

The backend is a Node.js/Express application.

Typical production flow:

```text
Install dependencies
        ↓
Start server
        ↓
Load environment variables
        ↓
Connect MongoDB
        ↓
Start HTTP server
        ↓
Initialize required services
```

The backend should listen on the port provided by the hosting platform.

Example:

```text
process.env.PORT
```

Do not hardcode a production port.

---

## 6. Database Deployment

MongoDB Atlas is the initial database provider.

Production configuration must use:

* Separate database credentials.
* Restricted database access.
* Secure connection string.
* Appropriate network access rules.
* Backups according to the selected Atlas plan.

The production database must never be committed to Git.

User email uniqueness is scoped by `accountType`; existing databases require an account-type backfill and compound-index migration before deploying this change. The development helper is `npm run sync-indexes --prefix server` and refuses production. Production must use a reviewed migration plan: backfill roles to account types, confirm no duplicate `(accountType, email)` values, then replace the global email index with the compound unique index without running the broad development sync script.

---

## 7. Cloudinary

Cloudinary is used for product, brand, and other supported media.

The backend should handle upload authorization.

Clients should not receive unrestricted server credentials.

Sensitive Cloudinary credentials belong only in backend environment variables.

---

## 8. Environment Variables

Example backend variables:

```text
NODE_ENV
PORT
MONGODB_URI
JWT_SECRET
JWT_EXPIRES_IN
CLIENT_URL
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
BREVO_API_KEY
EMAIL_FROM
EMAIL_FROM_NAME
EMAIL_VERIFY_TTL_HOURS
PASSWORD_RESET_TTL_MINUTES
```

Transactional email (verification + password reset, docs/06 §4–§5). Render's
free plan blocks outbound SMTP, so the server posts to Brevo's **HTTPS API**
(global `fetch`, no extra package):

1. Create a free Brevo account and verify the sender address (or domain) under
   *Senders, Domains & Dedicated IPs*.
2. Copy an API key from *SMTP & API → API Keys* into `BREVO_API_KEY` on Render.
3. Set `EMAIL_FROM` to that verified sender and `EMAIL_FROM_NAME=CityCart`.
4. Leave the TTLs at their defaults (24 hours / 60 minutes) unless needed; they
   are clamped to 1–168 hours and 5–1440 minutes.

Without these values the API still starts and sign-up still works; in
development the email link is printed to the server log, and in production the
send is reported as unavailable (the user can request a new link). Links are
stored hashed in MongoDB with a TTL index, so expiry needs no worker and no
paid Render plan.

The online payment gateway was removed in v3 (docs/10 §29, docs/24 §5.7).
There are no payment-provider variables to configure; customers pay at the door
and the rider records the collection.

Future:

```text
EMAIL_API_KEY
SMS_API_KEY
SENTRY_DSN
```

Environment files containing secrets must not be committed.

---

## 9. Git Strategy

Recommended branches:

```text
main
develop
feature/*
fix/*
```

For a small team, the workflow may initially be:

```text
feature branch
      ↓
Pull Request
      ↓
Tests
      ↓
Code Review
      ↓
main
```

Production deployment should be associated with a known Git commit.

---

## 10. CI/CD

Future CI/CD should automatically perform:

```text
Checkout
   ↓
Install dependencies
   ↓
Lint
   ↓
Run tests
   ↓
Build frontend
   ↓
Build/verify backend
   ↓
Deploy
```

GitHub Actions can be used for CI.

Deployment providers can handle the final deployment step.

---

## 11. Production Configuration

Production should use:

```text
NODE_ENV=production
```

Production configuration must include:

* Secure cookies.
* HTTPS.
* Restricted CORS.
* Helmet.
* Rate limiting.
* Production database.
* Production secrets.
* Appropriate logging.
* Error monitoring.

Development settings must not accidentally be deployed to production.

---

## 12. CORS

Backend CORS should explicitly allow the production frontend origin.

Example concept:

```text
Allowed Origin:
https://citycart.example
```

Do not use unrestricted:

```text
*
```

for authenticated production requests unless there is a documented reason.

---

## 13. Cookies and Authentication

CityCart uses JWT authentication with HTTP-only cookies.

Production cookies should use appropriate security settings, including:

```text
httpOnly
secure
sameSite
```

The exact `sameSite` configuration must match the frontend/backend deployment architecture.

JWT secrets must be stored only as server-side environment variables.

---

## 14. API URL Configuration

Frontend API requests should use an environment-based API URL.

Example:

```text
VITE_API_URL=https://api.citycart.example/api/v1
```

The frontend must not hardcode development URLs throughout the application.

---

## 15. Domain Structure

A possible production structure:

```text
www.citycart.example
        ↓
Frontend

api.citycart.example
        ↓
Backend API
```

The actual domain may differ.

The architecture should support separate frontend and API origins.

---

## 16. Health Checks

The backend should expose a basic health endpoint.

Example:

```http
GET /health
```

Possible response:

```json
{
  "success": true,
  "status": "healthy"
}
```

Health checks should not expose:

* Database credentials.
* Environment secrets.
* JWT secrets.
* Internal sensitive information.

---

## 17. Logging

Production logs should help diagnose failures without exposing sensitive information.

Log:

* Application errors.
* Important system events.
* Request failures.
* Authentication/security events where appropriate.
* Database connection problems.

Never log:

```text
Passwords
JWT secrets
Raw authentication tokens
Payment secrets
Private credentials
```

---

## 18. Error Handling

Production responses should avoid exposing internal stack traces.

Development may provide detailed debugging information.

Production should return controlled errors such as:

```json
{
  "success": false,
  "message": "Something went wrong."
}
```

Detailed technical information belongs in secure server logs.

---

## 19. Monitoring

Initial monitoring can use the capabilities provided by the deployment platforms.

Future additions may include:

* Sentry.
* Uptime monitoring.
* Application metrics.
* Database monitoring.
* Error tracking.
* Performance monitoring.

Monitoring infrastructure should be introduced when the application's usage justifies it.

---

## 20. Backups and Recovery

The production database should have a documented backup strategy.

Recovery planning should define:

* Backup frequency.
* Retention.
* Restoration process.
* Recovery Point Objective (RPO).
* Recovery Time Objective (RTO).

The team must periodically verify that backups can actually be restored.

A backup that has never been tested should not be assumed reliable.

---

## 21. Deployment Rollback

If a production deployment introduces a serious issue:

```text
Current Version
      ↓
Problem Detected
      ↓
Rollback
      ↓
Previous Stable Version
```

Git history and deployment platform version history should make rollback possible.

Database schema/data changes require additional migration planning before rollback.

---

## 22. Database Changes

MongoDB schema changes must be backward-aware where possible.

Before making a breaking database change:

1. Identify affected models.
2. Identify existing production data.
3. Plan migration.
4. Test migration.
5. Backup production data if appropriate.
6. Deploy migration safely.
7. Verify application behavior.

AI agents must never run destructive production database operations without explicit authorization.

---

## 23. Security Checklist

Before production deployment:

```text
[ ] HTTPS enabled
[ ] Secure cookies configured
[ ] JWT secret configured
[ ] Production MongoDB credentials configured
[ ] CORS restricted
[ ] Helmet enabled
[ ] Rate limiting enabled
[ ] Input validation enabled
[ ] File upload restrictions enabled
[ ] Debug mode disabled
[ ] Secrets removed from source code
[ ] Sensitive logs removed
[ ] Admin credentials secured
[ ] Tenant isolation tested
[ ] RBAC tested
```

---

## 24. Deployment Testing

Before production release:

```text
Unit Tests
    ↓
Integration Tests
    ↓
API Tests
    ↓
Security Tests
    ↓
Frontend Build
    ↓
Production Configuration Check
    ↓
Deployment
    ↓
Smoke Tests
```

Smoke tests should verify:

* Website loads.
* API responds.
* Login works.
* Product browsing works.
* Cart works.
* Checkout works.
* Brand dashboard loads.
* Authentication remains secure.

---

## 25. Free-Tier Strategy

The initial architecture should minimize recurring infrastructure cost.

Initial services:

```text
GitHub       → Source Control
Vercel       → Frontend
Render       → Backend
MongoDB Atlas → Database
Cloudinary   → Media
```

Free-tier limits must be monitored.

If traffic exceeds free-tier capabilities, individual components can be upgraded independently.

---

## 26. Scalability

The initial deployment is intentionally simple.

Future scaling may include:

```text
CDN
Load Balancer
Multiple API Instances
Redis
Background Workers
Message Queue
Dedicated Search
Dedicated Analytics
Separate Services
```

These should only be introduced when justified by actual requirements.

---

## 27. AI Deployment Rules

AI agents must:

1. Never expose secrets.
2. Never commit `.env` files containing credentials.
3. Never deploy destructive database changes without approval.
4. Preserve environment separation.
5. Verify production configuration.
6. Run required tests before deployment.
7. Avoid changing infrastructure without documenting the reason.
8. Never disable security controls to make deployment work.

---

## 28. Acceptance Criteria

Deployment is complete when:

* Frontend can be deployed independently.
* Backend can be deployed independently.
* MongoDB production environment is configured securely.
* Cloudinary media storage works.
* Environment variables are correctly separated.
* HTTPS and secure authentication work.
* CORS is restricted.
* Health checks work.
* Production errors do not expose sensitive internals.
* Backups/recovery strategy is documented.
* Rollback is possible.
* Deployment tests pass.

---

## 29. Source of Truth

This document defines the authoritative deployment requirements for CityCart.

Any infrastructure change must preserve:

* Security.
* Environment isolation.
* Data integrity.
* Tenant isolation.
* Recoverability.
* Reproducibility.

---

# 15. Current Deployment Wiring (October 2026)

The repository now carries the deployment plumbing described above:

* `client/vercel.json` — proxies `/api/*` and `/socket.io/*` to the Render
  host written in the file (today `https://citycart-n51q.onrender.com`) and
  serves `index.html` for deep links (`/product/:id`, `/brand/orders/:id`,
  a page refresh). Vercel's `rewrites` do **not** expand environment
  variables, so a different Render host means editing this file and
  redeploying the client; `RENDER_API_URL` in Vercel is not read by it.
* `render.yaml` (repository root) — Render Blueprint for the API: Node
  runtime, `server/` as root, `npm ci` build, `npm start` launch,
  `/health` as the health check. Secrets are marked `sync: false` — Render
  prompts for them when the Blueprint is applied.
* Root `package.json` — convenience scripts (`npm run build`, `npm test`,
  `npm run lint`, `npm run dev:server` / `dev:client`) that delegate into
  `client/` and `server/`, so CI and deployment hooks need no path juggling.
* Both packages pin `engines.node >= 22` (matches the server's runtime
  requirement and the CI runner).

Remaining manual steps when deploying (nothing here needs code changes):

1. Push the repository to GitHub; in Vercel create a project rooted at
   `client/` (framework: Vite, build `npm run build`, output `dist`) and
   leave `VITE_API_URL` EMPTY. Check that `client/vercel.json` points at the
   Render host you actually use (see the proxy section below).
2. In Render, apply the Blueprint and fill in `MONGODB_URI` (Atlas),
   `JWT_SECRET`, `CLIENT_URL` (the Vercel URL), `BREVO_API_KEY` and
   `EMAIL_FROM` (a Brevo-verified sender). Without the last two, verification
   and reset emails cannot be delivered in production.
3. Render's auto-deploy is `true` in the Blueprint. Vercel may deploy on
   push or only through `vercel --prod` / the CI deploy hook, depending on
   the project's Git settings; either way, deploy the client after the API
   is healthy.

### Cross-domain cookies (October 2026 update)

The first production deployment showed `Authentication required.` on every
login: the client on `*.vercel.app` and the API on `*.onrender.com` are
separate domains, so the auth cookie the API set was a **third-party
cookie**, which modern browsers refuse to store — even with
`SameSite=None; Secure`.

Two fixes ship together; use BOTH:

1. **Same-origin proxying (the durable fix).** `client/vercel.json` proxies
   `/api/*` and `/socket.io/*` to the API, so the browser only ever talks to
   the Vercel domain and the auth cookie is first-party (works in Safari
   too). Setup:
   - Check that the destination in `client/vercel.json` is the Render API
     host you use (e.g. `https://citycart-n51q.onrender.com`), and set
     `VITE_API_URL` to EMPTY in Vercel (the client then calls `/api/v1`
     same-origin). Vercel cannot substitute environment variables into
     `rewrites`, so the host lives in that file.
   - **Turn OFF Vercel Deployment Protection** (Settings → Deployment
     Protection) — with it on, every request 302s to a Vercel login page,
     including API calls.
2. **SameSite=None in production** — `config/cookie.js` already defaults to
   it (`COOKIE_SAMESITE` overrides). Necessary for direct cross-domain
   calls; harmless with the proxy.

Known limitation with direct (un-proxied) cross-domain calls: Safari blocks
third-party cookies entirely, so logins fail there regardless of SameSite.
The same-origin proxy removes the problem instead of fighting it.

### Blank page after the first second (October 2026 fix)

Symptom: the deployed site paints for less than a second, then goes white.

Cause: `/api/*` was not reaching Render. A wrong host in
`client/vercel.json` (or a request that the proxy does not match) makes the
rewrite fall through to the SPA catch-all, so `/api/v1/products` answered
**200 with `index.html`**. The client treated that as JSON, read
`res.data.products` (`undefined`), then called `products.map(...)` during
render; React unmounted the tree on the thrown error and left a blank page.

Three guards now ship with the client:

* `src/services/api.js` rejects any API response whose body is HTML, so
  callers take their error path instead of reading undefined fields.
* The landing data readers (`Home`, `useBrands`, `useRatings`) only accept
  arrays/objects and fall back to empty states.
* `src/components/ErrorBoundary.jsx` wraps the app, so any future render
  error shows a reload card instead of a blank page.

If the blank page ever reappears, check in this order: the host inside
`client/vercel.json` is the live Render host (no `/api/v1` suffix),
`VITE_API_URL` is empty, Deployment Protection is off, and the API answers
`https://<render-host>/health` directly. A browser devtools Network tab
showing `text/html` for `/api/v1/*` confirms a routing problem, not a
React problem.

The CI workflow's gated deploy job (`.github/workflows/ci.yml`) triggers
Render and Vercel deploy hooks after all tests pass — add
`RENDER_DEPLOY_HOOK` and `VERCEL_DEPLOY_HOOK` as GitHub repo secrets, then
disable both platforms' Git auto-deploy so CI is the only deploy trigger.

---

## 30. Marketplace v2 release runbook (November 2026)

Phase 7 ships the three-app marketplace: the website, the shopper app, the Staff app and the Delivery app, all against one API. Release in this order; do not skip the database step.

### 30.1 Environment matrix

| Where | Variable | Value / note |
|---|---|---|
| Render | `NODE_ENV` | `production` |
| Render | `MONGODB_URI` | the **new** Atlas cluster (fresh v2 database) |
| Render | `JWT_SECRET` | long random string; never reused from development |
| Render | `CLIENT_URL` | the Vercel production URL |
| Render | `CLOUDINARY_*` | optional; private proof/return photos need all three |
| Render | `PUSH_ENABLED`, `EXPO_ACCESS_TOKEN` | optional; push is off without them |
| Vercel | `VITE_API_URL` | **empty** — the client calls `/api/v1` same-origin |
| Vercel | (file) `client/vercel.json` | destination must be the live Render host |
| Vercel | Deployment Protection | **off**, otherwise API calls redirect to a Vercel login |
| EAS | `EXPO_PUBLIC_API_URL` | the Render URL, same value for all three apps |
| EAS | `eas projectId` | created per app by `npx eas-cli init` (writes `extra.eas.projectId`) |

`EXPO_PUBLIC_*` values are baked into the app at build time: change them in EAS and rebuild, not in the phone.

### 30.2 Bring up the data

1. Create a **new, empty** Atlas cluster/database (v2 is a fresh database; no migration of old data).
2. Run the demo seed against it from the repository, with the fresh connection string:
   ```bash
   cd server
   MONGODB_URI="mongodb+srv://..." npm run seed:demo
   ```
   The script refuses a non-empty database and refuses `NODE_ENV=production`. Do **not** use `--reset` against a database that matters.
3. Point Render's `MONGODB_URI` at the same database and deploy the API.

### 30.3 API first, then website

1. Deploy the API; wait for `GET /health` to answer `{ "success": true }`.
2. Check `POST /auth/login` (admin) through the Render URL; confirm the cookie is `HttpOnly` and `Secure`.
3. Deploy the client with `VITE_API_URL` empty. In the browser devtools, `/api/v1/...` must be same-origin, return JSON (never `text/html`), and login must survive a page refresh.
4. If the API host changed, edit `client/vercel.json` and redeploy; Vercel does not read `RENDER_API_URL`.

### 30.4 The three APKs

```bash
cd mobile     && npx eas-cli init && npm run build:android:preview   # com.citycart.app
cd ../partner && npx eas-cli init && npm run build:android:preview   # com.citycart.staff
cd ../delivery && npx eas-cli init && npm run build:android:preview  # com.citycart.delivery
```

Each app has its own package name, icon and sign-in door (`/auth/mobile`, `/auth/staff/login`, `/auth/delivery/login`). A token from one app is refused by the other two (`403 WRONG_APP`).

Release is complete when:

* the website loads and a customer can sign in, browse, order and pay cash;
* the shopper app signs in as `CUSTOMER` and sees the same area and orders;
* the Staff app signs in as `BRAND_EMPLOYEE`/`PICKER`, and the Returns tab receives a door return;
* the Delivery app signs in as `RIDER`, completes a delivery with refused lines, and the customer, brand and admin screens show the same final total;
* the walkthrough in `22-marketplace-v2-plan.md` §7 passes on the freshly seeded data.

Rollback: redeploy the previous Render and Vercel deployments. The database is additive for this release (new `Return` collection and order fields); keeping the old deployment against the new data is safe, but the old code will not show returns.

### 30.5 What an AI agent may and may not do here

The repository side (tests, build, config, docs, seed scripts) is automated. **Deploying to Render/Vercel and building with EAS are owner actions**: they need credentials, cost build minutes, and touch shared/production systems. An agent must not run them without explicit approval.
