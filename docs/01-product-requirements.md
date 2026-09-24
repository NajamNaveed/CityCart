# CityCart — Product Requirements Document

**Document Version:** 1.0
**Status:** Draft
**Project:** CityCart
**Document Type:** Product Requirements Document (PRD)

---

## 1. Product Overview

CityCart is a **city-based, multi-vendor e-commerce marketplace** that allows local brands and businesses to establish and manage their own online stores within a shared platform.

Customers can discover brands operating in their city, browse their products, place orders, and track purchases through a single marketplace.

Each brand receives its own management environment where authorized users can manage products, inventory, orders, customers, employees, and store information.

The platform is centrally managed by a Super Admin who oversees cities, brands, customers, platform operations, and system-wide analytics.

---

## 2. Problem Statement

Many local brands and businesses want to sell their products online but may not have the technical resources, budget, or expertise required to build and maintain an independent e-commerce website.

At the same time, customers often need to search across multiple local businesses to discover products available within their city.

CityCart addresses both problems by providing:

1. A shared online marketplace for customers.
2. A dedicated online store environment for each participating brand.
3. Management tools for products, inventory, orders, and employees.
4. Centralized administration for the entire marketplace.

---

## 3. Product Vision

CityCart aims to provide a scalable digital marketplace where local businesses can establish an online presence without building an e-commerce platform from scratch.

The platform should eventually support multiple cities, thousands of products, multiple brands per city, and different operational teams while maintaining strict separation between each brand's private data.

---

## 4. Core Concept

The platform follows this hierarchy:

```text
Platform
│
├── Cities
│   │
│   ├── Brand A
│   │   ├── Store
│   │   ├── Products
│   │   ├── Orders
│   │   └── Employees
│   │
│   ├── Brand B
│   │   ├── Store
│   │   ├── Products
│   │   ├── Orders
│   │   └── Employees
│   │
│   └── Brand C
│
└── Customers
```

A customer interacts with the marketplace, while brands operate their own stores inside the platform.

---

# 5. Target Users

CityCart has four primary user types.

## 5.1 Super Admin

The Super Admin manages the entire platform.

Responsibilities include:

* Managing cities
* Managing brands
* Managing customers
* Managing platform users
* Approving or rejecting brands
* Managing platform categories/settings
* Monitoring orders
* Monitoring platform activity
* Viewing platform-wide analytics
* Managing commissions and payouts
* Handling platform-level issues

---

## 5.2 Brand Admin

A Brand Admin manages one specific brand.

Responsibilities include:

* Managing the brand profile
* Managing store information
* Managing products
* Managing categories
* Managing inventory
* Managing orders
* Viewing customers associated with their orders
* Managing employees
* Viewing brand analytics
* Managing store settings

A Brand Admin must not be able to access another brand's private data.

---

## 5.3 Brand Employee

Brand Employees work for a specific brand.

Their access is controlled through permissions.

Examples include:

* View orders
* Manage orders
* View products
* Manage products
* View inventory
* Manage inventory
* View customers
* Manage deliveries

Employees should only have access to functionality explicitly assigned to them.

---

## 5.4 Customer

Customers use CityCart to purchase products.

Customers can:

* Register and log in
* Select or browse their city
* Discover brands
* Browse products
* Search and filter products
* Add products to their cart
* Checkout
* Place orders
* Track orders
* View order history
* Manage delivery addresses
* Review eligible products
* Receive notifications

---

# 6. Core Platform Features

## 6.1 Authentication

The platform must provide secure authentication for all users.

Required functionality:

* Registration
* Login
* Logout
* Password hashing
* Authentication sessions/tokens
* Protected routes
* Role-based authorization
* Password management
* Account activation/deactivation

---

# 7. City Management

Cities are a core part of the marketplace structure.

The Super Admin can:

* Create cities
* Edit cities
* Activate cities
* Deactivate cities
* View brands operating in a city

Example:

```text
Faisalabad
├── Brand A
├── Brand B
└── Brand C

Lahore
├── Brand D
├── Brand E
└── Brand F
```

The architecture must support adding additional cities without changing the underlying application structure.

---

# 8. Brand Management

Brands can operate their own stores within CityCart.

A brand profile may contain:

* Brand name
* Logo
* Cover image
* Description
* Contact information
* Address
* City
* Opening hours
* Delivery settings
* Store status

The Super Admin controls the platform-level lifecycle of brands.

Possible brand states include:

```text
PENDING
ACTIVE
SUSPENDED
REJECTED
INACTIVE
```

---

# 9. Product Management

Each brand can manage its own products.

Product functionality includes:

* Product creation
* Product editing
* Product archiving
* Product images
* Product description
* Price
* Discount
* SKU
* Stock quantity
* Product category
* Product status

Products must always be associated with their owning brand.

A brand must never be able to modify or delete another brand's products.

---

# 10. Category Management

Categories organize products for customers.

