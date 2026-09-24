# AGENTS.md — CityCart AI Development Constitution

## 1. Purpose

This file defines the rules that every AI coding agent must follow when working on CityCart.

CityCart is a **multi-tenant, multi-vendor, city-based e-commerce marketplace**.

This file defines engineering behavior, while the detailed business and technical requirements live inside:

```text
docs/
```

The documentation and existing implementation must be reviewed before making architectural or business-rule changes.

---

# 2. Golden Rules

Every AI agent MUST follow these rules:

1. **Read before modifying.**
2. **Do not change business rules without explicit approval.**
3. **Do not change architecture without explicit approval.**
4. **Never weaken authentication or authorization.**
5. **Never bypass tenant/brand isolation.**
6. **Never trust client-provided ownership information.**
7. **Backend is authoritative for security and business-critical values.**
8. **Every important feature requires tests.**
9. **Do not modify unrelated files.**
10. **Do not silently introduce new dependencies or technologies.**
11. **Do not delete working functionality without approval.**
12. **Do not hide failing tests or errors.**
13. **Prefer simple solutions over unnecessary complexity.**
14. **Report conflicts instead of making assumptions.**
15. **Human approval is required for architectural changes.**

---

# 3. Source of Truth Hierarchy

When information conflicts, use this order:

```text
1. Explicit current human instruction
2. AGENTS.md
3. Relevant docs/*.md
4. Existing approved architecture
5. Existing implementation
6. Tests
7. AI assumptions
```

AI assumptions are the lowest priority.

If a requirement is unclear, do not invent a business rule when the decision affects architecture, security, financial calculations, data integrity, or tenant isolation.

---

# 4. Required Reading Before Coding

Before modifying code, the agent MUST determine which documentation applies to the task.

For example:

### Authentication

Read:

```text
docs/02-user-roles-and-permissions.md
docs/06-authentication-and-security.md
```

### Products

Read:

```text
docs/04-database-design.md
docs/05-api-specification.md
docs/07-marketplace.md
```

### Orders

Read:

```text
docs/04-database-design.md
docs/05-api-specification.md
docs/08-order-management.md
```

### Inventory

Read:

```text
docs/08-order-management.md
docs/09-inventory-management.md
```

### Reviews

Read:

```text
docs/13-review-and-rating-system.md
```

### Analytics

Read:

```text
docs/14-analytics-and-reporting.md
```

### Testing

Read:

```text
docs/16-testing-strategy.md
```

### Deployment

Read:

```text
docs/17-deployment.md
```

### Roadmap

Read:

```text
docs/18-development-roadmap.md
```

---

# 5. Architecture

CityCart uses a **modular monolith** architecture during the MVP.

Do not introduce microservices unless explicitly approved.

The backend should remain organized by clear responsibilities such as:

```text
routes
controllers
services
models
middleware
validators
utils
```

Business logic should not unnecessarily be placed directly inside route definitions.

---

# 6. Technology Stack

## Frontend

```text
React
Vite
Tailwind CSS
React Router
Axios
React Hook Form
Zod
Recharts
Lucide React
```

## Backend

```text
Node.js
Express.js
MongoDB
Mongoose
JWT
bcrypt
Zod
Helmet
CORS
express-rate-limit
Socket.IO
```

## Infrastructure

```text
MongoDB Atlas
Cloudinary
Vercel
Render
GitHub
```

Do not replace a technology with another library merely because the alternative is preferred by the AI agent.

---

# 7. Multi-Tenancy

This is one of the most important rules in CityCart.

Every brand is a logical tenant.

Example:

```text
Brand A
├── Products
├── Orders
├── Inventory
├── Employees
├── Reviews
└── Analytics

Brand B
├── Products
├── Orders
├── Inventory
├── Employees
├── Reviews
└── Analytics
```

Brand A must never access Brand B resources.

Tenant isolation MUST be enforced on the backend.

Frontend hiding is not security.

---

# 8. Authorization

CityCart uses:

