# 29 — AI Phase Roadmap (3 agents per phase: a / b / c)

> Place at `CityCart/docs/29-ai-phase-roadmap.md`.
> This file is the **build order**. It replaces section 7 of doc 27 and the phase columns in doc 27's tables.
> Architecture, guardrails and file layout stay in `27-ai-agents-and-automation-plan.md`. Vision details stay in `28-sightwise-integration.md`.

## How to work through it

1. Each phase contains **three** sub-phases (`1a`, `1b`, `1c`). Build and finish them **one at a time**: endpoint + tools + UI + tests, then move on.
2. One branch per sub-phase, for example `feature/ai-1a-listing-writer`, merged when its "Done when" is true.
3. A phase is **complete** only when its **gate** (below) passes. Then tag it (`ai-phase-1`) and start the next phase.
4. Order: **Phase 0 (foundation) -> Phases 1-4 (agents) -> Phase 5 (automation) -> Phase 6 (vision) -> Phase 7 (hardening)**.

## Overview

| Phase | Theme | a | b | c |
|---|---|---|---|---|
| 0 | Foundation | provider router | usage log + cache + kill switch | route, auth, rate limit |
| 1 | Quick-win generation | Listing writer (brand) | Review summarizer (customer) | Chat translator (customer + brand) |
| 2 | Customer assistants | Shopping assistant | Order helper | Service booking helper |
| 3 | Seller intelligence | Seller advisor (restock, pricing, analytics Q&A) | Catalogue matcher + CSV cleaner | Reply drafter (reviews + chat) |
| 4 | Operations agents | Picker substitution | Admin triage (billing help, support) | Moderation agent |
| 5 | **Automation** | Event automations (review, product) | Scheduled automations (nightly, weekly) | Risk and admin automations |
| 6 | **Vision link** (Sightwise) | "Scan product" in listing form | Fruit freshness scan | Return evidence + authenticity |
| 7 | Hardening | Security tests | Quota and cost review | Docs, release |

---

## Phase 0 — Foundation (no agents yet)

Build once; every agent depends on it.

| Sub | Work | Done when |
|---|---|---|
| 0a | `services/ai/index.js` + Gemini and Groq adapters, fallback on timeout/429/5xx | forced failure of provider 1 falls to provider 2 in a test |
| 0b | `aiUsage.model.js`, `aiCache.model.js` (TTL index), `AI_ENABLED` kill switch | every call logged; kill switch returns 503 `AI_UNAVAILABLE` |
| 0c | `ai.routes.js` mounted under `/api/v1/ai`, auth + role check, per-user rate limit + daily counter, `guard.js` (trim + zod) | `POST /api/v1/ai/ping` works for a logged-in user and is rate limited |

**Gate 0:** jest tests green with mocked `fetch`; app starts and works with **no** AI keys set. Tag `ai-phase-0`.

> **Status:** Phase 0 built on branch `new` and tagged `ai-phase-0` (2026-11-13). `AI_ENABLED` ships closed; set it to `true` with provider keys to turn the AI layer on.

---

## Phase 1 — Quick-win generation (low risk, no tools, no data access)

### 1a — Listing writer (Brand)
- **What:** from a product image URL or a few words, drafts title, description, suggested category.
- **Endpoint:** `POST /api/v1/ai/listing-draft` (role: brand/employee).
- **Tools:** none. Output validated with zod `{ title, description, category }`.
- **UI:** "Generate description" button in the product form (client + business app). Brand edits before saving.
- **Tests:** schema validation; non-brand role gets 403; provider failure returns clean 503.
- **Done when:** button fills the form in a real brand account and the AI label is visible.

### 1b — Review summarizer (Customer-facing)
- **What:** 2-3 line summary of pros/cons for a product.
- **Endpoint:** `GET /api/v1/ai/products/:id/review-summary` (public or logged-in).
- **Tools:** reads that product's reviews only (inside the service, no model-controlled IDs).
- **Cache:** `AiCache` keyed by product + review count; regenerate only when count changes. Minimum 3 reviews.
- **UI:** summary card above reviews (client + shopper app), marked "AI summary".
- **Tests:** cache hit avoids provider call; review text containing instructions is ignored.
- **Done when:** summary appears, is cached, and refreshes after a new review.

