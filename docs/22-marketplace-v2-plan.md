# 22 — Marketplace v2: Plan with Phases

Status: **in progress.** Written after the project review with the head.

| Phase | State |
|---|---|
| 0 Preparation | done (see Phase 0) |
| 1a Global categories | **done** (server, tests, admin page, brand form, seed, docs) |
| 1b Shared catalogue and listings | **done** (server, tests, admin Catalogue page, brand product form, CSV import, seed, docs) |
| 2 Zones: polygon blocks | **done** (server, tests, admin map editor, seed, docs) |
| 3 Customer area flow, area browsing, address book | **done**: 3a server; 3b website (auto location, overlaps, borders and map picking; range pills inside the chosen blocks; shops with their products; checkout with saved addresses and a delivery pin; cart delivery warning; saved-addresses page); 3c mobile customer app (same area flow, shops and map views, address book, delivery pin at checkout, cart area warning) plus an area-only "also sold by" list on the website and mobile product pages. The public catalogue list and Products view were later removed |
| 4 Picker and substitution | **done** (server, tests, partner picker screens, brand Team picker accounts, customer picker label, seed, docs) |
| 5 Split the apps | **done** (three app-type sign-ins, new `delivery/` app, `partner/` reduced to the Staff app, rider tests moved, docs 20/23) |
| 6 Partial delivery and door returns | **done** (server, tests, delivery app line review, Staff app and web returned-goods inbox, customer display, admin returns, seed, docs) |
| 7 Polish, docs, release | **prepared** (docs, seed walkthrough, `npm run verify`, release runbook). Deploying to Render/Vercel and building the three APKs with EAS need the owner's credentials and approval |

This plan covers eight changes: real zones, customer area choice, global categories, a shared
product catalogue, three separate apps, a picker role, returns, and saved addresses. It ends
with the three Android APKs.

---

## 0. Decisions already made

| # | Decision |
|---|---|
| 1 | **No Flutter.** The apps stay React Native with Expo. |
| 2 | **Fresh database.** A new Atlas cluster is seeded with new demo data. There is **no migration** of old data, so models can change shape freely. |
| 3 | **Seeding.** We edit the existing seed scripts (see §5), not write a parallel set. |
| 4 | **Radius stays.** The customer still sets a range around himself (for example 2 km, 5 km, 10 km), now applied *inside* the chosen block(s). |
| 5 | **Overlapping blocks:** the customer may select **one or several** blocks. He is never forced to pick only one. |
| 6 | **APKs come last.** All three apps are built only after every phase below is done. |
| 7 | **Security hardening is deferred.** It is not part of this plan. |
| 8 | **New packages:** none beyond what the apps already install. The website draws polygons and drops pins with its existing Leaflet map; the customer app draws them with a self-contained OpenStreetMap viewer inside `react-native-webview` (`src/components/map/`). (It first used `react-native-maps`; that was replaced by the WebView so the app needs no Google Maps key or native map SDK.) |
| 9 | **No customer return request after delivery, for now.** Only the **door case** stays: the rider records accepted and rejected items while delivering, whether the order is half or full. A customer coming back later to return something is **not** handled in v2. |
| 10 | **Development database:** a new database name (for example `citycart_v2`) on the same Atlas cluster, set in the local `server/.env`. The live Render site keeps the old database until the release phase. |

---

## 1. Where the project stands today (facts from the repo)

| Area | Today |
|---|---|
| Blocks | A block is a **centre point only** (`center`, no boundary). "Which block am I in" means "nearest centre". |
| Discovery | `/discover` has `scope=block \| radius \| city`, one `blockId`, and `radiusKm`. |
| Categories | Owned by **one brand each** (`brandId` on Category). |
| Products | Owned by one brand each (`brandId`). Two stores selling the same item means two full records. |
| Apps | `mobile/` (customer), `partner/` (staff: brand team and picker) and `delivery/` (rider). |
| Riders | Role `RIDER`, belongs to one brand, signs in only through the delivery app. |
| Substitution | Exists (`OrderAdjustment`: PROPOSED, ACCEPTED, REMOVED, ORDER_CANCELLED, WITHDRAWN, EXPIRED). The **brand** proposes, the customer answers. |
| Returns | **None.** Delivery has a `RETURNED` status and payment has `PARTIALLY_REFUNDED`, but there is no return flow. |
| Addresses | The order keeps an address snapshot. There is **no saved address book**. |
| Seeds | `seed.js`, `seedBlocks.js`, `seedDemo.js` (+ `scripts/demo/build.js`, `catalog.js`). Demo seed fills an *empty* database. |

---

## 2. Target design

### A. Zones: city → block with a real boundary

