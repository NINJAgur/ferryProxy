# PROJECT.md — Ferry: an LLM relay for connections that barely work
> **Source of Truth** — architecture, decisions, findings and open work are tracked here.
> Last updated: 2026-08-20

---

## Table of Contents
1. [Architecture Overview](#1-architecture-overview)
2. [Host Machine Setup Guide](#2-host-machine-setup-guide)
3. [Directory Structure](#3-directory-structure)
4. [Decisions & Findings](#4-decisions--findings)
5. [Master To-Do List](#5-master-to-do-list)
6. [Next Steps](#6-next-steps)

---

## 1. Architecture Overview

### 1.1 Project Goal
Tunnel high-capability LLM queries through an ultra-low-bandwidth, high-latency text
channel (simulating SMS, basic text packets, or minimal airplane Wi-Fi):

- A **relay** (Python/FastAPI) talks to the model over a normal connection
- A **phone app** (React Native/Expo) talks to the relay over a deliberately thin one
- Answers are encoded, split into numbered pieces, and reassembled on the phone
- Survives dropped packets, 2G latency, and going offline mid-conversation
- Reports its own bandwidth honestly, including where it loses

### 1.1a Product model

- **One free app**, a single store listing. Ferry installs free and free Gemini Flash works
  immediately, with no account and no setup.
- **One non-consumable in-app purchase** ("unlock all models"), shown on the store listing
  under In-App Purchases and bought inside the app. It unlocks advanced Gemini, GPT and Claude.
- **No user accounts.** The store owns the purchase record; *Restore Purchases* replays it
  onto a new device.
- **The receipt is the credential.** The relay pays the API bill, so the device sends its
  store receipt / RevenueCat token and the relay validates it server-side.
- **A monthly fair-use cap measured in answers**, keyed by receipt. Over the cap, paid
  models fall back to free Gemini until reset.
- **Four service-account keys**, created by hand and held only on the relay: Gemini free,
  Gemini paid, OpenAI, Anthropic.

Pricing is set later from measured per-answer cost, after store commission.

### 1.2 Data Flow

```
┌───────────────────────────────────────────────────────────────────────┐
│  PHONE APP  (client/ — Expo / React Native)                           │
│                                                                        │
│  Screen A: real checks — network, relay reachable — plus what you can │
│       │    use now. Free Gemini works with no interaction at all.      │
│       └──► "Unlock all models" → store purchase · "Restore purchases"  │
│                                                                        │
│  Compose ──► encodePayload(prompt)                                    │
│       │        gzip vs plain, whichever is SMALLER  (never inflate)   │
│       │        sha256(plaintext)[:16] as checksum                     │
│       ▼                                                                │
│  POST /v1/chat   { r, a, k, p }   + store receipt (entitlement only)   │
└───────────────────────────────────────────────────────────────────────┘
                    │  (optionally through scripts/simulate_loss.py:
                    │   drops 90% of requests, 300–2000ms latency)
                    ▼
┌───────────────────────────────────────────────────────────────────────┐
│  RELAY  (server/ — FastAPI, single instance by design)                │
│                                                                        │
│  decode by `a` → VERIFY CHECKSUM → validate → pick provider           │
│       │                                                                │
│       ├─ brief=true → prepend BREVITY_INSTRUCTION to the prompt       │
│       │   (NOT a token cap: thinking models spend a low cap on hidden  │
│       │    reasoning and get truncated mid-sentence)                   │
│       │                                                                │
│       ├─ validate receipt → tier · check monthly answer allowance     │
│       └─ pick the service key the model's tier requires               │
│                    │                                                   │
│                    ▼  anthropic / openai / gemini  (stream disabled)   │
│  encode whole answer once → split into CHUNK_SIZE_BYTES slices        │
│  cache slices by requestId for CACHE_TTL_SECONDS (in-memory)          │
│  return chunk 0 inline (saves a round trip)                            │
└───────────────────────────────────────────────────────────────────────┘
                    │
                    ▼
┌───────────────────────────────────────────────────────────────────────┐
│  REASSEMBLY  (client/src/transport/reassembly.ts)                     │
│                                                                        │
│  GET /v1/chat/{r}/chunks/{i}  × (n-1), 3 in flight                    │
│    per-chunk timeout 8s · backoff 500ms ×2 cap 8s ±20% · 5 attempts   │
│    overall reassembly budget 60s                                       │
│    RETRY ONLY TRANSIENT: 4xx / 404 / 503 fail identically every time  │
│                                                                        │
│  join in index order → decode → VERIFY CHECKSUM → render markdown     │
│  offline → queue on device, drain in order when a line returns        │
└───────────────────────────────────────────────────────────────────────┘
```

### 1.3 The Six Screens

Design source was a `Ferry.html` mockup (since removed from the repo).

| # | Screen | State it reports |
|---|--------|------------------|
| 1a | Finding you a line out | network, relay, and what you can use right now |
| 1b | The thread | live chat; "Working on it — Xs so far" while waiting |
| 1c | The long wait | elapsed timer, piece progress, partial answer, notify/stop |
| 1d | Offline | queued questions, in the order written |
| 1e | Didn't get through | dashed bubble, 3-state retry pill, reassurance card |
| 1f | Settings | behaviour toggles, plan and remaining allowance |

### 1.4 Tech Stack

| Layer | Technology |
|-------|-----------|
| **Relay** | Python 3.9 + FastAPI + Pydantic v2 + uvicorn |
| **Providers** | `anthropic`, `openai`, `google-genai` (all async, streaming disabled) |
| **App** | Expo SDK 57 + React Native 0.86 + TypeScript |
| **App state** | Zustand + `zustand/persist` |
| **Chat storage** | `expo-file-system` → `ferry-chats.json` in the document dir (web falls back to `localStorage`) |
| **Compression** | stdlib `gzip` (relay) / `pako` (app), base64 via `base64-js` |
| **Purchases** | RevenueCat wrapping StoreKit + Play Billing — needs a dev build, not Expo Go |
| **Relay storage** | SQLAlchemy → SQLite locally, managed Postgres in production (entitlements + usage) |
| **Hosting** | Fly.io / Railway / Render + managed Postgres — the store distributes the app, the relay is hosted separately |
| **Tests** | pytest (relay) + Jest/jest-expo (app) |
| **Fonts** | Inter via `@expo-google-fonts/inter` |

---

## 2. Host Machine Setup Guide

### Step 1 — Python 3.9+
```bash
cd server
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements-dev.txt   # macOS/Linux: .venv/bin/python
```

### Step 2 — Node 18+
```bash
cd client
npm install
```

### Step 3 — Service-account keys
Four keys, created by hand in each provider's console and held only on the relay. Two
Gemini keys so free-tier traffic never bills the paid account. Gemini has a free tier:
<https://aistudio.google.com/apikey>.

In `server/.env` (gitignored):

```
GEMINI_FREE_API_KEY=...
GEMINI_PAID_API_KEY=...
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
```

Only the free Gemini key is needed to run the app; the rest serve the paid add-on.

### Step 4 — TLS-intercepting antivirus (Avast and similar)
Python will not trust the interceptor's CA, so all outbound HTTPS fails
(`CERTIFICATE_VERIFY_FAILED`). Build a combined bundle once:

```bash
cd server
.venv/Scripts/python -c "import certifi,pathlib; p=pathlib.Path('.certs'); p.mkdir(exist_ok=True); \
  (p/'ca-bundle.pem').write_text(pathlib.Path(certifi.where()).read_text() + '\n' + \
  pathlib.Path(r'C:\ProgramData\Avast Software\Avast\wscert.pem').read_text())"
```

Then run the relay with `SSL_CERT_FILE=$(pwd)/.certs/ca-bundle.pem`. `pip` needs
`--cert` pointed at the same file.

### Step 5 — Run
```bash
# relay
cd server && .venv/Scripts/python -m uvicorn app.main:app --port 8000

# app
cd client && npm start        # press w for web, or scan the QR with Expo Go
```

`client/.env` points the app at the relay:
```
EXPO_PUBLIC_API_URL=http://127.0.0.1:8000
```
On a physical phone use the machine's LAN IP, not `127.0.0.1`.

---

## 3. Directory Structure

```
proxyAI/                                 ← monorepo root
│
├── PROJECT.md                           ← THIS FILE — source of truth
├── PROTOCOL.md                          ← the wire format, authoritative
├── README.md                            ← public-facing setup + honest numbers
├── .env.example                         ← documented vars, no real values
│
├── server/                              ← the relay
│   ├── requirements.txt / requirements-dev.txt
│   ├── .env                             ← real keys (gitignored)
│   ├── .certs/                          ← local CA bundle (gitignored)
│   ├── app/
│   │   ├── main.py                      ← FastAPI app, CORS, routers
│   │   ├── config.py                    ← pydantic-settings, all env vars
│   │   ├── logging_config.py            ← stdlib logging (no print anywhere)
│   │   ├── llm/
│   │   │   ├── base.py                  ← LLMProvider protocol + LLMResult
│   │   │   ├── registry.py              ← name → adapter
│   │   │   ├── anthropic_provider.py
│   │   │   ├── openai_provider.py
│   │   │   └── gemini_provider.py
│   │   ├── protocol/
│   │   │   ├── schemas.py               ← terse wire envelopes (Pydantic)
│   │   │   ├── compression.py           ← encode_payload / decode_payload
│   │   │   ├── chunker.py               ← split / reassemble
│   │   │   └── checksum.py              ← sha256[:16]
│   │   ├── cache/response_cache.py      ← in-memory TTL cache of chunks
│   │   ├── catalogue.py                 ← model → tier → which service key
│   │   ├── entitlement.py               ← purchases + this month's usage
│   │   ├── receipts.py                  ← verifies a store receipt
│   │   └── routes/
│   │       ├── chat.py                  ← POST /v1/chat  (+ store receipt)
│   │       ├── chunks.py                ← GET  /v1/chat/{r}/chunks/{i}
│   │       ├── entitlement.py           ← POST /v1/entitlement
│   │       └── providers.py             ← GET  /v1/providers
│   ├── scripts/
│   │   ├── simulate_loss.py             ← drops/delays requests on purpose
│   │   ├── e2e_resilience_test.py       ← asserts recovery under loss
│   │   └── check_provider.py            ← verify a key/model in isolation
│   └── tests/                           ← pytest, mirrors app/
│
└── client/                              ← the phone app
    ├── App.tsx                          ← tabs: Chat / History / Data / Settings
    ├── src/
    │   ├── theme.ts                     ← design tokens from the Ferry mockup
    │   ├── notify.ts                    ← local notification when an answer lands
    │   ├── purchases.ts                 ← buy / restore the add-on
    │   ├── useHandshakeVisibility.ts    ← when screen A may appear
    │   ├── components/
    │   │   ├── HandshakePanel.tsx       ← screen 1a
    │   │   ├── MessageBubble.tsx        ← 1b / 1e
    │   │   ├── PendingCard.tsx          ← 1b short wait / 1c long wait
    │   │   ├── QueuedList.tsx           ← 1d
    │   │   ├── ModelPicker.tsx          ← segmented model control
    │   │   └── Toggle.tsx / Button.tsx / FadingRule.tsx / Markdown.tsx
    │   ├── screens/
    │   │   ├── HomeScreen.tsx           ← chat + screen A gate
    │   │   ├── ChatsScreen.tsx          ← all chats
    │   │   ├── HistoryScreen.tsx        ← bandwidth ("Data" tab)
    │   │   └── SettingsScreen.tsx       ← 1f
    │   ├── state/
    │   │   ├── entitlementStore.ts      ← what this device may use
    │   │   ├── threadStore.ts           ← conversations, persisted
    │   │   ├── fileStorage.ts           ← chats as a file on the device
    │   │   ├── metricsStore.ts          ← per-message bandwidth, persisted
    │   │   ├── settingsStore.ts         ← toggles, persisted
    │   │   └── thread.ts                ← ThreadMessage types
    │   ├── queue/
    │   │   ├── offlineQueue.ts          ← durable queue
    │   │   └── queueProcessor.ts        ← drains sequentially on reconnect
    │   └── transport/
    │       ├── reassembly.ts            ← retry/backoff/concurrency + metrics
    │       ├── reassemblyState.ts       ← pure state machine
    │       ├── httpClient.ts            ← fetch + timeout + HttpError
    │       ├── compression.ts           ← encode/decode, sha256
    │       ├── ids.ts                   ← 12-char base62 ids
    │       └── types.ts                 ← wire types, mirrors schemas.py
    └── __tests__/                       ← Jest, mirrors src/
```

---

## 4. Decisions & Findings

### 4.1 Things that turned out to be impossible (and why)

| Idea | Verdict |
|---|---|
| Intercept traffic from the official ChatGPT/Gemini apps | **No.** TLS + certificate pinning; iOS forbids reading another app's traffic; and compression needs both ends to cooperate anyway. |
| "Sign in with Gmail" → app receives API tokens for each LLM | **No.** A Google login returns a Google-scoped token. Anthropic and OpenAI have no federation with Google. No provider mints keys for a third-party app. |
| A Gemini Advanced / ChatGPT Plus subscription covers API use | **No.** Consumer subscriptions and API billing are separate products. |
| Disable thinking on Gemini 3.6 Flash to save tokens | **No.** `thinking_budget=0` returns 400. |

This is why the relay holds four service-account keys and sells *access* rather than
credentials: a store purchase unlocks models, and no key ever reaches a device.

### 4.1a Purchases

- **One free app with one non-consumable IAP.** The product appears on the Play
  listing under "In-App Purchases".
- **The store owns the purchase record**, tied to the buyer's Google account.
  *Restore Purchases* replays it onto a new device — this is what removes the need for
  accounts.
- **The relay verifies.** The device sends its store receipt / RevenueCat token; the relay
  validates it server-side. A missing or invalid receipt means free tier, not an error.
- **Commission**: 15% on Google Play's first $1M/yr, 30% above it. The web checkout
  costs roughly 5% instead, which is the whole reason both routes exist. Price is set
  from per-answer cost *after* commission.
- **Store obligations that are real work**: a Restore Purchases button, and product
  disclosure in-app and on the listing.

### 4.1b API and model provisioning

- **Four service-account keys**, created by hand, held only in `server/.env`. Two Gemini
  keys so free-tier traffic never bills the paid account — `server/app/catalogue.py` picks
  the key from the model's tier.
- **Tiering lives in the catalogue**, not the UI: `/v1/chat` refuses a locked model even for
  a request that never went through the app.
- **Provider behaviour already encoded:**
  - `gemini-3.6-flash` is the working free model (the API named it as the replacement when
    `gemini-2.0-flash` returned 404 on a new key).
  - Gemini Flash thinks before answering and bills that hidden reasoning against
    `max_output_tokens`, and `thinking_budget=0` is rejected. Brevity is requested **in the
    prompt**; the token cap is only a safety ceiling.
  - A trivial Gemini prompt took **18.5s**, so the send timeout is 90s while the chunk-fetch
    timeout stays 8s.
  - TLS-intercepting antivirus (Avast) blocks the relay's outbound HTTPS until its CA is in
    a bundle pointed at by `SSL_CERT_FILE`.

### 4.2 Protocol decisions

- **Encoding must never inflate.** Unconditional gzip turned a 66-byte prompt into 112
  bytes (gzip header + base64's third). Both ends now compare and send the smaller,
  tagged `algorithm: "gzip" | "none"`.
- **Envelopes are bandwidth.** Field names are single letters; ids are 12-char base62
  instead of 36-char UUIDs; the checksum is 64 bits, not 256. Request envelope overhead
  fell 253 B → 71 B; per-chunk 94 B → 20 B.
- **`sessionId` was removed** — the relay never read it.
- **Checksum covers decompressed plaintext**, not compressed bytes: gzip already CRCs
  its own stream, but that won't catch chunks joined in the wrong order.
- **Retry only what a retry can fix.** A 503 for an unconfigured provider was being
  retried five times with backoff, stalling the UI ~15s for a deterministic failure.

### 4.3 Measured bandwidth (512-byte chunks)

| answer | plain | Ferry | saved |
|---|---|---|---|
| 259 B | 341 B | 505 B | −48% |
| 2,269 B | 2,379 B | 1,828 B | **+23%** |
| 4,019 B (real Gemini) | 4,291 B | 3,101 B | **+28%** |

Crossover is ~700 B. Below it, fixed envelope + base64 cost more than compression saves.

**The bigger lever is brevity, not compression.** Asking Gemini for a short answer took
one reply from 4,019 → 314 characters. Compression is worth ±25%; asking for less is
worth ~90%. The Data screen shows both, and measures brevity from the user's own
replies rather than quoting a number from a single sample.

### 4.4 Bugs found by actually running it

- Relay had no CORS → browser blocked every request silently
- `simulate_loss.py` returned 501 on CORS preflight → all requests failed
- `simulate_loss.py` dropped upstream headers on 4xx/5xx → browser reported readable
  errors as opaque network failures, so the client retried deterministic errors
- Queued messages rendered twice (queue card + thread bubble)
- Screen A flashed for a fraction of a second, then (after a fix) never appeared at all

---

## 5. Master To-Do List

### Phase 0 — Scaffold ✅
- [x] **0.1** Monorepo, `.gitignore`, `.env.example`
- [x] **0.2** Relay venv + FastAPI skeleton; app via `create-expo-app` (TypeScript)
- [x] **0.3** pytest + jest-expo wired, both green with zero tests

### Phase 1 — Protocol ✅
- [x] **1.1** `compression.py` / `chunker.py` / `checksum.py` / `schemas.py`
- [x] **1.2** Full unit suite first (highest-risk surface)
- [x] **1.3** `encode_payload` never-inflate rule + tests
- [x] **1.4** Terse envelopes, 64-bit checksum, 12-char ids
- [x] **1.5** `PROTOCOL.md` written and kept in sync

### Phase 2 — Relay ✅
- [x] **2.1** `/v1/chat` + `/v1/chat/{r}/chunks/{i}` + in-memory TTL cache
- [x] **2.2** Provider adapters: anthropic, openai, gemini (injectable, mocked in tests)
- [x] **2.3** `/v1/providers` reports which keys the relay holds
- [x] **2.4** CORS (found by driving a browser)
- [x] **2.5** Provider keys never leave the relay — never cached per caller, never echoed
- [x] **2.6** Brevity as a prompt instruction, not a token cap
- [x] **2.7** `check_provider.py` — verify a key/model in isolation
- [x] **2.8** Demo provider removed (keyless fallback hid the auth problem)

### Phase 3 — Resilience harness ✅/🔄
- [x] **3.1** `simulate_loss.py` — configurable loss + 2G latency
- [x] **3.2** CORS preflight + error-header fixes
- [x] **3.3** `e2e_resilience_test.py` + retry-helper unit tests
- [ ] **3.4** **Run it at `LOSS_PROBABILITY=0.9`, 10× plus a 0% control** ← never executed

### Phase 4 — App transport ✅
- [x] **4.1** Reassembly state machine (pure reducer) + orchestrator
- [x] **4.2** Retry/backoff/jitter, 3-in-flight, 60s budget
- [x] **4.3** `isRetryable` — only transient failures
- [x] **4.4** Offline queue, sequential drain, survives restart
- [x] **4.5** Per-message bandwidth metrics

### Phase 5 — App UI ✅
- [x] **5.1** Design tokens extracted from the mockup's own source
- [x] **5.2** All six screens built and verified against real state
- [x] **5.3** Hover/press states, custom Toggle, fading rules, markdown
- [x] **5.4** Inter font loaded
- [x] **5.5** Screen A: grace period, minimum dwell, first-run, credential-failure re-show
- [x] **5.6** Multiple chats + History tab; chats titled from the first question
- [x] **5.7** Data screen leads with the brevity win, measured not assumed

### Phase 6 — Real provider ✅
- [x] **6.1** Gemini working end-to-end on a free-tier key
- [x] **6.2** `gemini-2.0-flash` → `gemini-3.6-flash` (the API named the replacement)
- [x] **6.3** Avast CA bundle workaround documented
- [x] **6.4** Truncation diagnosed: thinking spends the cap; brevity moved to the prompt

### Phase 7 — Repo ✅
- [x] **7.1** README with honest numbers, including where Ferry loses
- [x] **7.2** Secret scan before every commit; `.env` + `.certs/` gitignored
- [x] **7.3** Pushed to GitHub + GitLab (identical trees)

### Phase 8 — Model catalogue and tiers 🔄
- [x] **8.1** Picker keeps the selected model highlighted; locked models greyed
- [x] **8.2** Screen A never flashes the chat first
- [x] **8.3** All key entry removed from the app
- [x] **8.4** Chats persisted to a device file (`ferry-chats.json`)
- [x] **8.5** Demo provider removed
- [x] **8.6** Send timeout split from chunk timeout
- [x] **8.7** Data screen leads with the brevity win, measured from real replies
- [x] **8.8** Server: tiered catalogue, four service keys, entitlement enforced on `/v1/chat`
- [x] **8.9** Fix the 403/503 ordering for an unconfigured model
- [x] **8.10** Client adopts `ModelInfo`; delete `ProviderStatus` / `fetchProviders`
- [x] **8.11** Model picker lists models (not providers); locked ones greyed and unselectable

### Phase 9 — Replace the accounts layer with entitlements ✂️
- [x] **9.1** Delete `server/app/auth.py`, `server/app/accounts.py`, `server/.accounts.json`
- [x] **9.2** Delete `client/src/auth/google.ts`, `client/src/state/sessionStore.ts`
- [x] **9.3** Remove `expo-auth-session` / `expo-web-browser`; drop `GOOGLE_CLIENT_ID`
- [x] **9.4** `/v1/entitlement` replaces `/v1/session` + `/v1/subscription`: takes a store
      receipt, returns the model catalogue plus remaining allowance
- [x] **9.5** Delete `KeyField.tsx`, `keyStore.ts`, `expo-secure-store`
- [x] **9.6** Rewrite the server session tests as entitlement tests

### Phase 10 — Screen A 🚪
- [x] **10.1** Two real checks (network, relay) plus what you can use right now
- [x] **10.2** Free Gemini works immediately with no interaction
- [x] **10.3** "Unlock all models" button + "Restore purchases" alongside it
- [x] **10.4** After purchase, show which models are now available and continue to chat

### Phase 11 — Purchase and entitlement 💳 — superseded
Written for an App Store release that is no longer happening. What survived is in
Phase 15; what it got wrong is worth keeping:

- The receipt is not an account. The store owns the purchase record, the device
  carries an opaque id, and the relay verifies it — which is what removed sign-in
  from the app entirely.
- The purchase was "wired but unproven" for weeks. It is now proven, and the two
  things that were wrong were both silent: a `dev:` prefix the verifier required,
  and a customer id RevenueCat wants as a path segment rather than a query
  parameter. Neither errored; both simply read as "not purchased".

### Phase 12 — Paying for the free tier 📊
- [x] **12.1** Usage counter keyed by receipt/purchase id
- [x] **12.3** Over the cap → paid models fall back to free Gemini until reset
- [x] **12.4** Show remaining allowance in Settings
- [x] **12.6** Free answers metered per device via `X-Device-Id`, falling back to the
      caller's address so the meter cannot be skipped by omitting the header
- [x] **12.7** Billing enabled on **ferry-free**; the free tier's 20/day ceiling was
      the whole app's daily budget, shared by every user
- [x] **12.8** Spending cap set in Google Cloud
- [ ] **12.2** Record token cost per answer — the data that settles 17.4

### Phase 13 — Deployment 🗄️
- [x] **13.1** Entitlements in a file, not a database
- [x] **13.2** `ENTITLEMENT_STORE_PATH`, for a mounted volume
- [x] **13.3** `ALLOW_DEV_SUBSCRIPTION` defaults to false
- [x] **13.4** Dockerfile (non-root, one worker) + `.dockerignore`
- [x] **13.5** `CORS_ALLOW_ORIGINS` configurable
- [x] **13.6** `client/app.json`: package, version code, icons
- [x] **13.7** `client/eas.json` build profiles
- [x] **13.8** `DEPLOY.md`
- [x] **13.9** **Relay live** at `ferryproxy.onrender.com`, verified end to end
- [x] **13.13** Public pages the stores require: `/privacy`, `/delete-data`,
      `/terms`, `/purchase-complete`, each also a static copy in `docs/`
- [ ] **13.10** Replace the in-memory chunk cache, or keep the relay on one instance

Hosting problems moved to **Phase 17**, where they belong: they are launch
blockers, not deployment tasks.

### Phase 14 — Outstanding engineering 🔧
- [x] **14.1** The 90% packet-loss proof exists and runs — see 17.5 for the result
- [ ] **14.3** Shared-dictionary compression to beat the ~700 B crossover
- [ ] **14.4** Delete orphans: `TunnelButton.tsx`, `ProviderSelector.tsx`, and
      `server/app/db.py` + `models.py` from the abandoned database approach

### Phase 15 — Three ways to ship one app 📦
Distribution and billing are separate choices. RevenueCat normalises both into a
customer id, so `receipts.py` never learns which was used.

| Target | Profile | Billing | Where it lives |
|---|---|---|---|
| Play | `production` (AAB) | Play Billing | Google Play |
| Sideload | `sideload` (APK) | Web checkout | Aptoide, GitHub Releases |
| Browser | `expo export` | Web checkout | not deployed |

- [x] **15.1** `BillingProvider` interface; `playBilling` and `webBilling` behind it
- [x] **15.2** `chooseBilling` pure and pinned by tests; defaults to the web checkout
      because guessing "play" for an unlisted build would breach terms it was never
      listed under
- [x] **15.3** `eas.json` profiles: `preview`, `production`, `sideload`
- [x] **15.4** `EXPO_PUBLIC_WEB_PURCHASE_URL` wired to a RevenueCat purchase link
- [x] **15.6** **A real purchase works, verified end to end.** Paddle sandbox took
      $10, RevenueCat recorded entitlement `pro` with no expiry against the right
      customer, and the relay read it back with its secret key
- [x] **15.7** The customer id is a **path segment**, not the query parameter
      RevenueCat's prose describes. A link without one 404s rather than erroring,
      so the wrong shape looked exactly like a broken link
- [ ] **15.5** Web billing has no cross-device restore — a reinstall loses the
      purchase. Needs the checkout email or a redemption code

### Phase 16 — Google Play 🤖
iOS is dropped, not postponed: $99/yr and no iPhone to test on. `playBilling.ts`
still reads an iOS key, so nothing needs undoing if that ever changes.

Account approved, AAB uploaded to internal testing. **The 12-tester rule applies**
— confirmed in the console. Production is ~3 weeks out; internal testing works now.

- [x] **16.1** Play Console account approved
- [x] **16.3** AAB built (`eas build -p android --profile production`) and uploaded
      to the internal testing track
- [x] **16.8** Store listing: descriptions, icon, feature graphic, screenshots,
      content rating, data safety, sign-in details, privacy and deletion URLs
- [ ] **16.2** Google Payments merchant profile — no purchase works until approved
- [ ] **16.4** Managed (non-consumable) product, priced
- [ ] **16.5** RevenueCat: add a **Play** app, service account JSON, attach to `pro`
- [ ] **16.6** `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` (`goog_…`) in `eas.json`
- [ ] **16.7** Twelve testers, fourteen continuous days on a closed track
- [ ] **16.9** Apply for production access

### Phase 17 — Before going live ⚠️
Everything here is known and unfixed. None of it blocks a release; all of it
decides whether the release survives contact with real users.

- [ ] **17.1** **Paddle account verification.** Identity and bank details. Nothing
      can be sold on the live account until it clears, and the domain
      `pay.rev.cat` needs manual approval — up to 5–7 business days
- [ ] **17.2** **Render's free tier sleeps and has no disk.** A cold start makes the
      first question hang ~40s, and every deploy wipes purchases and usage counters.
      Fatal once real purchases exist
- [ ] **17.3** **A custom domain.** uBlock blocks `*.onrender.com` outright; DNS
      filters and corporate networks will too — the users Ferry is aimed at
- [ ] **17.4** **The pricing is structurally wrong.** A one-time payment against a
      monthly renewing allowance means a heavy user costs money every month
      forever against a single payment. Either price for a lifetime, or make the
      allowance a fixed pool. 12.2 — cost per answer — is the data that settles it
- [ ] **17.5** **Ferry fails its own 90% packet-loss proof**: 0/10 answers
      reassembled, against 10/10 with no loss. 40 attempts with a 1s backoff cap
      gives 5/5; the constants are deliberately unchanged
- [ ] **17.6** **Never run on a phone.** Every test so far has been a desktop
      browser. 14.2 remains open

---

## 6. Next Steps

1. **16.3 / 14.2** — an EAS build on the Pixel via internal testing. Nothing else
   is worth deciding before Ferry has run on a real phone on a real connection
2. **16.2 / 16.7** — payments profile and 12 testers. Both slow, both independent,
   neither blocks anything technical
3. **15.4** — a web purchase link, if sideload distribution is wanted before Play
4. **13.11 / 13.12** — a host with a disk, and a domain ad blockers do not eat
