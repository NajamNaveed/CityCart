# CityCart

> A scalable multi-tenant, multi-vendor e-commerce marketplace connecting customers with local brands through city-based online stores.

CityCart is a full-stack marketplace platform where multiple local brands can operate independently within a shared e-commerce ecosystem.

Customers can discover brands and products by city, manage a multi-brand cart, place orders, and track purchases. Each brand has its own management dashboard, inventory, orders, employees, and permissions, while Super Admin manages the entire platform.

---

## ✨ Features

### 🛍️ Customer Marketplace

* City-based brand discovery
* Browse brand storefronts
* Product search, filtering, sorting, and pagination
* Product details and availability
* Multi-brand shopping cart
* Secure checkout
* Order history and tracking
* Product reviews and ratings
* In-app notifications

### 🏪 Brand Management

Each brand operates as an isolated tenant with its own:

* Store
* Products
* Categories
* Inventory
* Orders
* Customers
* Employees
* Reviews
* Analytics
* Store settings

Brand users can only access resources belonging to their own brand.

### 👥 Employee Management

Brand administrators can create employees and assign granular permissions, for example:

```text
products.view
products.create
products.update
products.delete

orders.view
orders.manage
orders.cancel

inventory.view
inventory.manage

customers.view
customers.manage

employees.view
employees.create
employees.update
employees.delete
employees.manage_permissions

delivery.view
delivery.manage

payments.view
payments.manage

reviews.view
reviews.manage
analytics.view
```

The full, authoritative permission list lives in `docs/02-user-roles-and-permissions.md` — treat it as the source of truth over this README when implementing RBAC.

Permissions are enforced on the backend.

### 📦 Inventory Management

* Stock tracking
* Reserved inventory
* Available inventory
* Low-stock thresholds
* Out-of-stock handling
* Stock adjustments
* Inventory validation during checkout
* Overselling prevention
* Restocking after eligible cancellations/returns

### 🧾 Order Management

* Multi-brand cart support
* Automatic cart splitting by brand
* Separate brand orders
* Order item snapshots
* Address snapshots
* Order status lifecycle
* Customer order tracking
* Brand order management
* Order cancellation and return states

### 💳 Payments

The MVP supports:

* Cash on Delivery (COD)
* Payment records
* Payment status tracking
* Refund representation

The architecture is designed to support online payment gateways in the future.

### 🚚 Delivery

* Delivery records
* Delivery addresses
* Delivery charges
* Delivery status tracking
* Brand fulfillment workflow
* Door returns: per-line accept/refuse with reasons and a photo
* Failed delivery handling
* Return handling

Advanced courier and GPS integrations are planned for future versions.

### 📱 Apps

Three Expo apps run against the same API:

* **CityCart** (`mobile/`) — shopper app: discover, cart, checkout, orders, live rider map, door-return results.
* **CityCart Staff** (`partner/`) — brand team and pickers: pick queue, packing, handover, returned-goods inbox.
* **CityCart Delivery** (`delivery/`) — riders: assigned runs, pickup, navigation, proof-of-delivery, door returns.

Brand admins and the super admin stay on the website. Apps authenticate with bearer tokens and are refused cross-app tokens (`403 WRONG_APP`).

### ⭐ Reviews & Ratings

* Verified-purchase reviews
* 1–5 star ratings
* Review moderation
* Brand responses
* Product rating aggregation
* Review ownership protection

### 📊 Analytics

Brand dashboards can provide:

* Sales
* Orders
* Customers
* Product performance
* Inventory metrics
* Payment metrics

Super Admin can access platform-wide analytics.

### 🔔 Notifications

Real-time in-app notifications using Socket.IO for events such as:

* New orders
* Order status changes
* Low stock
* Out-of-stock products
* Payments
* Reviews
* Employee changes

---

# 🏗️ Architecture

CityCart uses a **modular monolith architecture** during the MVP stage.

```text
                         ┌─────────────────────┐
                         │      Customers      │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │   React Frontend   │
                         │ React + Vite +      │
                         │ Tailwind CSS        │
                         └──────────┬──────────┘
                                    │
                              REST API
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │   Express Backend  │
                         │                     │
                         │ Auth                │
                         │ Marketplace         │
                         │ Products            │
                         │ Inventory           │
                         │ Cart                │
                         │ Orders              │
                         │ Payments            │
                         │ Delivery            │
                         │ Reviews             │
                         │ Notifications       │
                         │ Analytics            │
                         └──────────┬──────────┘
                                    │
                     ┌──────────────┼──────────────┐
                     ▼              ▼              ▼
              ┌───────────┐ ┌────────────┐ ┌────────────┐
              │ MongoDB   │ │ Cloudinary │ │ Socket.IO  │
              │   Atlas   │ │   Media    │ │ Real-time  │
              └───────────┘ └────────────┘ └────────────┘
```

