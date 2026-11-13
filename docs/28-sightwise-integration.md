# 28 — Sightwise Integration (Computer Vision Service)

> Place at `CityCart/docs/28-sightwise-integration.md`
> Sightwise is an **independent project in its own repo** (`Sightwise`). CityCart only talks to it over HTTP.

## 1. Why a separate repo

- Python + ML stack, different dependencies and deploy from the Node monorepo.
- If Sightwise is down or asleep, CityCart keeps working.
- Sightwise is presentable on its own and reusable by other projects.

## 2. The link (contract only, no shared code)

```
Browser / Flutter app --> CityCart server (auth, roles) --> Sightwise (X-API-Key)
                                  ^
                     the client never calls Sightwise directly
```

- CityCart server owns authentication, authorization and storage of results.
- Sightwise is stateless: image in, JSON out.
- The contract lives in the Sightwise repo: `docs/02-api-contract.md`.

## 3. CityCart changes

### 3.1 Environment (`server/.env.example` and `render.yaml`)

```
VISION_ENABLED=true
VISION_API_URL=https://<your-sightwise-host>
VISION_API_KEY=
VISION_TIMEOUT_MS=20000
```

### 3.2 New file: `server/src/services/vision.client.js`

No new packages. Node 22 has `fetch`, `FormData` and `Blob`.

```js
'use strict';

const { VISION_ENABLED, VISION_API_URL, VISION_API_KEY, VISION_TIMEOUT_MS } = process.env;

class VisionUnavailableError extends Error {}

async function post(path, buffer, mimeType, extra = {}) {
  if (VISION_ENABLED !== 'true' || !VISION_API_URL) throw new VisionUnavailableError('disabled');
  const form = new FormData();
  form.append('image', new Blob([buffer], { type: mimeType }), 'image');
  for (const [k, v] of Object.entries(extra)) form.append(k, String(v));

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Number(VISION_TIMEOUT_MS) || 20000);
  try {
    const res = await fetch(`${VISION_API_URL}${path}`, {
      method: 'POST',
      headers: { 'X-API-Key': VISION_API_KEY },
      body: form,
      signal: ctrl.signal,
    });
    if (!res.ok) throw new VisionUnavailableError(`status ${res.status}`);
    return await res.json();
  } catch (err) {
    throw err instanceof VisionUnavailableError ? err : new VisionUnavailableError(err.message);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  VisionUnavailableError,
  scanProduce: (buf, mime) => post('/v1/scan/produce', buf, mime),
  identifyItem: (buf, mime) => post('/v1/scan/item', buf, mime),
  checkAuthenticity: (buf, mime, orderCode) => post('/v1/authenticity', buf, mime, orderCode ? { order_code: orderCode } : {}),
  hashImage: (buf, mime) => post('/v1/hash', buf, mime),
};
```

### 3.3 New routes (`server/src/routes/vision.routes.js`, controller `vision.controller.js`)

| Route | Who | Purpose |
|---|---|---|
| `POST /api/vision/scan-produce` | brand, staff, customer | Fruit freshness scan |
| `POST /api/vision/identify` | brand | "Scan product" fills the listing form |
| `POST /api/returns/:id/evidence` | customer (owner of the order) | Upload return photos, runs authenticity check |

Use your existing `upload.controller.js` approach for receiving the image in memory (check what it already uses before adding anything). Enforce max size and allowed MIME types before forwarding.

### 3.4 Data model additions (return evidence)

On the return request document, per photo:

```js
evidence: [{
  url: String,
  sha256: String,                 // computed in Node with built-in crypto
  capturedLive: Boolean,          // true if taken with in-app camera
  orderCode: String,              // one-time code the customer had to show in the photo
  authenticity: {
    verdict: { type: String, enum: ['likely_real', 'uncertain', 'likely_ai', 'unchecked'] },
    aiScore: Number,
    reasons: [String],
    checkedAt: Date,
  },
  phash: String,
}]
```

### 3.5 Product-image hashes (duplicate detection)

When a brand uploads a catalogue image, call `hashImage` once and store `phash` on the image record. On a return photo, compare its `phash` against the hashes of that order's product images in plain JS (Hamming distance, small function, no library). A near match means the "damage photo" is probably the catalogue image.

## 4. Return-evidence flow

1. Customer opens "Return item". App shows a **one-time order code** (e.g., 4 random words or digits).
2. Customer writes the code on paper and photographs the item **with the code visible**, using the **in-app camera** (not the gallery). Mark `capturedLive`.
3. CityCart server: sha256 -> check cache -> if new, call Sightwise `/v1/authenticity`.
4. Server stores verdict + reasons, and compares `phash` with catalogue hashes.
5. Brand/admin sees a **risk badge with reasons** and the photo. A human decides. **Nothing is rejected automatically.**
6. If Sightwise is unavailable: store `authenticity.verdict = "unchecked"` and continue; the human still reviews.

## 5. Free-tier handling for the authenticity API

- The AI-image detector is an external API with a monthly quota; confirm current limits on the provider's pricing page. Sightengine's free plan is a common choice, but it meters in "operations" and AI checks cost several each, so the real number of checks per month is much lower than the headline.
- Cache by `sha256` (the same image is never checked twice).
- Check only return evidence (not every upload).
- Put a monthly counter in CityCart; when it is nearly used, mark new photos `unchecked` and rely on live capture + code + human review.

## 6. Phases (CityCart side)

In the main roadmap (`29-ai-phase-roadmap.md`) this work is **Phase 6**: 6a = Scan product (rows A-B), 6b = fruit scan (row C), 6c = return evidence (rows D-E).

| Phase | Work | Needs from Sightwise |
|---|---|---|
| A | `vision.client.js`, env vars, health check on startup log | `/health`, `/v1/scan/item` |
| B | "Scan product" button in brand listing form | `/v1/scan/item` |
| C | Fruit scan screen (staff/brand/customer) | `/v1/scan/produce` |
| D | Return evidence flow, risk badge, phash compare | `/v1/authenticity`, `/v1/hash` |
| E | Tests: mock Sightwise with a tiny local HTTP server in Jest; verify "unchecked" fallback | none |

## 7. Honest limits (put these in your report)

- Freshness is an **estimate** from appearance; storage conditions change real shelf life.
- AI-image detectors return **probabilities**, can give false positives and negatives, and degrade as new generators appear. That is why this design combines live capture, an order code, hash comparison and human review instead of trusting one score.