**Data**
- `Block.area`: GeoJSON `Polygon`, 2dsphere index. `Block.center` stays and is **derived** from the shape (used to frame the map and sort).
- Validation on save: at least 3 distinct corners, ring is closed, no self-crossing, at most 100 points, not a sliver. Overlap with other blocks is **allowed**.
- `Branch.blockIds[]`: the blocks containing the branch's point. Computed when a branch is created or moved, and recomputed for affected branches when a block's shape or active state changes. Indexed.

**Super admin screen** (`client/src/pages/admin/Blocks.jsx`)
- Map editor: click to add corners, drag a corner to move it, undo last point, clear, save. Other blocks of the city show as outlines, so overlaps are visible.
- Info message only (not an error) when a new shape overlaps another block.
- A branch that falls inside no block shows a warning on the brand's branch form and in admin ("not discoverable by area").

**Customer shopping area** (same logic on website and mobile)

The app keeps one state: `{ blockIds: [1..n], origin: {lat, lng, source: gps|pin}, radiusKm | null }`.

1. **On open:** ask for GPS, then ask the server which blocks contain the point.
2. **One block:** selected automatically, shown on the map with its shape, changeable.
3. **Several blocks (overlap):** shown as tick chips, all ticked by default. The customer can untick, or keep both.
4. **Zero blocks (border or outside):** the app says so, shows the nearest blocks as chips and on the map, and the customer chooses one or more.
5. **Pick my own location:** a pin mode. The customer taps the map (for example in D Ground while sitting in Samanabad). The app resolves the blocks at that pin and switches to them. That pin also becomes the delivery location. No address-search service is used, only the pin.
6. **Range pills (kept):** 2 km, 5 km, 10 km, and **Whole block**. Applied around the origin and only to stores inside the selected block(s).
7. **Map shows:** the selected block shape(s) in distinct colours, the radius circle, the origin pin, and **only the stores that pass the filter**.

**Server**
- `GET /blocks/at?lat&lng` (built as `/blocks/at` rather than `/discover/blocks`) returns the blocks containing the point (0, 1 or many) plus the nearest blocks when there are none.
- `GET /discover` takes `blockIds` (list) and optional `lat`, `lng`, `radiusKm`. A store matches when its `blockIds` overlap the list and, if a radius is set, a branch is within it. The old `scope=block|radius` is replaced by "area" (blockIds, with or without radius) and "city" (browse all).

**Cart and checkout rules**
- A store can deliver to an address when the block containing the address pin is in that store's `blockIds`. A store in an overlap serves both blocks. The server enforces this at checkout, not just the app.
- Changing the shopping area with items in the cart: the app warns, and removes items from stores that do not serve the new area (customer confirms).
- Deactivating a block hides it everywhere and recomputes branches.

### B. Global categories and subcategories

- `Category` stops belonging to a brand. Fields: `name`, `slug`, `parentId` (null = top level), `order`, `image?`, `isActive`.
- Two levels only (category → subcategory), enforced on the server. Slug is unique within a parent.
- Managed by the super admin (and an admin partner who has the permission). Brands only **choose** from the tree.
- A product must point at a **leaf** (a subcategory, or a top-level category that has no children).
- A category with children or products cannot be removed. It can be deactivated, which hides it.
- Public read: `GET /categories` returns the tree.

### C. Shared catalogue: no duplicate products

**Naming note:** in this project "Brand" means a *seller*. The maker of the item (Dalda, Nestlé) is called **manufacturer** to avoid confusion.

Two layers:

1. **`CatalogProduct`** (new, global): one record per real-world item, "Dalda Ghee 1 kg". Fields: `name`, `slug`, `manufacturer`, `categoryId`, `description`, `images`, `size {value, unit}`, `barcode` (unique where present), `attributes`, `scope` (`GLOBAL` or `PRIVATE`), `ownerBrandId` (for PRIVATE), `status` (`ACTIVE`, `PENDING`, `REJECTED`, `ARCHIVED`).
2. **`Product`** (existing collection, now the store **listing**): `brandId`, `catalogProductId` (required), `price`, `compareAtPrice`, `sku`, `isActive`, `branchIds`. Unique on `{brandId, catalogProductId}`, so a store lists an item once. Name, description and images come from the catalogue. Cart, orders, inventory and reviews keep pointing at `Product`, so they change very little.

**Who adds what**
- Super admin creates and edits catalogue products, approves requests, and **merges duplicates** (moves all listings from one catalogue product to another).
- A brand searches the catalogue (name or barcode), picks the item, and sets its own price, stock and branches.
- Not in the catalogue: the brand sends a **request** (status `PENDING`, visible only to that brand) for the admin to approve or reject.
- A brand's unique items (a bakery's cake) can be created as `PRIVATE`, visible only to that brand and needing no approval.

