# 21 — Next Features: Plan

Written October 2026, after the owner's full test of the Partner programme (`20-partner-app.md`).
**G (admin partner) and H (substitution) are built; I (payment proof photo) is not built yet.**
It is the plan the owner asked for first. Every "Decision" has a default
(what will be built unless the owner says otherwise).

Recommended order: **G (admin partner), then H (substitution), then I (payment proof photo).**
Reason: G is self-contained and small; H is core commerce and needs only server, web and the shopper
app; I needs a new package, the camera, private photo storage and a real phone to test.

---

# G. A partner for the super admin ("admin team")

**Status: built (October 2026).**

## G.1 What exists today (facts)

* Exactly **one** `SUPER_ADMIN` account is allowed (a unique index, `single_super_admin`, in `user.model.js`).
* About twenty admin routes are guarded with `requireRole(SUPER_ADMIN)`; there are no permissions for admins.
* Brand teams already have the pattern we need: `Employee` + permission names + `requirePermission`.

## G.2 Design

* A new role **`ADMIN_PARTNER`** (account type `PLATFORM_ADMIN`, like the super admin; no brand).
  The single-super-admin rule stays: the partner is a *different role*, not a second super admin.
* A `AdminPartner` model (mirrors `Employee`): `userId`, `permissions[]`, `isActive`, `createdBy`.
* **Permissions** the super admin ticks per partner: `admin.brands` (review applications, suspend, terminate),
  `admin.users`, `admin.orders`, `admin.reviews`, `admin.locations` (cities and areas), `admin.settings`,
  `admin.analytics`, `admin.payments` (gateway review list). Presets: "Full partner" (all of these) and "Read only".
* **Only the super admin can**: add, edit, deactivate or reset a partner; see the audit log; and nothing a
  partner does can touch the super admin's account. These are not delegatable permissions.
* The super admin is implicitly allowed everywhere; a partner is allowed only where the permission matches.
  Every existing `requireRole(SUPER_ADMIN)` admin route becomes "super admin, or partner with the matching permission".
* **Sign-in:** the existing `/admin/login` accepts both roles; web only (partners do not use the Partner app).
  Session length is the short staff session. The partner is created with a temporary password and **must change it
  at first sign-in** (a `mustChangePassword` flag).
* **Audit log:** a small `AdminAction` collection (actor, action, target, time) written for every admin write by
  anyone, so two people acting on the platform stay accountable. Visible to the super admin only.

## G.3 Screens

* Web admin area: **Admin team** page (list, add partner, tick permissions, deactivate, reset password), an
  **Activity** page (the audit log). A partner's menu shows only what they may open.

## G.4 Tests that must exist

An authorization matrix over **every** admin route (super admin, partner with and without the permission, brand
user, customer, rider, signed out); a partner cannot create or alter partners or the super admin; deactivated
partner is signed out at once; first-login password change; audit rows written.

## G.5 Decisions (defaults)

1. Up to **5** partners. 2. Default preset "Full partner". 3. A partner with `admin.brands` may approve **and**
terminate brands. 4. Audit log included. 5. Two-factor sign-in: not now (recommended later for admin accounts).

## G.6 Steps

G1 role, model, permissions, service and routes, login; G2 migrate every admin route and its tests;
G3 web pages; G4 audit log; G5 docs (`02`, `04`, `05`, `06`).

---

# H. Substitution: the brand cannot supply what was ordered

**Status: built (October 2026).** Rules are in `08-order-management.md` §41, stock in `09-inventory-management.md` §25, money in `10-payment-system.md` §30, notifications in `12-notification-system.md` §32, endpoints in `05-api-specification.md` §16–17.

Example: the customer ordered 3 pieces; the brand finds 1 in good condition. The brand talks to the
customer and offers another product, or the customer refuses. This chapter is everything attached to that.

## H.1 When it can happen

Only **before the order is ready for shipment** (statuses `PENDING`, `CONFIRMED`, `PROCESSING`), so no delivery
exists yet. One proposal per order at a time.

## H.2 The proposal

