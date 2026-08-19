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
│   │   └── routes/
│   │       ├── chat.py                  ← POST /v1/chat  (+ store receipt)
│   │       ├── chunks.py                ← GET  /v1/chat/{r}/chunks/{i}
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
    │   ├── useHandshakeVisibility.ts    ← when screen A may appear
    │   ├── components/
    │   │   ├── HandshakePanel.tsx       ← screen 1a
    │   │   ├── MessageBubble.tsx        ← 1b / 1e
    │   │   ├── PendingCard.tsx          ← 1b short wait / 1c long wait
    │   │   ├── QueuedList.tsx           ← 1d
    │   │   ├── KeyField.tsx             ← paste/replace/remove a key
    │   │   ├── ProviderPicker.tsx       ← segmented model control
    │   │   ├── Toggle.tsx / Button.tsx / FadingRule.tsx / Markdown.tsx
    │   ├── screens/
    │   │   ├── HomeScreen.tsx           ← chat + screen A gate
    │   │   ├── ChatsScreen.tsx          ← all chats
    │   │   ├── HistoryScreen.tsx        ← bandwidth ("Data" tab)
    │   │   └── SettingsScreen.tsx       ← 1f
    │   ├── state/
    │   │   ├── threadStore.ts           ← conversations, persisted
    │   │   ├── metricsStore.ts          ← per-message bandwidth, persisted
    │   │   ├── settingsStore.ts         ← toggles, persisted
    │   │   ├── keyStore.ts              ← keys in the OS keystore
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

- **One free app with one non-consumable IAP.** The product appears on the store listing
  under "In-App Purchases", and the App Store allows promoting it so a purchase can be
  started from the page.
- **The store owns the purchase record**, tied to the buyer's Apple ID / Google account.
  *Restore Purchases* replays it onto a new device — this is what removes the need for
  accounts.
- **The relay verifies.** The device sends its store receipt / RevenueCat token; the relay
  validates it server-side. A missing or invalid receipt means free tier, not an error.
- **Commission**: 30% standard; 15% under Apple's Small Business Program (<$1M/yr) and on
  Google Play's first $1M/yr. Price is set from per-answer cost *after* commission.
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
- [ ] **8.9** Fix the 403/503 ordering for an unconfigured model
- [ ] **8.10** Client adopts `ModelInfo`; delete `ProviderStatus` / `fetchProviders`
- [ ] **8.11** Model picker lists models (not providers); locked ones greyed and unselectable

### Phase 9 — Replace the accounts layer with entitlements ✂️
- [ ] **9.1** Delete `server/app/auth.py`, `server/app/accounts.py`, `server/.accounts.json`
- [ ] **9.2** Delete `client/src/auth/google.ts`, `client/src/state/sessionStore.ts`
- [ ] **9.3** Remove `expo-auth-session` / `expo-web-browser`; drop `GOOGLE_CLIENT_ID` from
      config and `.env.example`
- [ ] **9.4** `/v1/entitlement` replaces `/v1/session` + `/v1/subscription`: takes a store
      receipt, returns the model catalogue plus remaining allowance
- [ ] **9.5** Delete `KeyField.tsx`, `keyStore.ts`, `expo-secure-store`
- [ ] **9.6** Rewrite the server session tests as entitlement tests

### Phase 10 — Screen A 🚪
- [ ] **10.1** Two real checks (network, relay) plus what you can use right now
- [ ] **10.2** Free Gemini works immediately with no interaction
- [ ] **10.3** "Unlock all models" button → purchase sheet; "Restore purchases" alongside it
- [ ] **10.4** After purchase, show which models are now available and continue to chat

### Phase 11 — Purchase and entitlement 💳
- [ ] **11.1** RevenueCat account; one non-consumable product in App Store Connect and
      Google Play Console
- [ ] **11.2** `react-native-purchases` in the app, behind a dev build
- [ ] **11.3** Client sends the RevenueCat/store token with each request
- [ ] **11.4** Relay validates the receipt server-side before serving a paid model
- [ ] **11.5** Retire the `POST /v1/subscription` dev toggle
- [ ] **11.6** Store listing copy: what the add-on unlocks, the monthly allowance, price

### Phase 12 — Fair-use cap 📊
- [ ] **12.1** Usage counter keyed by receipt/purchase id
- [ ] **12.2** Count **answers per month**; also record token cost per answer so the limit
      can be re-tuned from real data
- [ ] **12.3** Over the cap → paid models fall back to free Gemini until reset, stated
      plainly in the UI
- [ ] **12.4** Show remaining allowance in Settings
- [ ] **12.5** Set the limit once per-answer cost is measured

### Phase 13 — Persistence and deployment 🗄️
- [ ] **13.1** SQLAlchemy models for entitlements + usage
- [ ] **13.2** SQLite locally, `DATABASE_URL` for managed Postgres in production
- [ ] **13.3** Alembic migrations
- [ ] **13.4** Dockerfile for the relay
- [ ] **13.5** Deploy to Fly.io / Railway / Render with managed Postgres
- [ ] **13.6** Point the app at the deployed relay over HTTPS
- [ ] **13.7** Replace the in-memory chunk cache, or pin the relay to one instance

### Phase 14 — Outstanding engineering 🔧
- [ ] **14.1** Run the 90% packet-loss proof: 10× at `LOSS_PROBABILITY=0.9` + a 0% control
- [ ] **14.2** Test on a physical phone
- [ ] **14.3** Shared-dictionary compression to beat the ~700 B crossover
- [ ] **14.4** Delete orphans: `TunnelButton.tsx`, `ProviderSelector.tsx`

---

## 6. Next Steps

1. **8.9–8.11** — finish the model catalogue on both sides
2. **Phase 9** — swap the accounts layer for receipt-based entitlement
3. **Phase 10–11** — screen A without sign-in, then the purchase itself
4. **Phase 12** — the fair-use cap, so one payment cannot buy unbounded API spend
5. **Phase 13** — database and hosting, once there is something worth deploying