### 1c — Chat translator (Customer + Brand)
- **What:** translates one chat message on request (Urdu / English / Roman Urdu).
- **Endpoint:** `POST /api/v1/ai/translate` with `{ messageId, targetLang }`.
- **Rule:** server loads the message and checks the caller is a participant; never trust client-sent text for authorization.
- **UI:** "Translate" action on a message bubble (chat screens).
- **Tests:** non-participant gets 403; cached by `(messageId, lang)`.
- **Done when:** both sides can translate a message and the original stays visible.

**Gate 1:** 1a + 1b + 1c done, tests green, `AiUsage` reviewed (calls per agent, failure rate), kill switch tested again. Tag `ai-phase-1`.

---

## Phase 2 — Customer assistants (first use of tools)

Before 2a: build the **tool layer** (`tools/*.tool.js`, read-only, `(ctx, args)`) and the **agent loop** (max 3 steps, zod-validated tool calls). This is the main work of 2a.

### 2a — Shopping assistant
- **What:** "cheap rice near me", "gift under 3000", in Urdu / English / Roman Urdu.
- **Endpoint:** `POST /api/v1/ai/shop-assistant`.
- **Tools:** product search, categories, discover/nearby (existing services).
- **Output:** short answer + **product cards from real DB results**; the model may not invent products.
- **UI:** chat widget in the client and shopper app; tapping a card opens the normal product page.
- **Tests:** answers only reference returned product IDs; injection text in a product description is not obeyed; fallback to plain search on AI failure.
- **Done when:** five scripted queries return correct real products.

### 2b — Order helper
- **What:** "where is my order?", explains status, cancellation and return rules.
- **Endpoint:** `POST /api/v1/ai/order-helper`.
- **Tools:** the caller's own orders (`ctx.userId` only), return/cancel policy text from settings.
- **Rule:** can *suggest* "Cancel order" or "Start return" buttons; the user performs them via the normal API.
- **Tests:** **user A can never read user B's order** (explicit test); unknown order returns a polite "not found".
- **Done when:** correct status answers for orders in each state.

### 2c — Service booking helper
- **What:** finds a suitable service provider and suggests a time slot.
- **Endpoint:** `POST /api/v1/ai/service-helper`.
- **Tools:** service discovery, categories, availability.
- **Rule:** only suggests; booking goes through the existing booking flow.
- **Tests:** suggested slots exist in availability data; no double-booking suggestions.
- **Done when:** a request like "AC repair tomorrow evening" returns real providers and slots.

**Gate 2:** 2a + 2b + 2c done, cross-tenant/cross-user tests pass, injection tests pass. Tag `ai-phase-2`.

---

## Phase 3 — Seller intelligence (brand side)

### 3a — Seller advisor
- **What:** "what should I restock?", "why did sales drop this week?", pricing suggestions.
- **Endpoint:** `POST /api/v1/ai/seller-advisor` (brand roles).
- **Tools:** analytics and inventory for `ctx.brandId` only. Numbers are computed by your code and passed in; the model explains, it does not calculate.
- **UI:** advisor panel in the brand dashboard and business app.
- **Tests:** a brand can never see another brand's numbers; numbers in the answer match the tool output.
- **Done when:** restock answer lists real low-stock items from that brand's data.

### 3b — Catalogue matcher + CSV cleaner
- **What:** (1) on a new product, suggests an existing global-catalogue match and flags likely duplicates; (2) cleans messy CSV rows (names, units, categories) with preview-then-apply.
- **Endpoints:** `POST /api/v1/ai/catalogue-match`, `POST /api/v1/ai/csv-clean`.
- **Tools:** catalogue search (read-only).
- **Rule:** CSV cleaner returns a **diff preview**; nothing is written until the brand confirms.
- **Tests:** diff shape; confirm step required; large CSV is processed in chunks.
- **Done when:** a messy 50-row CSV produces a correct preview and a clean import after confirmation.

### 3c — Reply drafter (reviews + chat)
- **What:** drafts a polite reply to a review or a customer chat message.
- **Endpoints:** `POST /api/v1/ai/reply-draft` with `{ type: 'review'|'chat', id }`.
- **Rule:** returns a draft only; the brand edits and sends through the normal path. Never auto-sends.
- **Tests:** ownership check on the review/chat; draft never sent without a user action.
- **Done when:** draft appears in the reply box and sending uses the existing endpoint.

**Gate 3:** all three done, brand-isolation tests pass. Tag `ai-phase-3`.

---

## Phase 4 — Operations agents (staff and admin)

> Check where the admin UI lives in your repo (client vs. `apps/staff`) before building the UI parts.