**What the customer sees (inside the shopping area)**
- Discovery is shop-first: area results are shops with their products. There is no public
  catalogue grid or product listing — the former grouped "one item, N stores" view was removed.
- The product page still lists the **offers** (store, price, distance, rating, stock) as
  "also sold by", sorted by price or distance. Add to cart picks one specific listing.
- The store page still shows that store's listings, unchanged in feel.
- Search works on shop and product names, limited to the area.
- Orders still split per store, as they do now.

**Reviews:** stay on the listing for v2 (no change). Revisit later.

### D. Three apps

| App | Folder | Package | Roles allowed |
|---|---|---|---|
| Customer | `mobile/` | `com.citycart.app` | CUSTOMER |
| **Delivery** (new) | `delivery/` | `com.citycart.delivery` | RIDER |
| **Staff** (the old partner app, rider screens removed) | `partner/` | `com.citycart.staff` | BRAND_EMPLOYEE, PICKER |

Brand owners (`BRAND_ADMIN`) and the super admin stay **web-only**; the server
refuses their tokens in every app. The table's earlier `BRAND_ADMIN` entry for
the Staff app was not implemented: widening it is a security decision for the
owner (see `20-partner-app.md` §7).

- The sign-in app-type check now covers three app types. Each app rejects roles that do not belong to it, and the server enforces it.
- The delivery app takes over: assigned deliveries, live location sharing, delivery code, payment-proof photo, and the new door-return screen (§F).
- The staff app shows the picker's queue and pick screen; brand owners, managers and records staff use the website.
- Shared code (API client, theme, secure storage, push registration) is **copied** into `delivery/` to keep the repo simple. Extracting a shared package is optional later.
- Riders stay **brand-scoped** for now.

### E. Picker role and substitution

- New role `PICKER`, brand-scoped (added to the brand-scoped list in `config/roles.js`), created by the brand admin, signs in through the staff app only.
- A picker sees the pick queue of his branch: customer **first name** and items. **No** customer phone, prices or payment details.

Flow:

1. Order accepted by the store (existing step).
2. **Picking:** the picker claims the order (`pickerId`) and marks each line `PICKED`, `SHORT` (with the quantity found) or `UNAVAILABLE`.
3. If any line is short, the picker creates an **adjustment proposal** (the existing `OrderAdjustment`): supply fewer units, offer a same-store substitute at the current price, or remove. The proposal records who made it (`proposedBy`).
4. The customer accepts, removes, or cancels (existing flow, including expiry and the push notification).
5. **Packed:** the picker confirms. The order moves on to ready-for-pickup and the existing rider flow.

Data: order gets `pickerId`, `pickStartedAt`, `packedAt`, and per line `pickStatus`, `pickedQty`. No new order statuses were added: claiming moves `CONFIRMED → PROCESSING` and packing moves `PROCESSING → READY_FOR_SHIPMENT`, so the existing dashboard, rider flow and stock movements are unchanged. Stock changes use the existing inventory movements.

**Branch note:** the plan says "queue of his branch", but an order carries no fulfilment branch and inventory is held per brand, so the queue is brand-wide. A branch-scoped queue would first need a branch on the order (and a decision on which branch fulfils an online order) — not invented here.

### F. Partial delivery at the door (returns, v2 scope)

Whether the order is half or full, the rider settles it at the door. A customer
who wants to return something **after** the rider has left is out of scope for v2.

- On the delivery completion screen the rider enters, for each line, the quantity **accepted** and **rejected**, with a reason (`DAMAGED`, `WRONG_ITEM`, `NOT_WANTED`, `MISSING`) and an optional photo.
- The customer pays only for accepted lines. Cash on delivery collects the accepted total. A prepaid order creates a refund for the rejected lines.
- A `Return` (source `DOOR`) is created in status `IN_TRANSIT`. The goods travel back with the rider. The store marks `RECEIVED`, then decides per line to **restock** or **write off**.
- If everything is rejected, the delivery ends as `RETURNED` (an existing delivery status).
- The order records `fulfilment`: `FULL`, `PARTIAL` or `NONE`.

**Money and stock**
- Order keeps `returnedAmount` and `netTotal`. Payment status uses the existing `PARTIALLY_REFUNDED` or `REFUNDED`.
- Commission and payouts (docs/15) subtract rejected lines.
- Restocking writes an inventory movement of type return-restock.
- Multi-document steps (order, return, inventory, payment) use MongoDB transactions. An Atlas cluster is a replica set, so they are available.

**Not in v2:** a customer return request after delivery (return window, pickup of returned goods, refund approval). The `Return` model is designed so it can be added later.

