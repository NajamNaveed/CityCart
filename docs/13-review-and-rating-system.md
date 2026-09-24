# 13. Review & Rating System

## 1. Purpose

The Review & Rating System allows customers to provide feedback on products they purchased through CityCart.

The system must:

* Allow genuine customers to review purchased products.
* Support ratings from 1–5 stars.
* Prevent unauthorized users from creating fake reviews.
* Maintain tenant/brand isolation.
* Allow brands and Super Admins to moderate reviews.
* Calculate product rating summaries.
* Support pagination and filtering.
* Prevent duplicate reviews according to the defined eligibility rule.

---

## 2. Review Concept

A review belongs to:

* One customer.
* One product.
* One brand.
* One order/order item.

Recommended model relationship:

```text
Customer
   ↓
Order
   ↓
Order Item
   ↓
Product
   ↓
Brand
```

The review should retain references to the relevant records rather than trusting client-provided ownership information.

The backend determines the product and brand from the purchased order item.

---

## 3. Review Eligibility

A customer can create a review only when:

1. The customer is authenticated.
2. The customer owns the order.
3. The order contains the product.
4. The order has reached `DELIVERED`.
5. The order item belongs to that customer.
6. The product still exists and is reviewable.
7. The customer has not already reviewed that eligible order item.

Recommended rule:

> One review per customer per purchased order item.

This allows a customer to review the same product again if they purchase it in a different order.

---

## 4. Rating

Ratings use a 1–5 scale:

```text
1 = Very Poor
2 = Poor
3 = Average
4 = Good
5 = Excellent
```

The backend must validate that:

```text
rating >= 1
rating <= 5
```

Only integer ratings are allowed in the MVP.

The frontend may display stars, but the backend remains authoritative.

---

## 5. Review Data Model

Recommended fields:

```text
Review
├── customer
├── product
├── brand
├── order
├── orderItem
├── rating
├── title
├── body
├── status
├── verifiedPurchase
├── brandResponse
├── moderatedBy
├── moderatedAt
├── createdAt
└── updatedAt
```

Recommended status values:

```text
PENDING
PUBLISHED
HIDDEN
REJECTED
```

`verifiedPurchase` should be derived from the eligibility process and should not be freely controlled by the customer.

---

## 6. Review Creation

The customer submits:

```json
{
  "rating": 5,
  "title": "Great product",
  "body": "The product quality is excellent."
}
```

The client should not be trusted to provide:

* `customer`
* `brand`
* `product`
* `order`
* `verifiedPurchase`

These values must come from authenticated user context and validated order information.

---

## 7. Review Moderation

The MVP can support automatic publishing or moderation depending on the implementation.

If moderation is enabled:

```text
Customer creates review
        ↓
PENDING
        ↓
Brand/Admin reviews
        ↓
PUBLISHED / REJECTED / HIDDEN
```

Brands may moderate reviews belonging to their own products.

Super Admin can moderate reviews platform-wide.

Brand users must never moderate reviews belonging to another brand.

---

## 8. Brand Response

A brand may optionally respond to a published review.

Example:

```text
Customer:
"Very good quality."

Brand:
"Thank you for your feedback!"
```

A brand response must only be possible for products owned by that brand.

Brand employees require an appropriate review-management permission.

---

## 9. Review Ownership

Customers can:

* Create their own eligible reviews.
* View their own reviews.
* Update their own reviews according to the update policy.
* Delete their own reviews according to the deletion policy.

Customers cannot:

* Modify another customer's review.
* Change the product or order associated with an existing review.
* Change `verifiedPurchase`.
* Change moderation status.

Brands can only manage reviews associated with their own brand.

Super Admin has platform-wide moderation authority.

---

## 10. Review Display

Published reviews may appear on:

* Product detail pages.
* Brand storefronts.
* Customer review history.

Hidden, rejected, or pending reviews should not appear publicly unless the user has appropriate management access.

Public product review response should contain information such as:

```text
Rating
Review title
Review body
Customer display name
Verified purchase indicator
Created date
Brand response
```

Avoid exposing sensitive customer information.

---

## 11. Rating Aggregation

Product pages should display:

```text
Average Rating
Total Reviews
Rating Distribution
```

Example:

```text
4.6 ★
127 reviews

5 ★ ██████████
4 ★ █████
3 ★ ██
2 ★
1 ★
```

Only reviews with:

```text
status = PUBLISHED
```

should contribute to public rating calculations.

Hidden or rejected reviews must not affect the public average.

---

## 12. Rating Calculation