### 4a — Picker substitution
- **What:** when an item is out of stock during picking, suggests same-category alternatives with similar price.
- **Endpoint:** `POST /api/v1/ai/substitutions` (picker/staff roles).
- **Tools:** same-store, same-category, in-stock products.
- **Rule:** suggestion only; customer approval rules of your order flow stay unchanged.
- **Tests:** suggestions are in stock, same store; empty result handled.
- **Done when:** picker screen shows 2-3 valid alternatives.

### 4b — Admin triage (billing help + support)
- **What:** classifies `BillingHelpRequest` items (type, urgency) and drafts an answer.
- **Endpoint:** `POST /api/v1/ai/admin-triage` (admin only).
- **Tools:** the request itself, the brand's billing summary (read-only).
- **Rule:** admin approves every reply.
- **Tests:** non-admin 403; classification schema validated.
- **Done when:** each new help request shows a suggested category and draft in the admin view.

### 4c — Moderation agent
- **What:** scores a piece of text (review, product text, chat) for abuse/spam/scam and returns reasons.
- **Endpoint:** `POST /api/v1/ai/moderate` (internal + admin).
- **Output:** `{ score, labels[], reason }`; no automatic punishment.
- **Tests:** obvious abuse flagged; normal Roman Urdu text not flagged; injection text does not change the score.
- **Done when:** the admin "flagged content" view can call it on demand. (Phase 5a will call it automatically.)

**Gate 4:** staff/admin role tests pass. Tag `ai-phase-4`. **All agents are now built.**

---

## Phase 5 — Automation (agents running without a click)

Only start after Gate 4: automations reuse the agents.

### 5a — Event automations
- **New review** -> moderation agent (4c) -> if score high, hide into moderation queue; refresh the review-summary cache (1b).
- **New product / CSV import** -> suggest category + duplicate flag (3b).
- **Hook:** after the successful save in `review.controller.js`, product and `productCsv.controller.js`, **fire-and-forget** inside try/catch.
- **Done when:** a toxic test review lands in the queue and a failing AI provider does not break review posting.

### 5b — Scheduled automations (`jobs/aiJobs.js`)
- **Nightly:** low-stock forecast per brand -> notification via the existing notification service.
- **Weekly:** plain-language sales report per brand (data from analytics, text from AI).
- **Rules:** idempotent (store last-run), process brands in small batches with delays, skip brands with no activity.
- **Done when:** jobs run on schedule twice in a row without duplicate notifications.

### 5c — Risk and admin automations
- **Order placed** -> risk flags (very large COD, repeated cancellations) -> admin review list; **never auto-block**.
- **Billing help created** -> auto-run 4b classification.
- **Daily** -> admin activity digest.
- **Done when:** flags appear with reasons; nothing is blocked or punished automatically.

**Gate 5:** each automation can be switched off by an env flag; jobs verified idempotent. Tag `ai-phase-5`.

---

## Phase 6 — Vision link (Sightwise)

Prerequisite: Sightwise v1 is deployed (its phases 0-5, see the Sightwise repo). Contract: Sightwise `docs/02-api-contract.md`. Integration details: doc 28.

### 6a — "Scan product" in the listing form
- `vision.client.js`, env vars, `POST /api/v1/vision/identify`; button fills title/category/description. Brand edits everything.

### 6b — Fruit freshness scan
- `POST /api/v1/vision/scan-produce`; scan screen for staff/brand (and customer if you want). Shows band, score, shelf-life range, and "estimate" label.

### 6c — Return evidence + authenticity
- Live capture + one-time order code, `POST /api/returns/:id/evidence`, Sightwise authenticity + phash comparison with catalogue images, risk badge with reasons for the brand. Human decides.

**Gate 6:** Sightwise down -> flows continue with "unchecked"; monthly detection cap enforced. Tag `ai-phase-6`.

---

## Phase 7 — Hardening and release

- **7a Security:** injection test cases for every agent; cross-tenant tests re-run; no secrets in prompts or logs.
- **7b Quota and cost review:** `AiUsage` report per agent, fallback rate, add caching where limits are hit; tune rate limits.
- **7c Docs and release:** update README and `docs/` index, demo script, final tag `ai-v1`.

---

## Phase gate checklist (use for every phase)

- [ ] All three sub-phases merged
- [ ] Jest tests green, `npm run lint` clean
- [ ] Isolation tests (user/brand/role) pass for new endpoints
- [ ] Works with AI keys removed (feature hides or falls back)
- [ ] `AiUsage` reviewed: calls, failures, fallback rate
- [ ] Docs updated; git tag created
