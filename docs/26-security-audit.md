# 26 — Internal Security Audit and Release Hardening

Status: **internal audit completed 2026-11-09.** This is the Phase 9 deliverable
of docs/24 §8.2: an independent, written internal test report mapped to OWASP
ASVS Level 2. It does not replace an external penetration test; the owner has
not commissioned one (see §9).

This document is evidence, not a specification. `06-authentication-and-security.md`
remains the authoritative security specification; `17-deployment.md` §31 holds the
operations runbook this report recommends.

---

## 1. Scope and method

| Item | Value |
|---|---|
| Target | CityCart API, customer website, shopper app, Staff app, Delivery app |
| Environment | Repository at branch `new` (baseline `1bcead7` plus the Phase 9 changes) |
| Data | Test doubles and in-memory models only; **no production database was touched** |
| Method | Source review, route inventory, authorization fuzzing, abuse-path tests, dependency audit, configuration review |
| Out of scope | External pen test, native binary analysis, social engineering, volumetric DDoS, physical-device pass (docs/25) |
| Auditor | AI agent under AGENTS.md rules, reviewed by the owner |

The route inventory is generated from the real Express router, not from a
hand-written list, so the test fails if a guard is removed or a public route is
added without a decision (`server/tests/authorizationMatrix.test.js`).

Current inventory: **277 routes — 236 guarded, 41 intentionally public**
(125 GET, 88 POST, 42 PATCH, 19 DELETE, 3 PUT).

---

## 2. Findings

| ID | Severity | Area | Status |
|---|---|---|---|
| SEC-26-01 | High | CSRF on cookie-authenticated writes | **Fixed** |
| SEC-26-02 | Medium | Public brand/storefront field disclosure | **Fixed** |
| SEC-26-03 | High advisory / low exploitability | `decode-uri-component` in the Expo apps | **Open — accepted, see §9** |
| SEC-26-04 | Moderate (dev only) | `nodemon`/`minimatch` in the server toolchain | **Accepted (dev only)** |

### SEC-26-01 — Cross-site request forgery on unsafe methods

**Why it mattered.** In production the website and the API are on different
domains, so the authentication cookie must be `SameSite=None; Secure`. CORS stops
a foreign page from *reading* responses, but it does not stop a foreign page from
*submitting* a form or `fetch` that carries the cookie. Every state-changing
endpoint (orders, addresses, billing claims, admin actions) was therefore
reachable from a malicious third-party page.

**Fix.** `server/src/middleware/csrfGuard.js`, mounted immediately after the
cookie parser in `server/src/app.js`. For `POST`, `PUT`, `PATCH` and `DELETE`:

* an `Origin` header must be in the CORS allow-list (`config/cors.js`);
* otherwise a `Referer`, when present, must resolve to an allowed origin;
* requests with neither header are allowed, because native apps and
  server-to-server callers do not emit them and cannot be driven by a browser.

A blocked request receives `403 { code: 'CSRF_ORIGIN' }`.

**Residual risk.** A browser too old to send `Origin` on a cross-site form POST
would bypass the check. All browsers in CityCart's support matrix send it.
Documented in docs/06 §25.

**Tests.** `server/tests/hardening.test.js` (evil Origin, allowed Origin, absent
Origin, Referer fallback, safe GET, `Origin: null`).

### SEC-26-02 — Public brand responses leaked internal fields

**Why it mattered.** `GET /brands`, `GET /brands/:id` and
`GET /brands/:id/storefront` returned the whole brand document to anonymous
callers, including `billingStatus`, `billingGraceUntil`, `billingOverride`,
`terminationReason`, `terminatedBy`, `accessEndsAt`, `contact` and `settings`.
A frozen or terminated seller's commercial standing was public, and Mixed
`contact`/`settings` data could carry internal values.

**Fix.** `server/src/services/brand.service.js` now allow-lists public fields
(`_id`, `name`, `slug`, `description`, `logo`, `coverImage`, `cityId`, `status`)
and `storefront.service.js` reuses the same serializer. This matches the
allow-list already used for public service providers.

**Tests.** `server/tests/brands.test.js` (detail and list exposure),
`server/tests/marketplace.test.js` (storefront exposure).

### SEC-26-03 and SEC-26-04