---

# 🏢 Multi-Tenant Architecture

CityCart follows a **shared database with logical tenant isolation** model.

Each brand is treated as a tenant.

```text
CityCart
│
├── Brand A
│   ├── Products
│   ├── Inventory
│   ├── Orders
│   ├── Employees
│   └── Reviews
│
├── Brand B
│   ├── Products
│   ├── Inventory
│   ├── Orders
│   ├── Employees
│   └── Reviews
│
└── Brand C
    ├── Products
    ├── Inventory
    ├── Orders
    ├── Employees
    └── Reviews
```

Tenant isolation is enforced by the backend.

A Brand A employee must never be able to access Brand B resources, even if they manually modify API requests.

---

# 👤 User Roles

CityCart currently defines these roles:

| Role             | Scope                                      | Signs in on |
| ---------------- | ------------------------------------------ | ----------- |
| `SUPER_ADMIN`    | Entire platform                            | Website `/admin/login` |
| `ADMIN_PARTNER`  | Platform admin, limited by admin permissions | Website `/admin/login` |
| `BRAND_ADMIN`    | Own brand                                  | Website `/sell/login` |
| `BRAND_EMPLOYEE` | Own brand + assigned permissions           | Website, Staff app, or both |
| `PICKER`         | Own brand's pick queue only                | Staff app |
| `RIDER`          | Own brand's assigned deliveries only       | Delivery app |
| `CUSTOMER`       | Own customer resources                     | Website `/login` and shopper app |

The Staff and Delivery apps refuse each other's tokens (`403 WRONG_APP`); brand owners and the super admin stay web-only.

Authorization is implemented using:

```text
Authentication
      +
RBAC
      +
Permission Checks
      +
Brand Ownership Checks
```

---

# 🛒 Multi-Brand Checkout

One of CityCart's core features is multi-brand shopping.

Example:

```text
Customer Cart

Brand A
├── Product A1
└── Product A2

Brand B
└── Product B1

Brand C
└── Product C1
```

During checkout:

```text
                    Customer Cart
                         │
             ┌───────────┼───────────┐
             ▼           ▼           ▼
          Order A     Order B     Order C
          Brand A     Brand B     Brand C
```

Each resulting order has its own:

* Brand ownership
* Items
* Inventory operations
* Delivery workflow
* Payment relationship
* Order status

---

# 🧰 Tech Stack

## Frontend

* React
* Vite
* Tailwind CSS
* React Router
* Axios
* React Hook Form
* Zod
* Recharts
* Lucide React

## Backend

* Node.js
* Express.js
* MongoDB
* Mongoose
* JWT
* bcrypt
* Zod
* Helmet
* CORS
* express-rate-limit
* Socket.IO

## Infrastructure

* MongoDB Atlas
* Cloudinary
* Vercel
* Render
* GitHub

## Development & Testing

* Git
* GitHub
* Postman
* Swagger/OpenAPI
* Automated testing
* Playwright for future E2E coverage

---

# 📁 Project Structure

```text
CityCart/
│
├── client/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── layouts/
│   │   ├── hooks/
│   │   ├── context/
│   │   ├── services/
│   │   ├── utils/
│   │   └── App.jsx
│   │
│   └── package.json
│
├── partner/                     # CityCart Staff app: brand team members and pickers (Expo) — docs/20
│
├── delivery/                    # CityCart Delivery app: riders (Expo) — docs/23
│
├── mobile/                      # CityCart shopper app (React Native + Expo) — docs/19
│   ├── src/
│   │   ├── app/                 # screens; each file is a route (Expo Router)
│   │   ├── components/
│   │   ├── context/
│   │   ├── hooks/
│   │   ├── services/
│   │   ├── utils/
│   │   └── theme.js
│   │
│   ├── __tests__/
│   └── package.json
│
├── server/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── services/
│   │   ├── validators/
│   │   ├── utils/
│   │   ├── sockets/
│   │   └── app.js
│   │
│   └── package.json
│
├── docs/
│   ├── 01-product-requirements.md
│   ├── 02-user-roles-and-permissions.md
│   ├── 03-system-architecture.md
│   ├── 04-database-design.md
│   ├── 05-api-specification.md
│   ├── 06-authentication-and-security.md
│   ├── 07-marketplace.md
│   ├── 08-order-management.md
│   ├── 09-inventory-management.md
│   ├── 10-payment-system.md
│   ├── 11-delivery-system.md
│   ├── 12-notification-system.md
│   ├── 13-review-and-rating-system.md
│   ├── 14-analytics-and-reporting.md
│   ├── 15-commission-and-payouts.md
│   ├── 16-testing-strategy.md
│   ├── 17-deployment.md
│   ├── 18-development-roadmap.md
│   ├── 19-mobile-app.md
│   ├── 20-partner-app.md       # Staff app programme: plan, status, handoff
│   ├── 21-next-features-plan.md
│   ├── 22-marketplace-v2-plan.md
│   ├── 23-delivery-app.md
│   ├── 24-marketplace-v3-plan.md
│   ├── 25-device-test-checklist.md
│   ├── 26-security-audit.md
│   ├── 27-ai-agents-and-automation-plan.md
│   ├── 28-sightwise-integration.md
│   └── 29-ai-phase-roadmap.md
│
├── AGENTS.md
├── .gitignore
└── README.md
```