The initial system should support brand-specific categories.

Example:

```text
Brand A
├── Men's Clothing
├── Women's Clothing
└── Accessories
```

Categories may later be expanded to support platform-wide/global categories if required.

---

# 11. Marketplace

The customer-facing marketplace allows users to discover products.

Customers should be able to:

* Browse brands
* Browse products
* Browse categories
* Search products
* Filter products
* Sort products
* View product details
* View brand information

The marketplace should support city-based discovery.

Example:

```text
Customer selects:
Faisalabad

↓

Available brands

↓

Select:
Brand A

↓

Brand Store

↓

Browse Products
```

---

# 12. Shopping Cart

Customers can add products to their cart.

The cart should support products from multiple brands.

Example:

```text
Cart

Brand A
├── Product A1
└── Product A2

Brand B
└── Product B1
```

The system must validate:

* Product availability
* Current price
* Stock availability
* Product status
* Brand/store status

The server must calculate final prices rather than trusting totals supplied by the client.

---

# 13. Multi-Brand Checkout

A customer may purchase products from multiple brands during one checkout process.

The system should group cart items by brand.

Example:

```text
Cart

Brand A
└── Product A

Brand B
└── Product B
```

After checkout:

```text
Order #1001
Brand A

Order #1002
Brand B
```

The customer can view both orders through their account.

Each brand can only access the order belonging to that brand.

---

# 14. Order Management

Orders represent the transaction between a customer and a brand.

An order should contain information such as:

* Order number
* Customer
* Brand
* Products
* Quantities
* Product prices
* Discounts
* Delivery charges
* Total amount
* Delivery address
* Payment method
* Payment status
* Order status
* Timestamps

Initial order lifecycle:

```text
PENDING
   ↓
CONFIRMED
   ↓
PROCESSING
   ↓
READY_FOR_SHIPMENT
   ↓
SHIPPED
   ↓
OUT_FOR_DELIVERY
   ↓
DELIVERED
```

Alternative states may include:

```text
CANCELLED
REJECTED
RETURN_REQUESTED
RETURNED
REFUNDED
```

The exact transition rules will be defined in the Order Management documentation.

---

# 15. Customer Order Experience

Customers should be able to view:

* Order number
* Brand
* Ordered products
* Quantities
* Prices
* Delivery address
* Payment method
* Order total
* Order status
* Order timeline
* Brand information

Customers should also have access to their historical orders.

---

# 16. Brand Order Experience

Brands should have access to orders belonging to their own stores.

Brand users can:

* View orders
* View customer information required for fulfillment
* View ordered products
* Confirm orders
* Process orders
* Update order status
* Cancel/reject eligible orders
* Prepare orders for shipment
* Manage delivery assignment where applicable

A brand must never access another brand's customer/order information.

---

# 17. Inventory Management

The inventory system manages product availability.

Required functionality:

* Stock quantity
* Stock updates
* Stock adjustments
* Low-stock detection
* Out-of-stock state
* Inventory history
* Stock changes caused by orders
* Stock restoration after eligible cancellations

Inventory changes must be performed server-side.

---

# 18. Employee Management

Brand Admins can create and manage employees.

Employee functionality includes:

* Create employee account
* Assign permissions
* Activate/deactivate employee
* Update employee information
* Remove employee access

Permissions should be granular.

Example:

```text
orders.view
orders.manage

products.view
products.create
products.update
products.delete

inventory.view
inventory.manage

customers.view
```

The permission system should be extensible so new permissions can be introduced without redesigning authentication.

---

# 19. Delivery Management

The platform should support basic delivery management.

Initial functionality:

* Delivery address
* Delivery fee
* Delivery status
* Delivery assignment
* Delivery employee access
* Customer delivery information

The architecture should allow future integration with external courier services.

---

# 20. Payment Management

The initial MVP should support:

**Cash on Delivery (COD).**

The payment architecture should be designed so online payment providers can be integrated later without redesigning the entire order system.

Payment information should include:

* Payment method
* Payment status
* Transaction reference where applicable
* Payment timestamps

---

# 21. Reviews and Ratings

Customers may review eligible products after purchasing them.

The system should support:

* Product ratings
* Written reviews
* Verified purchase validation
* Review moderation
* Brand responses

Customers should not be able to create arbitrary reviews for products they have not purchased.

---

# 22. Notifications

The platform should provide notifications for important events.

### Customer

* Order placed
* Order confirmed
* Order shipped
* Order delivered
* Order cancelled
* Refund processed

### Brand

* New order
* Low stock
* New review

### Employee

* Assigned order
* Order updates
* Operational notifications

The initial implementation may use in-app notifications.

External notifications such as email, SMS, WhatsApp, and push notifications can be added later.

---

# 23. Analytics

## Super Admin Analytics

The Super Admin should eventually be able to view:

* Total customers
* Total brands
* Total products
* Total orders
* Total revenue
* Orders by city
* Brand performance
* Customer growth
* Product performance