The brand (permission **`orders.adjust`**, new) opens the order and proposes a change. For each affected line it states:
how many units it **can** supply, and for the rest either a **substitute** (another product of the same brand,
quantity, today's price) or **nothing** (remove). It shows the customer the new total before sending, plus a note.
Stored as an `OrderAdjustment` (status, lines, totals before and after, who proposed, expiry, response).

## H.3 What the customer can do

Three buttons (shopper app and website): **Accept the change**, **Keep the rest, remove those items**, or
**Cancel the whole order**. The brand can also **withdraw** the proposal. If the customer does not answer within
**24 hours** the proposal expires: nothing is changed automatically (never substitute without consent); the
brand is told and decides.

## H.4 Everything it touches (the rules)

| Thing | Rule |
|---|---|
| **Stock of the substitute** | Reserved (deducted) when the proposal is **sent**, released if it is declined, withdrawn or expires. Never oversold; an unavailable substitute is refused with `409`. |
| **Stock of the removed units** | Returned to stock **only if the brand ticks it** (default off: units that are damaged are not stock). |
| **Order lines and total** | On acceptance the lines and `total` are rewritten; the original is kept in the adjustment (history). Delivery fee and discount stay as they were. |
| **Payment, cash on delivery** | The payment amount becomes the new total; the rider will collect the new amount. |
| **Payment, paid online** | Allowed only if the new total is **not higher**; the difference is recorded as a refund. An **unpaid** online order cannot be adjusted until it is paid. |
| **Gate** | While a proposal is waiting, the brand cannot move the order to ready for shipment (`409 ADJUSTMENT_PENDING`). The customer can still cancel the order. |
| **Delivery, rider, receipts** | Created later from the final lines; the receipt shows the final items. |
| **Notifications** | `ADJUSTMENT_PROPOSED` (customer), `ADJUSTMENT_ANSWERED`, `ADJUSTMENT_EXPIRED` (brand), also as push for the Partner app. |
| **Chat** | The notification links to the order; the existing chat is used to talk. (Automatic chat messages: later.) |
| **Inventory ledger** | Every stock movement above is recorded with its own reason. |
| **Who sees what** | The customer: their own proposals. The brand: its own. The super admin and partners: read only. Riders: nothing. |

## H.5 Screens

Brand website: **Propose a change** on the order page, and the proposal's state. Shopper app and website: a
proposal card on the order with the three buttons. Records app: shows the adjustment history (read only).

## H.6 Tests that must exist

Atomic stock (substitute reserved once, released once, never negative); each customer choice; expiry; withdraw;
the gate; totals for cash orders and paid online orders (refund of the difference, refusal of an increase); tenant
isolation (a brand cannot touch another brand's order or product); permission `orders.adjust`; no double processing
when two answers arrive together.

## H.7 Decisions (defaults)

1. Substitute only products of the **same brand**. 2. Reserve the substitute **when proposing**. 3. 24-hour answer
window, brand decides after expiry. 4. Delivery fee and discount unchanged. 5. Removed units back in stock only if ticked.
6. Brand creates proposals on the **website** first; the Partner app only reads them.

## H.8 Steps

H1 model, service, endpoints, stock and payment rules, tests; H2 brand website; H3 customer website and shopper app;
H4 notifications, expiry timer, seed data; H5 docs (`08`, `09`, `10`, `12`, `05`).

---

# I. Payment proof photo at the door (receipt photo and card machine)

## I.1 The situation

The order is cash on delivery, but at the door the customer pays another way: a bank transfer to the brand,
JazzCash, Easypaisa or another wallet, or by card on a card machine the rider carries. The rider takes a **photo
of the payment confirmation** (or the machine's slip) and submits it.

## I.2 How the rider completes a delivery

Enter the customer's code (as today), then **"How did the customer pay?"**: **Cash**, **Bank transfer**, **Wallet**
(JazzCash, Easypaisa, Other) or **Card machine**. For anything but cash: take a **photo** (camera only) and type the
**reference** (transaction id, or the machine's approval code). Then complete. A prepaid order shows none of this.

## I.3 Verification is the brand's control (important)

A photo can be faked, so a non-cash payment is **paid but "unverified"** until the brand checks it against its own
bank, wallet or card-machine statement. The records person sees a queue **"Payments to verify"** with the photo and
reference, and chooses **Verified** or **Rejected** (with a reason). A rejection raises a flag to the brand owner;
what happens next (collect again, write off) is the brand's decision and is recorded. Cash is unchanged: it still goes
through the rider's cash hand-over; **non-cash payments never appear in the rider's cash balance**.

## I.4 Photos are private (never public links)

* Stored as **private (authenticated) uploads** in Cloudinary, in a folder from the brand and delivery (never from
  client input), shown to staff only through **short-lived signed links** (about 5 minutes). Product photos stay public; these do not.
* **Who can see a proof:** the records person (`payments.view`) and brand owner of that brand; the super admin and
  partners (with `admin.payments`); **not** the customer, **not** other riders, **not** other brands. The rider who
  took it sees only its status afterwards.
* The app warns "photograph the confirmation or the slip, never the card". Card numbers are **never** typed or stored.
* Photos are **deleted automatically 90 days after verification** (a job; the period is configurable).
* Duplicate use is flagged: the same reference or the same photo (Cloudinary's file fingerprint) on another payment.

## I.5 Receipts

The receipt says how it was paid ("Paid by JazzCash, reference …"). The customer sees the method, never the photo.
The brand's view also shows the verification state. The existing receipt number and rules (`10 §28`) are unchanged.

## I.6 Data and API (summary)

`Payment` gains `collection: { method, wallet?, reference, proof: { publicId, fingerprint }, verification:
SUBMITTED | VERIFIED | REJECTED, verifiedBy, verifiedAt, note }`. Endpoints: a signed-upload request for the rider
(`POST /rider/deliveries/:id/proof-upload`), the complete call extended with the collection details, the brand's
queue (`GET /payments/proofs`), a signed view link (`GET /payments/:id/proof`), and the decision
(`PATCH /payments/:id/proof`, needs `payments.manage`). The server checks that the photo path belongs to **this
brand, this rider and this delivery**.

## I.7 What it needs

* **New package, Partner app only:** `expo-image-picker` (camera). Photos are taken at reduced quality with location
  data left out. No other package.
* **Cloudinary must be configured** (the variables already exist). Without it the choice "bank/wallet/card" is hidden
  and only cash is offered.
* A real phone to test (the camera).

## I.8 Tests that must exist

Rider can only attach a proof of their own delivery and brand; non-cash requires proof and reference; cash cannot
carry a proof; cash balance excludes non-cash; the queue and the signed link are scoped by brand and permission;
verification decisions; retention job; duplicate flags; receipts show the method.

## I.9 Decisions (defaults)

1. Methods: Cash, Bank transfer, Wallet (JazzCash, Easypaisa, Other), Card machine. 2. Private Cloudinary storage,
not the database. 3. Keep photos 90 days after verification. 4. The customer never sees the photo. 5. A rejected proof
is flagged and left to the brand (no automatic reversal).

## I.10 Steps

I1 model, private upload signing, endpoints, tests; I2 rider screens (method, camera, reference); I3 records
verification queue; I4 receipts, retention job, seed data; I5 docs (`10`, `11`, `05`, `20`).