### G. Relations in MongoDB (answer to "tables and relations")

MongoDB does relations by **references**: a field holding another document's `_id`, declared with Mongoose `ref`. `populate()` and `$lookup` are the joins. Unique and compound indexes act as keys. The one difference from SQL is that the **application** enforces integrity, so we deactivate records instead of deleting them, and check for children before removal.

```mermaid
erDiagram
  CITY ||--o{ BLOCK : has
  BLOCK }o--o{ BRANCH : "contains (by shape)"
  BRAND ||--o{ BRANCH : owns
  BRAND ||--o{ USER : "staff, pickers, riders"
  CATEGORY ||--o{ CATEGORY : "has subcategories"
  CATEGORY ||--o{ CATALOG_PRODUCT : groups
  CATALOG_PRODUCT ||--o{ PRODUCT : "listed as"
  BRAND ||--o{ PRODUCT : sells
  PRODUCT ||--o{ INVENTORY : "stock per branch"
  BRANCH ||--o{ INVENTORY : holds
  USER ||--o{ ADDRESS : saves
  USER ||--o{ ORDER : places
  BRAND ||--o{ ORDER : receives
  ORDER ||--o| DELIVERY : "delivered by"
  USER ||--o{ DELIVERY : "rider"
  ORDER ||--o{ ORDER_ADJUSTMENT : "substitution"
  ORDER ||--o{ PAYMENT : "paid by"
  ORDER ||--o{ RETURN : "returned as"
```

Order lines are **embedded** inside `ORDER`, not a separate collection.

We stay on MongoDB. Moving to SQL would mean rewriting every model and the test suites for no gain, and MongoDB's polygon queries are exactly what zones need.

### H. Saved addresses

- New `Address` collection: `userId`, `label`, `fullName`, `phone`, `line1`, `blockId`, `location` (point), `isDefault`. Indexed by `userId`, at most 10 per user.
- Checkout has a "save this address" option (on by default) and a list of saved addresses to choose from. The default one is preselected.
- The order stores its own **snapshot** of the address plus `addressId` and `blockId`, so editing an address later never changes old orders.
- The address pin must pass the delivery rule in §A.
- A customer can edit, delete and set a default address.

---

## 3. Phases

Each phase ends with working, tested code. Existing test suites must stay green. Rough size is S, M or L.

### Phase 0: Preparation (S) — done
- **Database:** use a new database name on the same Atlas cluster (for example `citycart_v2`). Put it in the local `server/.env`:
  `MONGODB_URI=mongodb+srv://USER:PASSWORD@CLUSTER.mongodb.net/citycart_v2?retryWrites=true&w=majority`.
  MongoDB creates the database on the first write. The Atlas database user must be allowed to read and write it.
- **Live site:** Render keeps the old database and the old code until the release phase. Do **not** change Render's `MONGODB_URI` before then.
- After the models are ready, run `npm run seed:demo` (the seed refuses a database that is not empty), then `node scripts/syncIndexes.js`.
- To start over later, drop the dev database (see "Resetting the dev database" below).
- Work on a `v2` git branch. Update the docs a phase touches at the end of that phase.

**Done when:** the server runs locally against the new empty database.

#### Resetting the dev database
Any one of these empties it:
- Atlas: Browse Collections, select the database, then **Drop Database**.
- `mongosh "<your connection string>/citycart_v2" --eval "db.dropDatabase()"`

### Phase 1: Global categories and shared catalogue, server and admin (L)

Split into **1a (global categories, done)** and **1b (catalogue and listings, done)**.

**How 1b was built:** `Product` stays the store listing (cart, orders, inventory and reviews are unchanged). It gains `catalogProductId`, and its name, description, images and category are copied from the catalogue item and refreshed when the item changes. The customer-facing grouping ("one Dalda Ghee, three stores") is built in Phase 3.
- **Server:** new `CatalogProduct` model, routes and service. Rework `Category` (no brand, parent/child). Convert `Product` into the listing (`catalogProductId`, unique per brand). Request, approve, reject and merge actions. Search by name, manufacturer and barcode.
- **Admin web:** Categories page (tree) — **done in 1a**. Catalogue page (create, edit, import CSV), Requests queue, Merge tool — 1b.
- **Brand web:** "add from catalogue" (search, then price, stock, branches), "request a new product", private item.
- **Seed:** global category tree, a catalogue of about 60 items, and listings spread over brands with **deliberate overlaps** (several stores selling the same Dalda ghee).
- **Tests:** category depth and leaf rules, unique listing per brand, request and approval, merge keeps orders and stock intact, private visibility, barcode uniqueness.

