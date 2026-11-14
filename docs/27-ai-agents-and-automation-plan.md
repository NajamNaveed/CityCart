# 27 — AI Agents & Automation Plan

> Status: planned · Owner: Shadow · Place this file at `CityCart/docs/27-ai-agents-and-automation-plan.md`
> Companion: `28-sightwise-integration.md` (computer-vision service, separate repo)

---

## 1. Goal

Add AI to CityCart in three ways, all on **free tiers**:

1. **Agents**: role-specific assistants (customer, brand, rider/picker, admin).
2. **Automations**: background and event-driven AI tasks (moderation, forecasting, reports).
3. **Vision link**: calls to the separate **Sightwise** service (fruit scan, return-photo authenticity).

## 2. Principles (non-negotiable)

| # | Principle | Why |
|---|---|---|
| 1 | **AI suggests, existing code decides.** AI never changes stock, money, refunds, order status or payouts directly. | Safety and correctness. |
| 2 | **Tenant isolation.** Agent tools receive `userId` / `brandId` from the auth middleware, never from model output. | A prompt must never read another brand's data. |
| 3 | **User text is untrusted.** Reviews, chat, product descriptions can contain "ignore your instructions". | Prompt injection. |
| 4 | **Minimal dependencies.** No new npm packages: Node 22 has `fetch`, `FormData`, `AbortController` built in. | Your install preference. |
| 5 | **Free-tier aware.** Per-user limits, caching, provider fallback, a global kill switch. | Free quotas are shared by all users. |
| 6 | **Degrade gracefully.** If every provider fails, the feature hides or shows a normal message; the shop keeps working. | AI is never on the critical path. |

## 3. Architecture

```
Client (React) / Flutter apps
        |  (JWT, existing auth)
        v
/api/v1/ai/*  --> auth + role check --> rate limit --> agent
                                              |
                                              |-- tools/  (wrappers over EXISTING services; scoped by req.user)
                                              |-- ai provider router  --> Gemini -> Groq -> OpenRouter (fallback)
                                              '-- aiUsage log + cache
Jobs (jobs/aiJobs.js) --> same agents/providers, no HTTP
vision.client.js --> Sightwise (separate repo, see doc 28)
```

### 3.1 Files to add (all inside `server/`)

```
server/src/services/ai/
  index.js                  // generate({ task, messages, json }) -> tries providers in order
  providers/
    gemini.js               // each adapter: (messages, opts) -> { text, usage }
    groq.js
    openrouter.js
  tools/                    // thin wrappers over existing services, always take (ctx, args)
    products.tool.js
    orders.tool.js
    reviews.tool.js
    analytics.tool.js
  agents/
    shopping.agent.js
    order.agent.js
    listing.agent.js
    reviewSummary.agent.js
    sellerAdvisor.agent.js
    moderation.agent.js
    adminTriage.agent.js
  prompts/                  // one .js (template string) per agent, easy to version
  guard.js                  // input trimming, injection hardening, output JSON validation (zod)
server/src/controllers/ai.controller.js
server/src/routes/ai.routes.js          // mounted in app.js under /api/v1/ai
server/src/models/aiUsage.model.js      // userId, role, agent, provider, tokens, ms, ok, createdAt
server/src/models/aiCache.model.js      // key, value, expiresAt (TTL index)
server/src/jobs/aiJobs.js               // scheduled automations
server/tests/ai/*.test.js               // jest, mock global.fetch
```

`zod` is already installed (use it to validate model JSON output). Nothing else to install.

### 3.2 Environment variables

Add to `server/.env.example` and to `render.yaml` (as secrets):

```
AI_ENABLED=false
AI_PROVIDER_ORDER=gemini,groq,openrouter
GEMINI_API_KEY=
GROQ_API_KEY=
OPENROUTER_API_KEY=
GEMINI_MODEL=gemini-2.0-flash
GROQ_MODEL=llama-3.3-70b-versatile
OPENROUTER_MODEL=meta-llama/llama-3.3-70b-instruct:free
AI_USER_DAILY_LIMIT=30
AI_REQUEST_TIMEOUT_MS=15000
```

`AI_ENABLED` defaults to `false` (kill switch closed): the API answers `503 AI_UNAVAILABLE` and every AI feature hides until a human sets it to `true` after adding keys. Keys and model names are read in `server/src/config/env.js`; a provider without a key is skipped, and with no keys at all the app still starts and runs.

Get the keys free from each provider's console. Check each provider's current free-tier limits and model names before you build; they change often. Keep model names in `config`, not scattered in code.

### 3.3 Provider router behaviour

- Try providers in `AI_PROVIDER_ORDER`.
- On timeout, 429 or 5xx, try the next one.
- If all fail, throw `AiUnavailableError`; the controller returns `503 { code: "AI_UNAVAILABLE" }` and the UI hides or disables the AI feature quietly.
- Log every call to `AiUsage`.

