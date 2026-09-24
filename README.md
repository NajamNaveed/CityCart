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

Brand administrators can create employees and assign granular permissions such as:

```text
products.view
products.create
products.update
products.delete

orders.view
orders.manage

inventory.view
inventory.manage

customers.view
employees.manage
reviews.manage
analytics.view
```

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
* Failed delivery handling
* Return handling

Advanced courier and GPS integrations are planned for future versions.

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

CityCart currently defines four primary roles:

| Role             | Scope                            |
| ---------------- | -------------------------------- |
| `SUPER_ADMIN`    | Entire platform                  |
| `BRAND_ADMIN`    | Own brand                        |
| `BRAND_EMPLOYEE` | Own brand + assigned permissions |
| `CUSTOMER`       | Own customer resources           |

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
│   └── 18-development-roadmap.md
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

Never commit `.env` files containing secrets.

---

# ▶️ Running Locally

## Start Backend

```bash
cd server
npm run dev
```

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
/users
/cities
/brands
/stores
/categories
/products
/inventory
/cart
/orders
/payments
/delivery
/employees
/reviews
/notifications
/analytics
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
* [ ] Authentication
* [ ] User management
* [ ] Cities
* [ ] Brands
* [ ] Stores
* [ ] Categories
* [ ] Products
* [ ] Inventory
* [ ] Marketplace
* [ ] Cart
* [ ] Multi-brand checkout
* [ ] Orders
* [ ] COD payments
* [ ] Delivery
* [ ] Employee management
* [ ] Permissions
* [ ] Notifications
* [ ] Reviews
* [ ] Basic analytics
* [ ] Brand dashboard
* [ ] Super Admin dashboard
* [ ] Automated testing
* [ ] Production deployment

### Future

* [ ] Online payment gateways
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
* [ ] Push notifications
* [ ] Mobile applications
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
