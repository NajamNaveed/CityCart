# 12 — Notification System

## 1. Purpose

This document defines CityCart's notification architecture.

It covers:

* In-app notifications
* Real-time notifications
* Order notifications
* Inventory alerts
* Admin notifications
* Notification ownership
* Read/unread state
* Notification security
* Future email/SMS/push integration

This document is the source of truth for notification functionality.

---

# 2. Notification Architecture

CityCart will initially focus on **in-app notifications**.

Real-time delivery can use:

```text id="ntf001"
Socket.IO
```

Conceptually:

```text id="ntf002"
Business Event
      ↓
Notification Service
      ↓
Notification Record
      ↓
Socket.IO
      ↓
User
```

The database record provides persistence while Socket.IO provides real-time delivery.

---

# 3. Notification Ownership

Every notification must belong to a specific user.

Example:

```text id="ntf003"
Notification
├── userId
├── type
├── title
├── message
├── data
├── isRead
└── createdAt
```

Users must only be able to access their own notifications.

---

# 4. Notification Types

Initial notification types may include:

```text id="ntf004"
ORDER_CREATED
ORDER_CONFIRMED
ORDER_REJECTED
ORDER_PROCESSING
ORDER_SHIPPED
ORDER_OUT_FOR_DELIVERY
ORDER_DELIVERED
ORDER_CANCELLED

LOW_STOCK
OUT_OF_STOCK

PAYMENT_RECEIVED
PAYMENT_FAILED
REFUND_ISSUED

EMPLOYEE_CREATED
EMPLOYEE_PERMISSION_CHANGED

SYSTEM_NOTIFICATION
```

Additional types may be added later.

---

# 5. Customer Notifications

Customers should receive notifications for important order events.

Examples:

```text id="ntf005"
Your order has been confirmed.

Your order has been shipped.

Your order is out for delivery.

Your order has been delivered.
```

Notifications should reference the relevant order where applicable.

---

# 6. Brand Notifications

Brands should receive notifications for important business events.

Examples:

```text id="ntf006"
New order received.

Product "X" is low in stock.

Product "Y" is out of stock.

Customer requested a cancellation.

New review received.
```

Brand users should only receive information relevant to their brand and permissions.

---

# 7. Employee Notifications

Employees may receive notifications based on their responsibilities.

For example:

```text id="ntf007"
Employee with inventory.manage
        ↓
Inventory-related notifications
```

Employees should not receive privileged notifications simply because they belong to a brand.

Notification visibility must respect permissions where appropriate.

---

# 8. Super Admin Notifications

Super Admin may receive platform-level notifications such as:

```text id="ntf008"
New brand registered
New city created
Platform issue detected
Brand suspended
System security event
```

Platform notifications must never be exposed to ordinary users.

---

# 9. Notification Record

A notification may contain:

```text id="ntf009"
userId
type
title
message
data
isRead
readAt
createdAt
```

The `data` field may contain references required for navigation.

Example:

```json id="ntf010"
{
  "orderId": "..."
}
```

Sensitive information should not be unnecessarily embedded inside notifications.

---

# 10. Read and Unread State

Notifications should support:

```text id="ntf011"
Unread
Read
```

The database may use:

```text id="ntf012"
isRead
readAt
```

When a user opens a notification:

```text id="ntf013"
isRead = true
readAt = current timestamp
```

---

# 11. Notification APIs

Initial APIs may include:

```http id="ntf014"
GET   /api/v1/notifications
PATCH /api/v1/notifications/:notificationId/read
PATCH /api/v1/notifications/read-all
DELETE /api/v1/notifications/:notificationId
```

All operations must be scoped to the authenticated user.

---

# 12. Notification Pagination

Notifications should be paginated.

Example:

```http id="ntf015"
GET /api/v1/notifications?page=1&limit=20
```

The backend should enforce a maximum limit.

---

# 13. Real-Time Notifications

Socket.IO may provide real-time notification delivery.

Conceptually:

```text id="ntf016"
Order confirmed
      ↓
Backend event
      ↓
Notification created
      ↓
Socket.IO event
      ↓
Connected customer
      ↓
Notification appears
```

Real-time delivery is an enhancement to persistent notifications.

If a user is offline, the notification must remain available when they return.

---

# 14. Socket Authentication

Socket connections must be authenticated.

The server must identify the connected user before allowing private notification events.

Users must not be able to subscribe to another user's notification channel.

---

# 15. Notification Events

Internal application events may include:

```text id="ntf017"
order.created
order.confirmed
order.shipped
order.delivered

inventory.low
inventory.out

payment.received
payment.failed
```

A notification service can translate these events into user notifications.

This keeps notification logic separate from business logic.

---

# 16. Avoiding Duplicate Notifications