> The exact implementation structure may evolve as development progresses. The `docs/` directory remains the source of truth for system requirements and architecture.

---

# 🔐 Security

Security is a core architectural requirement.

CityCart uses:

* JWT authentication
* HTTP-only cookies
* bcrypt password hashing
* RBAC
* Granular employee permissions
* Tenant/brand ownership checks
* Zod input validation
* MongoDB/NoSQL injection protection
* ObjectId validation
* Helmet
* CORS restrictions
* Rate limiting
* Secure file-upload validation
* Environment-based secrets
* Controlled production errors

### Critical Security Rule

Frontend authorization is **never considered sufficient**.

Every protected backend operation must independently verify:

```text
Authenticated User
        ↓
Role
        ↓
Permission
        ↓
Brand Ownership
        ↓
Resource Ownership
```

---

# 💰 MVP Payment Model

CityCart initially uses:

```text
Cash on Delivery (COD)
```

The payment architecture is intentionally separated from orders so future integrations can support:

* Online payment gateways
* Webhooks
* Payment reconciliation
* Refunds
* Automated payouts

without redesigning the entire order system.

---

# 🧪 Testing

Testing is required for critical functionality.

The project follows multiple testing levels:

```text
Unit Tests
    ↓
Integration Tests
    ↓
API Tests
    ↓
Frontend Tests
    ↓
E2E Tests
    ↓
Security Tests
```

Special attention is given to:

* Authentication
* RBAC
* Tenant isolation
* Customer ownership
* Inventory concurrency
* Multi-brand checkout
* Order status transitions
* Payment integrity
* Financial calculations

Example security test:

```text
Brand A Employee
       │
       ▼
Attempts to access Brand B Order
       │
       ▼
       DENIED
```

## Commands

Run from the repository root:

```bash
npm test                 # server unit tests (Jest + MongoDB memory server)
npm run test:integration # server API/integration tests
npm run test:mobile      # shopper app
npm run test:staff       # Staff app
npm run test:delivery    # Delivery app
npm run test:apps        # Staff + Delivery
npm run test:all         # every suite above
npm run lint             # ESLint for server, client, mobile, partner, delivery
npm run build            # client production build
npm run verify           # lint + test:all + build
```

Tests use in-memory MongoDB (`mongodb-memory-server`); no database or network access is required.

---

# 🚀 Getting Started

## Prerequisites

Install:

* Node.js
* npm
* MongoDB Atlas account or local MongoDB
* Cloudinary account
* Git

---

## 1. Clone the Repository

```bash
git clone https://github.com/<your-username>/CityCart.git

cd CityCart
```

---

## 2. Install Dependencies

### Backend

```bash
cd server
npm install
```

### Frontend

```bash
cd ../client
npm install
```

---

# ⚙️ Environment Variables

## Backend

Create:

```text
server/.env
```

Example:

```env
NODE_ENV=development
PORT=5000

MONGODB_URI=your_mongodb_connection_string

JWT_SECRET=your_secure_jwt_secret
JWT_EXPIRES_IN=7d

CLIENT_URL=http://localhost:5173

CLOUDINARY_CLOUD_NAME=your_cloud_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
```

## Frontend

Create:

```text
client/.env
```

Example:

```env
VITE_API_URL=http://localhost:5000/api/v1
```

When `VITE_API_URL` is unset, the Vite development server proxies `/api/v1` and `/socket.io` to `http://localhost:5000`. Set `CITYCART_API_PROXY_TARGET` before starting the client to use another backend URL.

Never commit `.env` files containing secrets.

---

# ▶️ Running Locally

## Start Backend

```bash
cd server
npm run dev
```

For an existing development database, run `npm run sync-indexes --prefix server` once after updating. It backfills portal account types and replaces the old global email index; the script refuses to run when `NODE_ENV=production`.

Backend:

```text
http://localhost:5000
```

## Start Frontend

Open another terminal:

```bash
cd client
npm run dev
```

Frontend:

```text
http://localhost:5173
```

---

# 🔌 API

The API uses versioning:

```text
/api/v1
```

Main API areas include:

