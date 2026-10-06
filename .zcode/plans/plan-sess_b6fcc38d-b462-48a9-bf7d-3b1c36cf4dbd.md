# Phase 12 — Notification System (in-app + Socket.IO real-time)

Source of truth: `docs/12-notification-system.md` (full acceptance criteria §29) + `docs/05-api-specification.md` §21. The `Notification` model already exists but nothing uses it. This phase wires the whole pipeline: **business event → notification.service → DB record → Socket.IO push → user**.

## 1. Backend — core

**New files** (`server/src/`):
- `services/notification.service.js` — the only place notification logic lives (doc12 §28.2):
  - `brandStaffIds(brandId, { permissions })` — audience resolver: all active `BRAND_ADMIN`s + active employees holding ANY of the given permissions (mirrors `requirePermission.js` semantics: BRAND_ADMIN passes unconditionally). Requires `User` + `Employee` models only — no service imports, so no circular-require risk.
  - `notify({ userIds, type, title, message, data })` — dedupes userIds, `insertMany`, then `emitToUsers(...)` via sockets. **Best-effort**: wraps everything in try/catch + logs; never throws into business logic. Called **after** the business transaction commits (avoids phantom pushes on rollback and duplicate pushes from `withTransaction` retries).
  - Domain helpers, one per trigger (e.g. `notifyBrandOfNewOrders(orders)`, `notifyCustomerOfOrderStatus(order, status)`, `notifyStockTransition(...)`, ...).
- `sockets/index.js` — `initSockets(httpServer)`: Socket.IO attached to the HTTP server, CORS reusing `corsOptions` origin logic. Handshake auth middleware (doc12 §14): parse `auth_token` cookie from handshake headers (small inline parser, no new dep), `verifyToken` (reuse `utils/jwt.js`), load user from DB, reject if missing/inactive (`next(new Error('Unauthorized'))`). On connect: `socket.join('user:<id>')`. One-way push only — reads/writes stay on REST. `emitToUsers(userIds, payload)` → `io.to(room).emit('notification', payload)`.
- `routes/notification.routes.js`, `controllers/notification.controller.js`, `validators/notification.validator.js` — exactly doc05 §21 + doc12 §11:
  - `GET /api/v1/notifications` (paginate `page`/`limit`, max limit 50) → `{ success, notifications, pagination, unreadCount }` (house envelope, like orders)
  - `PATCH /api/v1/notifications/:id/read` — ownership-checked (`findOneAndUpdate({ _id, userId })`, 404 otherwise per doc12 §26), sets `isRead` + `readAt`
  - `PATCH /api/v1/notifications/read-all`
  - `DELETE /api/v1/notifications/:id` — ownership-checked
  - All: `authenticate` only (all four roles). No `requireTenant` — notifications are user-scoped, and brand isolation is enforced at *send* time via audience resolution.

**Edited**:
- `models/notification.model.js` — add `readAt: Date` (doc12 §9/§10); add `NEW_REVIEW` type (doc12 §4 allows additional types; doc12 §6 lists "New review received"); replace the standalone `userId` index with compound `{ userId, isRead }` + `{ userId, createdAt: -1 }` (unread count + inbox sort; run `sync-indexes`).
- `app.js` — mount `/api/v1/notifications`. `server.js` — `http.createServer(app)` instead of `app.listen`, `initSockets(httpServer)`, close io in `shutdown()`.
- `package.json` — add `socket.io`. *(Flagged per AGENTS.md §10/§29: Socket.IO is already the documented stack in AGENTS.md §6 and doc03 — this implements it, not a new technology.)*

## 2. Trigger wiring (all after-commit, best-effort)