See §8 (dependencies) and §9 (accepted risks).

### Observation (no change)

`adminServiceProvider.routes.js` guards with `requireRole(SUPER_ADMIN)` while the
other admin areas use `requireAdminPermission`. Provider approval is a
super-admin-only decision in docs/02 and docs/24 D15, so this is intentional; it
is recorded here so a future reader does not "fix" it into a permission that
admin partners can hold.

---

## 3. OWASP ASVS 4.0 Level 2 map

Status vocabulary: **Met** — implemented and tested; **Met (ops)** — the code is
ready but the control depends on an owner deployment action; **Planned** — an
approved but not yet built control.

| Chapter | Status | Evidence |
|---|---|---|
| V1 Architecture | Met | Modular monolith, tenant boundary in middleware, threat model in docs/06, no client-trusted ownership |
| V2 Authentication | Met | bcrypt cost 10, generic login/reset messages, email verification TTL 24 h, reset token TTL 60 min and single-use, `passwordVersion` revocation, 10 attempts / 15 min per IP |
| V3 Session Management | Met | HttpOnly + Secure + `SameSite=None` cookie in production, 8 h staff session, 7 d shopper session, fresh DB user lookup per request, app-mark tokens (`WRONG_APP`/`WEB_ONLY`), logout clears cookie |
| V4 Access Control | Met | 236/236 guarded routes refuse signed-out and malformed tokens; role, permission, tenant and ownership checks; cross-role matrix; invoice/claim IDOR tests |
| V5 Validation and Encoding | Met | Zod on every external input, ObjectId validation, `escapeRegex`, parameterised Mongoose queries, 100 kb JSON body, React escaping, no unsanitised `dangerouslySetInnerHTML` in app code |
| V6 Stored Cryptography | Met | bcrypt only for passwords; JWT signed with server secret; no secrets in client bundles; Cloudinary signing server-side |
| V7 Error Handling and Logging | Met | Global error handler with sanitised responses; request logger with redaction; no stack traces in production; audit log for privileged actions |
| V8 Data Protection | Met | Public allow-lists for brands, settings, providers and offerings; block centre (not provider pin) in public discovery; private Cloudinary proofs and receipts via expiring signed links |
| V9 Communication | Met (ops) | HTTPS termination on Render/Vercel; HSTS via Helmet; `trust proxy` in production. Owner must confirm TLS on custom domains |
| V10 Malicious Code | Met | No dynamic code execution or user-supplied HTML; uploads restricted to `jpg,png,webp` |
| V11 Business Logic | Met | Backend-authoritative prices, totals, commission, invoice/claim state, freeze ladder; idempotent commission entries; atomic inventory operations |
| V12 Files and Resources | Met | Signed uploads into server-derived folders, format allow-list, authenticated proofs, server-derived receipt path with traversal check |
| V13 API and Web Service | Met | REST, JSON, `Authorization`/cookie only, per-route auth, CORS allow-list, CSRF guard, rate limits, 404/error envelope |
| V14 Configuration | Met (ops) | Helmet, CORS, cookie flags, env-only secrets, restricted-access mode, `.env.example` only. Secret rotation and dependency policy in docs/17 §31 |

**Planned hardening (not an ASVS L2 blocker):** email OTP for privileged web
accounts (docs/24 D22). Rate limits and generic errors are the current control
against credential stuffing.

---

## 4. Authorization fuzzing

`server/tests/authorizationMatrix.test.js` — 20 tests:

* Walks the mounted router and asserts the public list is exactly the 41 declared
  endpoints; any new unguarded route fails the suite.
* Sends every one of the 236 guarded routes with no session and with
  `Bearer not-a-real-token`; collects any non-401 answer and asserts the failure
  list is empty.
* Rejects an empty `Bearer` header (no silent cookie fallback) and a
  workspace-chooser token used as a session.
* Enforces native app marks: Staff token on a shopper account → `403 WRONG_APP`,
  Delivery token on a shopper → `403 WRONG_APP`, shopper token on a brand owner
  → `403 WEB_ONLY`.
* Cross-role denials: customer → admin users, customer → brand profile, brand
  admin → admin users, brand admin → picker, rider → employees, rider → brand
  analytics, provider → brand orders, provider → admin users.