The system should avoid accidentally generating duplicate notifications.

For example:

```text id="ntf018"
Order confirmed
```

should not create five identical notifications because the confirmation endpoint was called repeatedly.

Important business operations should be idempotent where required.

---

# 17. Notification Preferences

Future versions may allow users to configure preferences.

Examples:

```text id="ntf019"
Order notifications
Inventory notifications
Marketing notifications
System notifications
```

The MVP may use fixed notification rules without a full preference center.

---

# 18. Email Notifications

Email notifications are not required for the initial MVP.

Future events may include:

```text id="ntf020"
Welcome email
Order confirmation
Order shipped
Order delivered
Password reset
Refund confirmation
```

Email should be implemented as a separate notification channel.

---

# 19. SMS / WhatsApp / Push

Future notification channels may include:

```text id="ntf021"
SMS
WhatsApp
Web Push
Mobile Push
```

These should integrate with the notification service rather than being embedded into individual controllers.

---

# 20. Notification Channels

Future architecture:

```text id="ntf022"
                 Notification Service
                        ↓
          ┌─────────────┼─────────────┐
          ↓             ↓             ↓
       In-App         Email          SMS
          ↓
      Socket.IO
```

Additional channels can be added without changing core business logic.

---

# 21. Notification Security

Notifications must not expose:

* Passwords
* JWTs
* API keys
* Payment secrets
* Internal security data
* Another customer's personal information

Notifications containing customer information must only be delivered to authorized recipients.

---

# 22. Brand Isolation

Brand notifications must follow tenant boundaries.

Example:

```text id="ntf023"
Brand A new order
       ↓
Brand A users only
```

Brand B must never receive Brand A's order notification.

---

# 23. Permission-Aware Notifications

Where relevant, notifications should consider employee permissions.

For example:

```text id="ntf024"
inventory.low
       ↓
Brand Admin
       +
Users with inventory.view/manage
```

The exact notification audience should be defined by the business event.

---

# 24. Notification Retention

The MVP may retain notifications in MongoDB.

Future retention rules may delete or archive very old notifications.

Notification deletion must not affect the underlying business record.

Deleting a notification does not delete:

```text id="ntf025"
Order
Product
Payment
Inventory
```

---

# 25. Notification Performance

The system should avoid creating unnecessary notifications.

Important practices include:

* Indexing `userId`
* Indexing `isRead`
* Pagination
* Efficient Socket.IO event delivery
* Avoiding expensive notification queries
* Limiting notification payload size

---

# 26. Notification API Security

Every notification endpoint must verify:

```text id="ntf026"
Authenticated user
       ↓
Notification belongs to user
```

For example, the server must not simply search:

```javascript id="ntf027"
Notification.findById(notificationId)
```

and return it without checking ownership.

---

# 27. Notification Testing

Tests must cover:

### Ownership

* User sees own notifications.
* User cannot see another user's notifications.
* User cannot mark another user's notification as read.
* User cannot delete another user's notification.

### Business Events

* Order creation notification.
* Order confirmation notification.
* Shipping notification.
* Delivery notification.
* Low-stock notification.
* Payment notification.

### Real-Time

* Authenticated Socket.IO connection.
* Correct user receives event.
* Unauthorized socket access is rejected.
* Offline users still have persistent notifications.

### Duplicate Prevention

* Repeated business event does not unnecessarily create duplicate notifications.

---

# 28. AI Implementation Rules

AI coding agents must:

1. Read this document before changing notification functionality.
2. Keep notification logic separate from business logic.
3. Preserve user ownership.
4. Preserve brand isolation.
5. Authenticate Socket.IO connections.
6. Never expose sensitive data through notifications.
7. Add tests for notification ownership.
8. Avoid adding external notification providers during MVP unless explicitly approved.
9. Keep future notification channels extensible.
10. Report architectural conflicts before changing notification behavior.

---

# 29. Acceptance Criteria

Notification functionality is considered implemented when:

* Users can retrieve their notifications.
* Notifications support read/unread state.
* Customers receive important order notifications.
* Brands receive relevant business notifications.
* Low-stock notifications are supported.
* Notifications are persisted.
* Socket.IO can deliver real-time notifications.
* Offline users can see notifications later.
* Users cannot access another user's notifications.
* Brand notification isolation is enforced.
* Notification APIs are paginated and secured.
* Notification functionality has automated tests.

---

# 30. Source-of-Truth Rule

This document is the authoritative specification for CityCart's notification system.

The MVP should prioritize reliable **in-app + real-time notifications** while keeping the architecture ready for email, SMS, WhatsApp, and push notifications later.

---

## Next Document

**13-review-and-rating-system.md — Product Reviews, Ratings, Eligibility, Moderation, and Brand Feedback**