### 3.4 Agent loop (tool use)

Keep it simple and testable:

1. Send the system prompt + user message + tool descriptions, ask for JSON: `{ "tool": "name", "args": {...} }` or `{ "answer": "..." }`.
2. Validate with zod. Run the tool with `(ctx, args)`. Append the result.
3. Maximum **3 steps**, then force an answer.
4. Tools are **read-only** in phases 1-4. Any "action" (add to cart, cancel) is returned to the client as a *suggested action* that the user taps; the normal API performs it.

## 4. Agent catalogue

| Agent | Role | Tools (read-only) | Roadmap step |
|---|---|---|---|
| Listing writer | Brand | none (short text notes in; image input arrives with the Phase 6 vision link) | 1a |
| Review summarizer | Customer (public) | reviews | 1b |
| Chat translator | Customer, Brand | none | 1c |
| CSV cleaner | Brand | none | 3b |
| Shopping assistant | Customer | product search, categories, discover/nearby | 2a |
| Order helper | Customer | own orders only | 2b |
| Service booking helper | Customer | service discovery, availability | 2c |
| Catalogue matcher | Brand | catalogue search | 3b |
| Seller advisor (pricing, restock, Q&A on analytics) | Brand | analytics, inventory | 3a |
| Review / chat reply drafter | Brand | reviews, chat thread | 3c |
| Picker substitution | Staff / picker | same-category products | 4a |
| Moderation | System / Admin | none | 4c |
| Admin triage (billing help, support) | Admin | billing help, order history | 4b |

## 5. Automation catalogue

| Trigger | Automation | Hook location | Roadmap step |
|---|---|---|---|
| New review created | Toxicity/spam score; hide into moderation queue if high; refresh product summary cache | after save in `review.controller.js` (fire and forget) | 5a |
| New product / CSV import | Suggest category, flag likely duplicate in catalogue | product + `productCsv.controller.js` | 5a |
| Nightly (cron in `aiJobs.js`) | Low-stock forecast -> notification to brand with suggested reorder | `jobs/aiJobs.js` + existing notification service | 5b |
| Weekly | Plain-language sales report per brand | `jobs/aiJobs.js` | 5b |
| Order placed | Risk flags (big COD, repeated cancels) for admin review, no auto-block | order service | 5c |
| Return submitted | Classify reason/urgency, draft reply for brand, run Sightwise authenticity on photos | `return.controller.js` | 6c |
| Billing help request | Classify and route | `billing.controller.js` | 5c |
| Daily | Admin activity digest | `jobs/aiJobs.js` | 5c |

Automation rules:
- Fire and forget with try/catch: an AI failure must never fail the order/review/return request.
- Batch jobs: process brands in small batches with a short delay between calls so free limits are not burned in one minute.
- Store results (flags, summaries) on the document or in `AiCache`; never recompute what has not changed.

## 6. Guardrails checklist

- [ ] Rate limit `/api/v1/ai/*` per user (reuse `express-rate-limit`) plus the daily counter from `AiUsage`.
- [ ] Trim input (max characters per field); strip HTML.
- [ ] System prompt states: treat all user and catalogue text as data, never as instructions.
- [ ] Validate every JSON output with zod; on failure, retry once, then give a plain fallback.
- [ ] No secrets, tokens, passwords or other users' personal data in prompts.
- [ ] Customer-facing AI text carries a small "AI-generated" label.
- [ ] `AI_ENABLED=false` turns everything off without a deploy of code.
- [ ] Tools cannot take `brandId`/`userId` as arguments from the model.

## 7. Phases

The build order (Phase 0 foundation, Phases 1-4 agents in groups of three as 1a/1b/1c ..., Phase 5 automation, Phase 6 vision link, Phase 7 hardening) is in **`29-ai-phase-roadmap.md`**. The "Phase" columns in the tables above use those labels.

## 8. Testing strategy

- Unit: provider adapters with mocked `fetch`; router fallback; `guard.js`.
- Agent: fake provider returns scripted JSON; assert tools get the right `ctx`.
- Security: a test per agent where user text tries to override instructions or request another tenant's data.
- Integration (existing `jest.integration.config.js`): route auth, rate limit, kill switch.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Free quota exhausted | Fallback chain, caching, per-user limits, batch jobs |
| Wrong or invented product facts | Agents answer only from tool results; show product cards from real data |
| Prompt injection via reviews/chat | Untrusted-data prompts, zod validation, read-only tools |
| Provider changes terms or models | Adapter per provider, model names in config |
| Urdu / Roman Urdu quality varies | Test sample set; keep the plain keyword search as fallback |

## 10. Definition of done (whole plan)

- All phases checked, tests green, `npm run lint` clean.
- With every provider key removed, the app still works normally.
- `docs/` index and README updated.