Domain suites add the tenant and ownership cases: `tenant`, `authorization`,
`workspace`, `session`, `mobileAuth`, `appAuth`, `restrictedAccess`,
`adminPartnerAuth`, `adminUsers`, `serviceBooking`, `serviceDirectChat`,
`chatLimits`, `reviews`, `receipts`, `paymentProofs`, `billing`.

Specific later-phase risks required by docs/24 §8.2:

| Risk | Coverage |
|---|---|
| Booking IDOR | `serviceBooking.test.js` (customer ↔ provider ↔ other customer) |
| Provider block bypass | Provider profile/block rules tested in `serviceProvider.test.js`; one block per calendar month enforced server-side |
| Chat access | `chatAccess` middleware + `chat.test.js`, `serviceDirectChat.test.js`, `chatLimits.test.js` |
| Review eligibility | `reviews.test.js` (delivered order, one review per booking, ownership) |
| Invoice/claim tampering | `billing.test.js` (seller-scoped fetch, cross-seller 404, receipt path 422 `RECEIPT_NOT_YOURS`, traversal rejected) |
| Freeze bypass | `billing.test.js` freeze ladder; frozen tenants excluded from discovery |
| Commission manipulation | `billing.test.js` computes from server data; client amounts rejected |
| Service media access | Signed private URLs, folder derived from tenant |
| Ranking manipulation | `serviceRanking.test.js`; weights are server configuration |

---

## 5. Abuse-path and input tests

* Injection: malicious Mongo operators, invalid ObjectIds, malformed pagination
  and sort values are rejected by validators (`hardening.test.js`, `products`,
  `orders`, `catalogBrowse`).
* Enumeration: login failures all return `GENERIC_LOGIN_ERROR`; password reset
  answers the same message whether or not the address exists
  (`auth.test.js`, `emailAuth.test.js`).
* Uploads: server-derived folders, three allowed formats, private proofs,
  expiring links, cross-seller receipt folders refused (`uploads.test.js`,
  `billing.test.js`).
* Rate limits (production values):

| Limiter | Window | Limit | Key |
|---|---|---|---|
| API-wide | 15 min | 1000 | IP |
| Auth, registration, recovery, applications | 15 min | 10 | IP |
| Payment status/refund writes | 15 min | 30 | IP |
| Chat send | 1 min | 20 | signed-in user |
| Chat start | 1 h | 15 | signed-in user |
| Rider location | 1 min | 12 | signed-in rider |

* Body size: 100 kb JSON. Uploads never pass through the API as binary; the API
  signs a direct-to-Cloudinary upload.
* Socket.IO: handshake requires a valid, DB-fresh, non-revoked token; the room
  is derived from the verified user id, so a client cannot subscribe to another
  user's channel (`src/sockets/index.js`).

---

## 6. Load and abuse testing

**Not executed.** There is no staging environment in this repository and the
audit must not point load at production. Unit CI exercises the limiter logic with
limits disabled (`NODE_ENV=test`), not throughput.

Procedure for the owner before public launch (proposed thresholds require owner
approval):

1. Deploy a staging API with a seeded database and production-like rate limits.
2. From an external host, drive read traffic on discovery, storefront, product
   and provider pages; then a checkout and booking mix at a small write rate.
3. Confirm p95 latency, zero 5xx, correct 429s (auth after 10/15 min, chat after
   20/min, rider location after 12/min), and stable memory over one hour.
4. Repeat with malformed JSON, oversized bodies (>100 kb), deep pagination and
   rapid websocket reconnects.
5. Record results here and attach the run configuration.

Do not run a volumetric test from the same network as production; use an approved
external load service and warn the host.

---

## 7. Backup and restore drill

**Not executed.** The agent has no access to the production Atlas cluster and
must not create or delete databases without owner authorisation.

Procedure to run (owner, on a scratch cluster):

1. Take an Atlas snapshot or `mongodump` of the production database.
2. Restore into a **new empty** scratch database with `mongorestore`.
3. Verify document counts for users, brands, stores, products, orders, payments,
   bookings, invoices and audit entries against the source.
4. Confirm indexes exist (especially unique employee memberships, geo indexes,
   TTL indexes on auth tokens) with `db.collection.getIndexes()`.
5. Start the API against the scratch database and exercise login, storefront,
   checkout and one seller invoice view.