**Done when:** two brands list the same catalogue item, and an admin can merge two duplicates without breaking carts or orders.

### Phase 2: Zones: polygon blocks (M) — done

**How it was built:** `Branch.blockId` stays as the shop's home block (the brand chooses it), and the new `Branch.blockIds` lists every block holding the pin. The old `scope=block` and `scope=radius` stay working until Phase 3 moves the customer apps to `scope=area`; `scope=block` already returns overlap shops in both blocks. Blocks without an outline still work (centre only), so nothing breaks while the admin redraws them.

- **Server:** `Block.area`, validation, `Branch.blockIds` with recompute, `GET /discover/blocks`, new `/discover` (blockIds, radius).
- **Admin web:** polygon editor in `Blocks.jsx` with overlap hint, and a "branches outside every block" warning.
- **Seed:** block shapes for the demo city (for example Samanabad, D Ground, Gulberg, Peoples Colony) in `scripts/data/`. Include **two overlapping blocks**, and branches placed in each case: inside one block, inside an overlap, and outside all.
- **Tests:** point-in-polygon matches (inside, edge, outside, overlap), invalid shapes rejected, recompute on shape change, the discover filter with and without radius.

**Done when:** the admin draws blocks, and the discover endpoint returns correct stores for single, overlapping, border and outside points.

### Phase 3: Customer area flow, catalogue views and address book (L) — done

**How it was built:** the website and the customer app share one server model. `GET /blocks/at` answers "which blocks hold this point?" with `{ containing, nearest }`; the apps turn that into found / overlap / border / outside. Both remember `{ blockIds, coords, pinned, range }` on the device and send `scope=area` to `/discover`, with the radius applied inside the selected blocks. Polygons are drawn on the existing maps (Leaflet on the web, OpenStreetMap WebView viewer on mobile) and tapping the map picks the shopping area (and a delivery pin at checkout). Discovery is shop-first: `/discover` returns shops and their products; `/catalog/browse/:catalogProductId` returns the area's offers or a 404 "not sold in your area", and the product page shows them as **area-only** "also sold by" (without an area it asks for one). The public catalogue **list** (`/catalog/browse` and `GET /products`) was later removed — products are reached through a shop or a product page. Checkout requires a delivery location: a saved `addressId`, or a pin that `/blocks/at` puts inside a block, plus an optional `saveAddress`. The confirmation of "can these stores reach this spot?" stays on the server (`CHECKOUT_ISSUES` / `NOT_DELIVERABLE`, `OUTSIDE_DELIVERY_ZONE`), and the cart asks `POST /cart/area-check` to warn and offer removal. Tests: server scenarios in §A; website and mobile screen tests for single block, overlap, border, map picking, catalogue offers, address CRUD and the checkout rules.

- **Server:** `Address` collection and routes, checkout delivery rule (§A), cart area check.
- **Website and mobile:** the shopping-area flow of §A (auto location with an on-demand detect button, multi-select for overlaps, border case, choosing the spot on the map, range pills, block shapes on the map). Mobile draws the polygons and accepts a tapped point with the OpenStreetMap WebView viewer (`src/components/map/mapHtml.js`), with no Google Maps key.
- **Catalogue for customers:** shops with their products in the area, and the offers list on the product page; search in the area.
- **Checkout:** saved addresses, save-this-address, block check with a clear message when the store does not serve the address.
- **Tests:** every scenario in §A on the server, plus screen tests for the multi-select, border and map-picking flows, and address CRUD.

**Done when:** all four scenarios work end to end on both website and mobile: single block, overlap with both selected, border user choosing manually, and Samanabad customer pinning D Ground.

### Phase 4: Picker and substitution (M) — done

**How it was built:** the server reuses `CONFIRMED`, `PROCESSING` and `READY_FOR_SHIPMENT` and adds `pickerId`, `pickStartedAt`, `packedAt` and per-line `pickStatus`/`pickedQty`. A `/picker/*` API (role `PICKER`, brand from the account) lists the brand queue, claims an order atomically, marks lines, proposes a change on short lines through the existing adjustment service (`proposedByRole: PICKER`, substitutes reserved in the same transaction) and packs, which creates the usual delivery. Serializers are allow-lists: first name and items only, never phone, address, price, total or payment. The Partner app sends pickers to a two-tab queue/settings flow and a pick screen with claim, per-line marking, substitute search, note, send, and pack confirmation. Brand admins create pickers from the web Team page (no permissions, refused for employees or with permissions). The customer proposal card adds "Suggested by the store's picker." Seed gives each active brand a picker, a mid-pick order and one pending picker proposal. Tests: `picker.integration.test.js` (isolation, privacy, claim races, line rules, proposal → acceptance → pack → delivery), employee creation, partner screen tests, and the web/mobile label. Known gap: the queue is brand-wide (see §E).