The basic average is:

```text
averageRating =
sum(published ratings) / number of published reviews
```

The backend should calculate or maintain this value consistently.

Possible product fields:

```text
averageRating
reviewCount
```

If these values are stored on the Product model, updates must occur whenever a published review is:

* Created.
* Published.
* Hidden.
* Deleted.
* Rating changed.

MongoDB aggregation can also calculate ratings dynamically.

The implementation must choose one authoritative strategy and document it.

---

## 13. Review APIs

Example endpoints:

### Customer

```http
POST   /api/v1/products/:productId/reviews
GET    /api/v1/products/:productId/reviews
GET    /api/v1/reviews/my
GET    /api/v1/reviews/:reviewId
PUT    /api/v1/reviews/:reviewId
DELETE /api/v1/reviews/:reviewId
```

### Brand

```http
GET /api/v1/brand/reviews
PUT /api/v1/brand/reviews/:reviewId/status
PUT /api/v1/brand/reviews/:reviewId/response
```

### Super Admin

```http
GET /api/v1/admin/reviews
PUT /api/v1/admin/reviews/:reviewId/status
DELETE /api/v1/admin/reviews/:reviewId
```

Exact routes may be adjusted to match the API specification, but authorization rules must remain unchanged.

---

## 14. Pagination and Filtering

Review listing should support:

```text
page
limit
rating
sort
status
```

Public customers should only be able to request publicly visible reviews.

Brand/Admin dashboards may use additional moderation filters.

---

## 15. Anti-Spam and Abuse Prevention

The backend should prevent:

* Duplicate reviews for the same eligible order item.
* Reviews without a valid purchase.
* Invalid ratings.
* Excessively large review bodies.
* Unauthorized review manipulation.
* Cross-brand review access.

Rate limiting should be applied to review creation and moderation endpoints.

Future improvements may include:

* Abuse detection.
* Profanity filtering.
* Automated moderation.
* Review reporting.
* Image reviews.

These are not required for the initial MVP.

---

## 16. Tenant Isolation

Every brand-related review operation must enforce:

```text
authenticatedUser
        ↓
brand ownership
        ↓
review.brand
```

Brand A must never be able to:

```text
GET Brand B reviews
UPDATE Brand B review
DELETE Brand B review
RESPOND to Brand B review
```

The backend must enforce this even if the frontend hides the relevant UI.

---

## 17. Notifications

Notifications may be generated for:

### Customer

* Review published.
* Review rejected.
* Brand responded to review.

### Brand

* New review received.

Notifications should use the existing notification architecture and Socket.IO where real-time delivery is appropriate.

---

## 18. Security

Review endpoints must use:

* Authentication middleware.
* RBAC/permission middleware.
* Tenant ownership checks.
* Zod validation.
* ObjectId validation.
* Rate limiting.
* Safe error responses.

Never trust:

```text
customerId
brandId
verifiedPurchase
status
moderatedBy
```

from the client.

---

## 19. Testing Requirements

Tests must verify:

* Customer can review a delivered purchased product.
* Customer cannot review an unpurchased product.
* Customer cannot review an undelivered order.
* Duplicate review is rejected.
* Invalid rating is rejected.
* Customer cannot modify another customer's review.
* Brand A cannot access Brand B reviews.
* Brand employee permissions are enforced.
* Hidden reviews do not appear publicly.
* Rejected reviews do not affect ratings.
* Published reviews affect rating aggregation.
* Unauthorized users cannot moderate reviews.

---

## 20. AI Implementation Rules

AI agents must:

1. Read this document before modifying review functionality.
2. Never bypass purchase eligibility.
3. Never trust client-provided ownership fields.
4. Never weaken tenant isolation.
5. Reuse existing authentication and authorization middleware.
6. Follow the existing API conventions.
7. Add tests for authorization and edge cases.
8. Avoid introducing advanced review features unless explicitly requested.

---

## 21. Acceptance Criteria

The Review & Rating System is complete when:

* Customers can review eligible purchases.
* Ratings are limited to 1–5.
* Duplicate reviews are prevented.
* Review ownership is enforced.
* Brand isolation is enforced.
* Moderation works according to the selected workflow.
* Public pages display only valid published reviews.
* Product rating aggregation is correct.
* APIs are validated and protected.
* Automated tests cover critical authorization and business rules.

---

## 22. Source of Truth

This document defines the authoritative business and technical requirements for the CityCart Review & Rating System.

If implementation conflicts with this document, the conflict must be identified before changing the architecture or business rules.