6. Record duration and mismatches; update docs/17 §20 with the confirmed RPO/RTO.

Treat backups as unverified until this drill passes.

---

## 8. Dependencies

Commands: `npm audit --omit=dev` in `server/`, `client/`, `mobile/`, `partner/`,
`delivery/`.

| Package | Production findings before | After non-breaking fixes | Note |
|---|---|---|---|
| server | 0 | 0 | dev tree: 20 (3 low, 17 moderate) via `nodemon`→`minimatch`; dev only |
| client | 0 | 0 | — |
| mobile | 17 (1 low, 9 mod, 7 high) | 7 (4 mod, 3 high) | residual high advisories all `decode-uri-component` |
| partner | 15 (1 low, 7 mod, 7 high) | 7 (4 mod, 3 high) | same |
| delivery | 15 (1 low, 7 mod, 7 high) | 7 (4 mod, 3 high) | same |

`npm audit fix` (no `--force`) was applied to all three apps; the full install
was restored afterwards (the omit-dev run prunes local dev modules). All three
apps were then linted, tested and bundled for Android:

| App | Lint | Tests | Android export |
|---|---|---|---|
| mobile | clean | 48 suites / 507 tests | 3.7 MB Hermes bundle |
| partner | clean | 17 suites / 191 tests | success |
| delivery | clean | 9 suites / 160 tests | success |

Remaining highs are the `decode-uri-component` DoS advisories pulled by
`expo-router@57 → query-string@7`. The only published fix is
`expo-router@58` (Expo SDK 58), a breaking SDK upgrade that is out of Phase 9
scope. `npm audit fix --force` proposes downgrading Expo to 52; **never run it**.
See §9.

Server and client after the Phase 9 change set: **67 server suites / 1690 tests
pass**; client lint clean and production build succeeds.

Policy going forward (docs/17 §31): review monthly, patch high findings within
7 days, never take a major upgrade inside a release phase without approval, and
record accepted risk here.

---

## 9. Accepted risks and release gate

| # | Risk | Why accepted | Review trigger |
|---|---|---|---|
| 1 | `decode-uri-component` DoS in Expo apps | Requires a malformed percent-encoded URL; impact is a stalled JS thread on the victim's own device; no data access or server impact; fix is an SDK 58 upgrade | First SDK 58 migration, or if a native crash is observed |
| 2 | App dev-tree moderates (`glob`, `minimatch`, `deepmerge`, `follow-redirects`) | Build tooling or Node-only code paths; not shipped in the Hermes bundle | Each Expo SDK upgrade |
| 3 | Server dev-tree `nodemon`/`minimatch` | Never deployed | Next `nodemon` release |
| 4 | CSRF guard trusts Origin/Referer when present | Standard browser behaviour; native apps send neither | If a supported browser drops `Origin` on writes |
| 5 | No external penetration test | Owner decision; this internal audit is the substitute required by docs/24 §8.2 | Before major public launch |
| 6 | Backup restore drill not yet run | No authorised database access | Before launch |
| 7 | Load/abuse test not yet run | No staging environment | Before launch |
| 8 | Cloudinary upload has no signed `max_file_size` | Formats are restricted and the account quota bounds abuse; adding a limit needs a product decision on photo size | After the device pass |
| 9 | No 2FA on privileged web accounts | Planned as email OTP (docs/24 D22); rate limits and generic errors are the interim control | When OTP is scheduled |

**Gate per docs/24 §8.2.** No critical finding is open. Two high-severity code
findings were found, fixed and regression-tested. The server and website have no
production dependency findings. One high **advisory** remains in the app
dependency tree with the rationale above; the owner should explicitly accept it
before store submission, otherwise schedule the SDK 58 upgrade first.

---

## 10. How to reproduce

```bash
# API
cd server
npm run lint
npm test                                  # 67 suites / 1690 tests
npx jest tests/authorizationMatrix.test.js tests/hardening.test.js tests/billing.test.js

# Website
cd ../client
npm run lint
npm run build

# Apps (each)
cd ../mobile      # then ../partner, ../delivery
npm run lint
npx jest
npx expo export --platform android --output-dir <temporary directory>
npm audit --omit=dev
```

The device pass is separate: `docs/25-device-test-checklist.md`.