- **Server:** role `PICKER`, pick queue endpoints, line pick statuses, `proposedBy` on adjustments (picker allowed to propose), new or reused order statuses, packed step.
- **Staff app (`partner/`):** picker home with queue, pick screen (per-line picked, short, unavailable), propose substitute (same-store listings), pack confirmation. Brand admin can create pickers.
- **Customer apps:** unchanged flow, but the proposal now notes "suggested by the store's picker".
- **Seed:** a picker per demo brand, orders waiting to be picked, one with a pending substitution.
- **Tests:** a picker cannot see phone or prices, a picker cannot touch another brand's order, short line triggers a proposal, expiry and answers behave as before.

**Done when:** an order moves from placed through picking, a substitution answered by the customer, packed, and ready for the rider.

### Phase 5: Split the apps (M) — done

**How it was built:** the server's `PARTNER_ROLES` became `STAFF_APP_ROLES`
(`BRAND_EMPLOYEE`, `PICKER`) and `DELIVERY_APP_ROLES` (`RIDER`), with two
separate doors: `POST /auth/staff/login` (`X-Client: staff`) and
`POST /auth/delivery/login` (`X-Client: delivery`). Each refuses the other's
header and roles (`403 STAFF_APP_ONLY` / `DELIVERY_APP_ONLY`); a bearer token
carrying the wrong `client` claim is `403 WRONG_APP` on every endpoint. The old
`/auth/partner/login` was removed. A new Expo package `delivery/` copied the
rider screens, services and tests and renamed itself CityCart Delivery
(`citycart-delivery`, `com.citycart.delivery`); `partner/` dropped the rider
group, rider services and rider tests, and is now CityCart Staff
(`citycart-staff`, `com.citycart.staff`) for brand team members and pickers.
Push registration exists in both apps (different destinations); location
sharing lives only in Delivery. Root scripts became `dev:staff`,
`dev:delivery`, `test:staff`, `test:delivery` and `test:apps`. Full detail:
`20-partner-app.md` §5.10 and `23-delivery-app.md`.

- Create `delivery/` from the rider screens and shared code, with its own package, icon and name. Remove rider screens from `partner/` and rename its display name to the Staff app.
- Extend the sign-in app-type check to three apps. Each app rejects the wrong roles.
- Move push registration and rider location sharing to the delivery app.
- **Tests:** per-app role rejection on the server, the delivery app's own suite (carry over the rider tests), the staff app suite without rider tests.

**Done when:** the three apps start and sign in only with their own roles.

### Phase 6: Partial delivery at the door (M) — done

- **Server:** `Return` model and service (door source), completion with accepted and rejected quantities, order `fulfilment` and net totals, restock or write-off at the store, refunds for prepaid orders, commission and payout adjustment.
- **Delivery app:** per-line accept or reject on completion, reasons and photo, payment collected for accepted lines only.
- **Staff app and web (brand):** a returned-goods inbox (mark received, restock or write off).
- **Customer apps and web:** the order shows what was delivered and what was returned, with the final total.
- **Admin web:** returns list and totals.
- **Seed:** orders delivered in full, partially, and fully rejected, with returns in each status.
- **Tests:** quantity rules (cannot reject more than ordered), money (accepted total, refund amounts), stock restore, payouts reduced, role access.

**Done when:** a half-and-half order shows the correct totals, the rejected goods return to the store, stock is corrected, and the payout reflects it.

**How it was built.** The rider's completion call now accepts `lines` and the server recomputes everything from the order: each line's `acceptedQty`/`rejectedQty` must sum to what was ordered, and refused lines need a reason (`DAMAGED`, `WRONG_ITEM`, `MISSING`, `NOT_WANTED`) with an optional private photo. The order gains `fulfilment` (`FULL`/`PARTIAL`/`NONE`), `returnedAmount`, `feeRefunded` (only a full rejection for a store-fault reason refunds the delivery fee) and `netTotal`; a half-and-half order charges COD only `netTotal`, and a prepaid order is refunded the refused value (plus the fee when it applies). A `Return` document stores the refused lines and their photos; `RETURNED` is now reachable on the order and delivery. The store takes the goods in through `POST /returns/:id/receive`, choosing per line **restock** or **write-off** (write-off is the default); restock is the only path that moves stock, with a `RETURN_RESTOCKED` movement. Brand analytics uses `netTotal` and excludes `RETURNED` orders, so the payout basis reflects returns even though the payout ledger itself is still a concept (docs/15 §7). Clients: the Delivery app's line review (kept/refused counters, reasons, camera photo, collect/refund preview), the Staff app's Returns tab and overview tile, the brand website's Returns pages, the admin website's returns list and totals, and a returned-order summary with the final total in the shopper app and both websites. Brand staff with `orders.view`/`delivery.view` receive `RETURN_IN_TRANSIT`. The seed now has orders in all three fulfilments and returns in both statuses (one restocked prepaid return, one in-transit COD return with a photo, one fully rejected COD order whose payment is cancelled). Tests: `server/tests/returns.test.js` (rules, money, stock, roles), `server/tests/integration/returns.integration.test.js` (real MongoDB), `server/tests/seedDemo.test.js`, the app suites and lint. Docs updated: 04, 05, 08, 09, 10, 11, 12, 15, 18, 19, 20, 23 and this file.