```text
Authentication
+
RBAC
+
Permission Checks
+
Ownership Checks
```

Roles:

```text
SUPER_ADMIN
BRAND_ADMIN
BRAND_EMPLOYEE
CUSTOMER
```

A request should conceptually pass through:

```text
Is authenticated?
       ↓
What is the user's role?
       ↓
Does the role have permission?
       ↓
Does the resource belong to the user's brand?
       ↓
Does the user own the resource where required?
       ↓
Allow
```

Never assume that because a user has a valid JWT they can access a resource.

---

# 9. Never Trust Client Ownership Data

The backend must NOT trust client-provided values such as:

```text
customerId
brandId
employeeId
ownerId
verifiedPurchase
paymentStatus
commissionAmount
orderTotal
```

Ownership should be derived from authenticated context and database relationships.

For example:

```text
Authenticated Employee
        ↓
employee.brand
        ↓
resource.brand
        ↓
ownership check
```

---

# 10. Backend Authority

The backend is authoritative for:

- Authentication
- Authorization
- User roles
- Permissions
- Brand ownership
- Product prices
- Order totals
- Inventory
- Payment state
- Order state
- Review eligibility
- Financial calculations

Never allow the frontend to determine authoritative business values.

---

# 11. Authentication

CityCart uses:

```text
JWT
+
HTTP-only cookies
+
bcrypt
```

Agents MUST:

- Never store plaintext passwords.
- Never return passwords in API responses.
- Never log passwords.
- Never expose JWT secrets.
- Never move authentication secrets to frontend code.
- Preserve secure cookie configuration.

---

# 12. Validation

External input must be validated.

Use the project's established validation strategy, primarily Zod.

Validate:

- Request body.
- Query parameters.
- Route parameters.
- IDs.
- Numeric values.
- Enums.
- Strings.
- File metadata where applicable.

Do not rely only on frontend validation.

---

# 13. Database Rules

MongoDB/Mongoose is the project's database layer.

Agents must:

- Follow existing model naming conventions.
- Reuse existing relationships.
- Avoid unnecessary duplication.
- Add indexes where justified.
- Validate ObjectIds.
- Preserve historical order/payment data.
- Avoid destructive schema changes without approval.

Critical operations involving orders, inventory, payments, or financial records should use appropriate atomic operations or MongoDB transactions where required.

---

# 14. Order Rules

CityCart supports multi-brand carts.

Example:

```text
Cart
├── Brand A
├── Brand B
└── Brand C
```

Checkout produces:

```text
Order A → Brand A
Order B → Brand B
Order C → Brand C
```

Every order belongs to exactly one brand.

Do not redesign this behavior without approval.

---

# 15. Inventory Rules

Inventory correctness is critical.

Agents must prevent overselling.

Important concepts:

```text
quantity
reservedQuantity
availableQuantity
```

Checkout must validate inventory using backend-authoritative data.

Concurrent purchases must be considered.

Never implement inventory changes using unsafe read-then-write logic when an atomic operation is required.

---

# 16. Payment Rules

MVP payment method:

```text
COD
```

Payment is separate from Order.

Do not introduce an online payment gateway unless explicitly requested.

Never store raw card information.

Never trust client-provided:

```text
paymentAmount
paymentStatus
refundAmount
```

---

# 17. Financial Rules

Financial calculations must be backend-authoritative.

Examples:

```text
Order totals
Commission
Brand earnings
Payouts
Refunds
```

Use consistent monetary representation.

Do not silently change financial calculations.

Any ambiguous financial rule must be reported to the human before implementation.

---

# 18. Review Rules

Customers should generally only review products they have actually purchased and received.

The backend must validate review eligibility.

Review rules include:

```text
1–5 rating
Verified purchase
Review ownership
Brand isolation
Moderation
```

Do not allow arbitrary client-provided `verifiedPurchase`.

---

# 19. Analytics Rules

Analytics must respect user scope.