```text
/auth
/cities
/blocks
/branches               # live service-area branches
/brands
/stores
/categories
/catalog                # admin catalogue shared across stores
/discover               # nearby stores and serviceability
/chats                  # customer <-> brand conversations
/products
/inventory
/cart
/addresses
/orders
/brand/orders
/picker                 # pick queue and fulfilment
/deliveries
/rider/deliveries       # rider app
/returns                # door returns inbox
/payments
/receipts
/devices                # push-notification tokens
/employees
/riders
/reviews
/notifications
/analytics
/uploads
/admin/*                # super admin and partner-admin areas
```

Full API requirements and endpoint definitions are documented in:

```text
docs/05-api-specification.md
```

Swagger/OpenAPI documentation can be added as the API implementation matures.

---

# 📚 Documentation

The `docs/` directory contains the complete CityCart source of truth.

| Document | Description               |
| -------- | ------------------------- |
| 01       | Product Requirements      |
| 02       | User Roles & Permissions  |
| 03       | System Architecture       |
| 04       | Database Design           |
| 05       | API Specification         |
| 06       | Authentication & Security |
| 07       | Marketplace               |
| 08       | Order Management          |
| 09       | Inventory Management      |
| 10       | Payment System            |
| 11       | Delivery System           |
| 12       | Notification System       |
| 13       | Review & Rating System    |
| 14       | Analytics & Reporting     |
| 15       | Commission & Payouts      |
| 16       | Testing Strategy          |
| 17       | Deployment                |
| 18       | Development Roadmap       |
| 19       | Mobile App (shopper)      |
| 20       | Staff App (partner)       |
| 21       | Next Features Plan        |
| 22       | Marketplace v2 Plan       |
| 23       | Delivery App              |
| 24       | Marketplace v3 Plan       |
| 25       | Device Test Checklist     |
| 26       | Security Audit            |
| 27       | AI Agents and Automation Plan |
| 28       | Sightwise Integration     |
| 29       | AI Phase Roadmap          |

Release plans, runbooks, and per-phase status live in the plan documents (21–29). `docs/17-deployment.md` §30 holds the v2 release runbook and §31 the security operations runbook; `docs/26-security-audit.md` is the Phase 9 internal audit.

When implementation conflicts with documented business rules, the conflict should be identified and resolved before changing the architecture.

---

# 🤖 AI-Assisted Development

CityCart is designed to support AI-assisted software development.

AI agents may be used for:

* Architecture analysis
* Backend development
* Frontend development
* Testing
* Security review
* Code review
* Documentation

Recommended workflow:

```text
Requirement
    ↓
Architect Agent
    ↓
Backend + Frontend Agents
    ↓
QA Agent
    ↓
Security Agent
    ↓
Code Review
    ↓
Human Review
    ↓
Merge
```

AI-generated code must still pass:

* Validation
* Authorization checks
* Tests
* Security review
* Code review

AI agents must read the relevant documentation before modifying the project.

---

# 🌱 Development Roadmap

### MVP

* [x] Architecture documentation
* [x] Authentication
* [x] User management
* [x] Cities
* [x] Brands
* [x] Stores
* [x] Categories
* [x] Products
* [x] Inventory
* [x] Marketplace
* [x] Cart
* [x] Multi-brand checkout
* [x] Orders
* [x] COD payments
* [x] Delivery
* [x] Employee management
* [x] Permissions
* [x] Notifications
* [x] Reviews
* [x] Basic analytics
* [x] Brand dashboard
* [x] Super Admin dashboard
* [x] Automated testing
* [x] Mobile applications (shopper, staff, delivery)
* [ ] Production deployment — v2 release pending owner

### Future

* [ ] Online payment gateways — architecture and hold/refund flow exist; gateway stays disabled in production
* [ ] Automated brand payouts
* [ ] Commission management
* [ ] Coupons
* [ ] Wishlists
* [ ] Product variants
* [ ] Advanced search
* [ ] Product recommendations
* [ ] Courier integrations
* [ ] GPS delivery tracking
* [ ] Email/SMS/WhatsApp notifications
* [ ] Push notifications — device registration exists; provider wiring pending
* [ ] Advanced reporting

---

# 🛡️ Core Engineering Principles

CityCart prioritizes:

```text
Security
Data Integrity
Tenant Isolation
Reliable Orders
Inventory Accuracy
Testability
Maintainability
Scalability
```

The project intentionally starts as a modular monolith rather than prematurely introducing microservices.

---

# 📄 License

This project is currently under development.

License information will be added before public production distribution.

---

# 👨‍💻 Project Status

**Status:** 🚧 In Development

CityCart is being developed as a scalable full-stack marketplace platform with a strong focus on multi-tenancy, backend authorization, data integrity, and AI-assisted engineering.

---