## Brand Analytics

Brand Admins should be able to view:

* Orders
* Revenue
* Products
* Customers
* Inventory
* Top-selling products
* Order trends

Brand analytics must only contain data belonging to that brand.

---

# 24. Platform Commission

The platform may eventually generate revenue through commissions.

Example:

```text
Product/order value: 5,000 PKR

Platform commission: 10%

Platform earnings: 500 PKR
Brand earnings: 4,500 PKR
```

Commission functionality is considered an advanced feature and does not need to be part of the initial MVP.

The architecture should nevertheless allow it to be added later.

---

# 25. Multi-Tenant Data Isolation

CityCart is a multi-tenant system.

Each brand represents a logical tenant.

Brand-owned resources must contain an association with the relevant brand.

Examples:

```text
Product → Brand
Order → Brand
Employee → Brand
Category → Brand
Inventory → Brand
```

Authorization must verify both:

1. Whether the user has permission to perform the action.
2. Whether the requested resource belongs to the user's brand.

Example:

```text
Brand A Employee
        ↓
Request Product belonging to Brand B
        ↓
Access Denied
```

This rule is mandatory throughout the backend.

---

# 26. Security Requirements

The application must implement:

* Secure password hashing
* Protected authentication
* Authorization middleware
* Role-based access control
* Permission-based access control
* Request validation
* Rate limiting
* Secure HTTP headers
* CORS configuration
* Secure cookie configuration where applicable
* Input sanitization/validation
* Secure file uploads
* Protection against unauthorized tenant access
* Proper error handling
* No sensitive information in API responses

Security requirements will be expanded in the Security Documentation.

---

# 27. MVP Scope

The first usable version of CityCart should focus on the core marketplace.

### Included in MVP

```text
Authentication
Users
Roles
RBAC
Cities
Brands
Stores
Categories
Products
Inventory
Customer marketplace
Search/filtering
Cart
Checkout
COD
Orders
Order management
Basic employee management
Basic notifications
Basic admin dashboard
Basic brand dashboard
```

### Not required for initial MVP

```text
Online payments
Advanced courier integrations
Complex commission/payout system
SMS
WhatsApp notifications
Advanced recommendation engine
Advanced search engine
Real-time GPS delivery tracking
AI product recommendations
Mobile applications
```

These can be introduced after the core system is stable.

---

# 28. Future Expansion

CityCart should be designed with future expansion in mind.

Potential future features include:

* Online payments
* Courier API integrations
* Delivery tracking
* Mobile applications
* Push notifications
* Seller subscriptions
* Advanced commission management
* Brand advertising
* Featured products
* Coupons
* Promotional campaigns
* Loyalty programs
* Product recommendations
* Advanced search
* AI-powered customer support
* AI-powered product recommendations
* Multi-country support

Future features should not unnecessarily complicate the MVP architecture.

---

# 29. Non-Functional Requirements

## Performance

The system should:

* Use pagination for large datasets
* Use database indexes for frequently queried fields
* Avoid unnecessary API requests
* Optimize product images
* Use efficient database queries

## Scalability

The architecture should allow:

* More cities
* More brands
* More customers
* More products
* More employees
* More orders

without requiring a complete architectural rewrite.

## Maintainability

The codebase should:

* Follow consistent naming conventions
* Separate business logic from controllers
* Use reusable components
* Use reusable services
* Validate API input
* Have clear error handling
* Include tests for critical functionality

## Availability

The production system should eventually include:

* Monitoring
* Error logging
* Database backups
* Health checks
* Deployment rollback strategy

---

# 30. Success Criteria

The MVP will be considered functional when:

1. A Super Admin can create and manage cities.
2. A brand can be registered and approved.
3. A Brand Admin can manage its store.
4. A Brand Admin can create products and categories.
5. Customers can discover brands by city.
6. Customers can browse products.
7. Customers can add products to a cart.
8. Customers can checkout using COD.
9. The system can split multi-brand carts into separate brand orders.
10. Brands can manage their own orders.
11. Inventory updates correctly when orders are processed.
12. Brand employees can only access their assigned permissions.
13. Customers can track their orders.
14. Brands cannot access another brand's private data.
15. Super Admin can monitor the overall platform.
16. Critical workflows have automated tests.
17. The application can be deployed using the planned infrastructure.

---

# 31. Product Principle

CityCart should prioritize:

**Security → Correctness → Maintainability → User Experience → Performance → Feature Expansion**

New features should not be added at the expense of tenant isolation, data integrity, authorization, or order correctness.

---

# 32. Current Project Status

**Current Phase:** Product Definition

**Next Document:**

`02-user-roles-and-permissions.md`

The next document will convert the four user types into a **complete permission matrix**, including exactly what Super Admin, Brand Admin, Brand Employee, and Customer can view, create, update, delete, approve, and manage.