```text
SUPER_ADMIN
→ Platform analytics

BRAND_ADMIN
→ Own brand analytics

AUTHORIZED EMPLOYEE
→ Allowed brand analytics

CUSTOMER
→ No private business analytics
```

Never expose another brand's revenue, orders, customers, inventory, or financial information.

---

# 20. API Rules

API base:

```text
/api/v1
```

Follow REST conventions already defined in:

```text
docs/05-api-specification.md
```

Use appropriate HTTP methods and status codes.

Do not create inconsistent endpoint patterns for individual features.

Maintain:

```text
Authentication
Authorization
Validation
Error handling
Tenant isolation
```

for every protected endpoint.

---

# 21. Error Handling

Use the project's existing error-handling architecture.

Do not expose:

- Stack traces in production.
- Database errors containing sensitive information.
- Secrets.
- Tokens.
- Passwords.
- Internal infrastructure details.

Errors should be predictable and machine-readable where appropriate.

---

# 22. Frontend Rules

Frontend responsibilities include:

- UI.
- Routing.
- Forms.
- User interaction.
- API communication.
- Loading states.
- Error states.
- Permission-aware UI.

Frontend authorization is only a UX mechanism.

Never rely on:

```text
if (user.role === ...)
```

as the only security control.

The backend must independently enforce authorization.

---

# 23. State Management

Start with the project's chosen lightweight state architecture.

Use:

```text
React Context
+
useReducer
```

where appropriate.

Do not introduce Redux or another state library without a real requirement.

---

# 24. File Uploads

Cloudinary is the intended media storage provider.

Agents must validate:

- File type.
- File size.
- Upload permissions.

Never expose private Cloudinary credentials to the frontend.

Do not allow arbitrary executable files to be uploaded.

---

# 25. Notifications

Socket.IO is used for real-time in-app notifications.

Notifications must respect:

- User ownership.
- Brand scope.
- Permissions.
- Privacy.

A Brand A event must not be broadcast to unrelated Brand B users.

---

# 26. Testing Requirements

Every meaningful backend feature should include tests.

Critical areas require especially strong coverage:

```text
Authentication
Authorization
Tenant Isolation
Orders
Inventory
Payments
Reviews
Financial calculations
```

Tests must include both:

```text
Happy Path
+
Failure/Unauthorized Path
```

---

# 27. Security Testing

AI agents must actively consider attacks such as:

```text
Brand A → Brand B access
Customer A → Customer B order
Employee → Admin endpoint
Modified ObjectId
Modified brandId
Privilege escalation
NoSQL injection
XSS
Invalid JWT
Expired JWT
Rate-limit abuse
Malicious file upload
```

Security testing should be part of implementation, not an afterthought.

---

# 28. Code Quality

Prefer:

- Clear names.
- Small functions.
- Single responsibility.
- Reusable services.
- Consistent error handling.
- Consistent validation.
- Minimal duplication.
- Existing project patterns.

Avoid:

- Giant controllers.
- Giant components.
- Deep unnecessary abstractions.
- Copy-pasted business logic.
- Unused dependencies.
- Dead code.
- Magic values.
- Temporary hacks left in production.

---

# 29. Dependency Rules

Before adding a dependency, ask:

1. Is it actually necessary?
2. Does the existing stack already solve the problem?
3. Does it introduce security or maintenance concerns?
4. Is it compatible with the project?
5. Does the task genuinely require it?

Do not add packages simply because an AI-generated solution commonly uses them.

---

# 30. File Modification Rules

Agents should modify only files relevant to the current task.

Do not:

- Reformat unrelated files.
- Rename unrelated files.
- Rewrite working modules.
- Delete unused-looking code without verifying its purpose.
- Change configuration unrelated to the task.

If broad changes are necessary, explain why.

---

# 31. Git Rules

Use feature branches:

```text
feature/*
fix/*
refactor/*
security/*
```

Do not directly rewrite `main` history.

Do not force-push unless explicitly authorized.

Commits should be focused and descriptive.

Example:

```text
feat: add brand product CRUD
fix: enforce brand ownership on orders
test: add cross-tenant authorization tests
```

