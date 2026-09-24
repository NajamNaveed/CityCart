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
```

Future:

```text
PAYMENT_GATEWAY_SECRET
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