### Phase 7: Polish, docs, release (M) — prepared, release pending owner

- Full demo walkthrough (§7) on a freshly seeded cluster.
- Update `docs/` (including `19-mobile-app.md`), add the delivery app doc, and update this file's status.
- Run all suites: server unit and integration, client, mobile, delivery, staff.
- Point Render's `MONGODB_URI` at the new database and deploy the v2 code together.
- Set `EXPO_PUBLIC_API_URL` for each app in EAS (cloud builds do not read your local `.env`).
- Build the three APKs with `npm run build:android:preview` in `mobile/`, `delivery/` and `partner/`.

**Done when:** three installable APKs sign in against the live server and pass the walkthrough.

**How it was prepared.** The repository side of Phase 7 is complete: `npm run verify` at the root runs lint in all five packages, the server unit suite, the server integration suite, the shopper suite and both app suites, then builds the website; `npm run test:all` runs just the test half. The demo seed was run against an isolated empty database and its walkthrough scenarios were checked (zones and overlap stores, the shared catalogue, pickers, fulfilments `FULL`/`PARTIAL`/`NONE`, and returns in `IN_TRANSIT`/`RECEIVED`). `docs/17` now has the v2 release runbook (Render/Vercel/EAS environment matrix, fresh-database seed, deploy order, APK commands and rollback), `docs/19`/`20`/`23` describe the current apps, and the walkthrough in §7 below is the ordered manual sequence. The remaining steps — pointing Render at the new Atlas cluster, deploying, and the three EAS APK builds — need the owner's credentials and explicit approval; they are not run by an agent.

---

## 4. Order and dependencies

```
Phase 0 → 1 (categories, catalogue) → 2 (zones) → 3 (customer flow, addresses)
                                              ↘ 4 (picker) → 5 (app split) → 6 (returns) → 7 (release)
```

Phases 1 and 2 change the data shape, so they come first. Phase 3 needs both. The picker (4) can start once Phase 1 is done. The app split (5) comes before returns (6), because the door-return screen belongs in the delivery app.

---

## 5. Seed plan (fresh cluster)

Edit the existing scripts rather than adding new ones, because `seedDemo.js` already generates a complete marketplace (cities, brands in every status, owners, staff, products, stock, customers, carts, orders in every state) and refuses to run on a non-empty database.

| File | Change |
|---|---|
| `scripts/demo/catalog.js` | Becomes the global category tree and catalogue products, plus per-brand listings. |
| `scripts/demo/build.js` | Adds block polygons, branch `blockIds`, pickers, riders, saved addresses, orders in picking, substitution, partial delivery and return states. |
| `scripts/seedBlocks.js` | Reads polygons from `scripts/data/` instead of centre points. |
| `scripts/seedDemo.js` | Calls the above, then runs the index sync. |
| `scripts/seed.js` | Minimal seed (admin, one brand). Updated to the new models. |

Demo data must include the scenarios of the walkthrough in §7, so each one can be shown without setup.

---

## 6. Defaults (change any of these by telling us)

| # | Default |
|---|---|
| D1 | Riders belong to one brand (no platform-wide fleet yet). |
| D2 | Overlap: all containing blocks start ticked, the customer may untick. |
| D3 | Range pills 2 km, 5 km, 10 km, Whole block. |
| D4 | Only the super admin creates catalogue products. Brands request or add private items. |
| D5 | Customer return requests after delivery are not part of v2. |
| D6 | Delivery fee is refunded only when the store is at fault. |
| D7 | Cash on delivery: rejected lines are simply not collected, so no refund is needed. Prepaid orders are refunded to the original payment. |
| D8 | Picker never sees customer phone, prices or payment details. |
| D9 | Product reviews stay on the listing. |
| D10 | Up to 10 saved addresses per customer. |
| D11 | Pin dropping only, no address search service. |
| D12 | No new packages: Leaflet on the web; on mobile, OpenStreetMap tiles in `react-native-webview` (a Google-free replacement for the original `react-native-maps`). |