| Event | Site | Type | Audience |
|---|---|---|---|
| Checkout completes | `order.service.js` `checkout` (after transaction) | `ORDER_CREATED` | brand staff w/ `orders.view` |
| Customer cancels | `order.service.js` `cancelMyOrder` | `ORDER_CANCELLED` | brand staff w/ `orders.view` |
| Brand sets CONFIRMED/PROCESSING/REJECTED | `brandOrder.service.js` `updateBrandOrderStatus` | matching `ORDER_*` | `order.customerId` |
| Delivery PICKED_UP / OUT_FOR_DELIVERY / DELIVERED | `delivery.service.js` `updateDeliveryStatus` (inside the existing `orderTarget` guard — FAILED re-attempts can't re-fire) | `ORDER_SHIPPED` / `ORDER_OUT_FOR_DELIVERY` / `ORDER_DELIVERED` | `order.customerId` |
| Payment becomes PAID | `payment.service.js` `updatePaymentStatus`, guarded by previous status ≠ PAID (delivery auto-PAID path handled so it fires exactly once — doc12 §16) | `PAYMENT_RECEIVED` | `order.customerId` |
| Refund issued | `payment.service.js` refund branch | `REFUND_ISSUED` | `order.customerId` |
| Stock transitions into LOW/OUT | `inventory.service.js` `adjustStock` / `updateInventory` / `deductStock` — compare `getStockStatus` before vs after (transition-only, no spam) | `LOW_STOCK` / `OUT_OF_STOCK` | brand staff w/ `inventory.view` or `inventory.manage` (doc12 §23) |
| Employee created / permissions changed | `employee.service.js` `createEmployee` / `setEmployeePermissions` (include added/removed in `data`) | `EMPLOYEE_CREATED` / `EMPLOYEE_PERMISSION_CHANGED` | that employee's user |
| New review | `review.service.js` `createReview` | `NEW_REVIEW` | brand staff w/ `products.view` |
| Brand application submitted | `brandOnboarding.service.js` `applyForBrand` | `SYSTEM_NOTIFICATION` | all SUPER_ADMINs ("new brand registered", doc12 §8) + welcome note to the new brand owner |
| Brand terminated / suspended / reactivated | `brandAdmin.service.js` `terminateBrand`, `brand.service.js` `updateBrandStatus` | `SYSTEM_NOTIFICATION` | that brand's staff / brand admins |

Messages contain only order numbers, product names, PKR amounts, permission names — no secrets, no other customers' data (doc12 §21). **Not in scope** (documented, absent triggers): `PAYMENT_FAILED` (no COD failure path), email/SMS/push (§18–19), preferences (§17), retention (§24).

## 3. Client

- Dep: `socket.io-client` (client `package.json`).
- `context/NotificationProvider.jsx` + `hooks/useNotifications.js` (mirrors `CartProvider` shape): connects to the API origin with `withCredentials: true`, listens for `notification` pushes (prepend + unread badge++), fetches inbox on login/reconnect/window-focus (offline persistence is the DB record), exposes `markRead/markAllRead/remove`. Clears + disconnects on logout. Registered in `App.jsx` inside `AuthProvider`; context added to `contexts.js`.
- `components/NotificationBell.jsx` — bell + unread badge + dropdown (recent 10, relative time, mark-all-read, per-item delete), click navigates via `data` (role-aware: `/orders/:id`, `/brand/orders/:id`, `/admin/orders/:id`). Mounted in all three headers (`StoreLayout`, `BrandLayout`, `AdminLayout`).
- `pages/Notifications.jsx` — full paginated inbox; one component routed three times (`/notifications`, `/brand/notifications`, `/admin/notifications`) under the existing layouts.

## 4. Tests (doc12 §27)

- **Unit** `tests/notifications.test.js` (mocked models, house pattern): list/unreadCount/pagination; the four ownership cases (see own only; can't mark-read / delete another user's → 404); invalid ObjectId → 400; limit clamp.
- **Trigger tests**: add `jest.mock('../src/services/notification.service')` (no DB hang) + assertions to the existing `orders`, `brandOrders`, `deliveries` (incl. FAILED re-attempt non-duplication), `payments` (PAID exactly once; refund), `inventory` (+`inventory.service`, transition-only), `employees`, `reviews`, `brandOnboarding`, `brands` test files.
- **Integration** `tests/integration/notifications.integration.test.js` (real replica set): end-to-end HTTP with real JWT cookies — audience resolution against real User/Employee collections, cross-user and cross-brand isolation, mark-read/delete; **real-time**: two users connect via `socket.io-client` (server devDependency, test-only) with auth cookies — only the recipient's socket receives the push; no-cookie / bad-token handshakes rejected; offline user still sees the record via REST.

## 5. Docs sync (AGENTS.md §39)

- `docs/05-api-specification.md` §21: add the `DELETE /api/v1/notifications/:id` endpoint (doc12 §11 defines it; doc05 omitted it — doc12 is source of truth, this is a sync not a rule change).
- `docs/04-database-design.md` §29: add `readAt` / `NEW_REVIEW` if its field/type lists are enumerated (verify during implementation).

## 6. Interpretation flagged (not silently decided)

`notifications.view`/`notifications.manage` (doc02 §6.11) are **not added to `permissions.js`** and no endpoint gates on them: doc05 §21 scopes every endpoint to "the authenticated user's notifications" (customers have no permissions, so authentication-only is the only consistent reading), and doc12 §7's employee permission-awareness is implemented at **send time** via audience resolution. If you want employees without `notifications.view` to have no bell at all, that's a small follow-up.

## 7. Verification

`npm test` + `npm run test:integration` (server), `npm run lint` (both), `npx tsc`-free (JS project — no type check). Manual smoke: `seed:demo` → checkout as customer → bell badge on brand dashboard in real time.

No architecture, business-rule, or auth changes beyond what doc12 itself prescribes. No new env vars.