---

# 32. AI Task Size

AI agents should receive focused tasks.

Bad:

```text
Build the entire backend.
```

Good:

```text
Implement Product CRUD API with:
- Brand ownership
- Zod validation
- RBAC
- Error handling
- Tests
```

One task should have one clear responsibility.

---

# 33. Before Starting a Task

The agent should:

```text
1. Understand the requested feature.
2. Identify relevant documentation.
3. Inspect existing implementation.
4. Inspect related tests.
5. Identify dependencies.
6. Create a short implementation plan.
7. Implement only the requested scope.
8. Run tests.
9. Review security.
10. Report the result.
```

---

# 34. Before Finishing a Task

The agent must verify:

```text
[ ] Requirement implemented
[ ] Existing architecture preserved
[ ] Validation implemented
[ ] Authentication considered
[ ] Authorization implemented
[ ] Tenant isolation verified
[ ] Error handling implemented
[ ] Tests added/updated
[ ] Tests pass
[ ] No unrelated files changed
[ ] No secrets exposed
[ ] Documentation updated if necessary
```

---

# 35. When Documentation Conflicts With Code

Do NOT automatically modify the documentation or code.

Instead:

```text
Identify conflict
       ↓
Explain conflict
       ↓
Show affected files/rules
       ↓
Ask for human decision
```

Example:

```text
Documentation:
Orders belong to exactly one brand.

Existing code:
Order.brand is optional.

Action:
Report the conflict before changing the model.
```

---

# 36. When Requirements Are Ambiguous

Do not invent critical business rules.

Ask for clarification when ambiguity affects:

- Money.
- Permissions.
- Authentication.
- Tenant isolation.
- Order behavior.
- Inventory.
- Data deletion.
- Privacy.
- Production infrastructure.

For low-risk implementation details, follow existing project conventions.

---

# 37. No Silent Architecture Changes

AI agents MUST NOT silently:

- Change databases.
- Replace libraries.
- Introduce microservices.
- Change authentication.
- Change state management.
- Change API conventions.
- Change tenant architecture.
- Change payment architecture.
- Change deployment architecture.

Architectural changes require explicit approval.

---

# 38. Production Safety

AI agents must treat production systems as protected environments.

Never perform destructive operations such as:

```text
Drop database
Delete production collection
Mass-delete records
Reset production database
Rotate production secrets
Change production payment configuration
```

without explicit human authorization.

---

# 39. Documentation Updates

When a feature changes an established behavior, update the relevant documentation.

Examples:

```text
New permission
→ 02-user-roles-and-permissions.md

New API
→ 05-api-specification.md

Security change
→ 06-authentication-and-security.md

Order behavior
→ 08-order-management.md

Inventory behavior
→ 09-inventory-management.md
```

Documentation must remain synchronized with implementation.

---

# 40. Agent Reporting Format

After completing a task, the agent should report:

### Implemented

- What was changed.

### Files Changed

```text
path/to/file
path/to/file
```

### Tests

- Tests added.
- Tests executed.
- Results.

### Security

- Authorization checked.
- Tenant isolation checked.

### Notes

- Any limitations.
- Any unresolved issues.
- Any documentation conflicts.

Do not claim a test passed if it was not actually executed.

---

# 41. Definition of Done

A feature is considered complete only when:

```text
Requirement
     +
Implementation
     +
Validation
     +
Authorization
     +
Tenant Isolation
     +
Testing
     +
Security Review
     +
Documentation
```

are appropriately addressed.

---

# 42. Final Principle

CityCart should be built as a **secure, maintainable, testable, multi-tenant marketplace**, not merely as a collection of working screens and APIs.

When choosing between:

```text
Quick Hack
```

and

```text
Correct Maintainable Implementation
```

prefer the maintainable implementation.

When uncertain about a business-critical decision:

```text
Do not guess.
Do not silently change.
Ask the human.
```

The human remains the final authority over CityCart's architecture and business rules.