---

## 7. Demo walkthrough (for the presentation)

Run this against a **freshly seeded** database (`npm run seed:demo`), with the API, website and all three apps pointed at that API. Use these seeded accounts (the seed prints them again at the end):

| Who | Sign-in | Password |
|---|---|---|
| Super admin | `admin@citycart.local` on `/admin/login` | `Admin@12345` |
| Brand owner (Loom & Co.) | `brand@citycart.local` on `/sell/login` | `Brand@12345` |
| Records keeper (Loom & Co.) | `hira.anwar@citycart.demo` in the **Staff** app | `Demo@12345` |
| Picker (Loom & Co.) | `areeba.saleem@citycart.demo` in the **Staff** app | `Demo@12345` |
| Rider (Loom & Co.) | `shoaib.raza@citycart.demo` in the **Delivery** app | `Demo@12345` |
| Customer | `sana.iqbal@citycart.demo` on `/login` and the shopper app | `Demo@12345` |

1. **Zones:** the super admin opens `/admin/blocks`, draws or edits a block, and sees the overlap hint; save and reload.
2. **Single block:** a customer inside one block sees its shape and only its stores.
3. **Overlap:** a customer in the D Ground / Peoples Colony overlap sees both blocks ticked, unticks one, then ticks both again; Mehr Menswear Faisal Chowk is found in both.
4. **Border:** a customer outside every block gets the nearest blocks and chooses (for example Gulistan Colony offers Peoples Colony).
5. **Other area:** a Samanabad customer chooses a spot in D Ground on the map and sees only D Ground stores, then delivers there.
6. **Range:** the customer switches 2 km, 10 km, 20 km, the whole city and Whole block, and the map and results update.
7. **No duplicates:** "Plain White Cotton Suit Length, 2.5 m" appears once per store, and its product page's "Also sold by" lists the three store offers (Loom & Co., Rangrez Prints, Mehr Menswear) with different prices.
8. **Address book:** the customer saves an address, makes it default, and sees it preselected at the next checkout; an address outside every block is refused.
9. **Picker:** the picker signs in on the Staff app, claims a picking order, marks a line short, proposes a substitute; the customer accepts or keeps the rest; the brand order shows "Suggested by the store's picker" and the picker packs.
10. **Checkout:** a multi-brand cart becomes one order per brand; the delivery pin is checked against `/blocks/at`; notes are required; the address is saved and preselected next time.
11. **Delivery app:** the rider opens the assigned delivery, takes the customer's six-digit code, completes it. For the door-return story, keep some units and refuse the rest with a reason (and optionally a photo); the app previews "Collect for what they kept" and the server confirms the final amount.
12. **Staff app — returns:** the records keeper opens the Returns tab (the home tile shows "Returns to receive"), opens a return, views a refused line's photo, and taps **Mark received**, ticking only the sellable lines. The second attempt is refused; a write-off leaves stock alone.
13. **Brand web:** `/brand/returns` lists the brand's returns with the money; the order detail shows the final total. **Admin web:** `/admin/returns` lists all brands with totals, and the admin can read but not receive.
14. **Customer view:** the order in the website and shopper app shows what arrived, which lines came back and why, the returned value and the **Final total**. The customer gets the normal delivery notification and, for a prepaid return, a refund notification; the brand gets `RETURN_IN_TRANSIT`.
15. **Access rules:** a Delivery-app token is refused by the Staff app and the website (`403 WRONG_APP`); a brand user cannot open another brand's return; only a brand user with `delivery.manage` can receive; the platform admin cannot receive.
16. **Release:** deploy the API and website, then build the three APKs (`docs/17` §30). Sign each app in with its own role and repeat steps 2, 9, 11 and 12 against the live API.

---

## 8. Risks

| Risk | Mitigation |
|---|---|
| OpenStreetMap public tiles are for light use only | Fine for demo. A free tile-provider key is a one-line change if usage grows. |
| Polygon edge cases (shapes touching, tiny blocks) | Validation rules in §A, plus tests with real shapes from the seed. |
| Catalogue and listing split touches many screens | Phase 1 keeps `Product` as the listing so cart, orders and inventory barely change. |
| Door returns touch money, stock and payouts together | Transactions plus a dedicated test set (§Phase 6). |
| Three apps triple the build and test work | Copy-first approach, one shared checklist per app. |

---

## 9. Not in this plan

- A customer return request after delivery (decision 9).
- Security hardening (deferred by request; revisit before a public launch).
- A real payment gateway (the test gateway stays).
- A platform-wide rider fleet.
- Address search (geocoding).
- iPhone builds.
