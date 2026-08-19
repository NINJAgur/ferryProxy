# Shipping Ferry

Ferry is two things that deploy separately: a **relay** (Python, runs on a server)
and an **app** (React Native, runs on a phone). The app is useless until the relay
has a public HTTPS address, so the relay goes first.

---

## 1. Host the relay

The app currently points at `http://127.0.0.1:8000`, which exists only on your
machine. A phone on mobile data cannot reach it.

Any host that runs a container or a Python process will do — Fly.io, Railway and
Render all work. A `Dockerfile` is included, but Railway and Render will build
from source without it.

**A volume is required, not optional.** Purchases and this month's usage live in
`entitlements.json`. Container filesystems are wiped on every deploy, so without a
mounted volume every deploy silently resets everyone's allowance. Mount one and
point `ENTITLEMENT_STORE_PATH` inside it (the Dockerfile defaults to `/data`).

**One instance only.** Answer chunks are cached in memory, so a second instance
returns 404 for chunks the first one is holding. Scaling out needs a shared cache
first.

Environment to set on the host — everything in `.env.example`, plus:

| Variable | Value | Why |
|---|---|---|
| `ALLOW_DEV_SUBSCRIPTION` | **unset, or `false`** | When true, anyone can unlock the paid models for free by POSTing to `/v1/dev/entitlement`. It defaults to false; do not turn it on. |
| `REVENUECAT_API_KEY` | your key | Without it no receipt verifies, so every caller stays on the free tier. |
| `ENTITLEMENT_STORE_PATH` | inside the volume | Otherwise usage resets on deploy. |
| `CORS_ALLOW_ORIGINS` | your web origin | Only constrains browsers; the native app sends no `Origin`. |

Verify after deploying:

```
curl https://your-relay/health
curl -X POST https://your-relay/v1/entitlement      # free tier, no receipt
curl -X POST https://your-relay/v1/dev/entitlement -d '{"receipt":"x"}'   # must 403
```

That last one returning anything but 403 means the paid models are being given
away.

## 2. Point the app at it

Replace `REPLACE-WITH-YOUR-RELAY` in `client/eas.json` (both `preview` and
`production`) with the HTTPS URL from step 1. `http` will not do: iOS blocks
cleartext by default.

## 3. Build the app

`client/app.json` carries the identity that becomes permanent at first publish:

- `ios.bundleIdentifier` and `android.package` are both `com.ninjagur.ferry`.
  **Change these before the first build if you want a different id** — they cannot
  be changed after a store release.

```
npm install -g eas-cli
eas login
eas build --profile preview --platform android   # installable .apk to test on a real phone
eas build --profile production --platform all
```

In-app purchases cannot run in Expo Go — the unlock button needs a dev or preview
build against a real store product.

## 4. Before a store submission

- **The purchase is not implemented.** `client/src/purchases.ts` talks to the
  relay's dev endpoint, not to a store. Shipping as-is means the unlock button
  does nothing in production, because `ALLOW_DEV_SUBSCRIPTION` is false there.
  Phase 11 wires RevenueCat and a real non-consumable product.
- Restore Purchases must work — both stores require it, and it is what removes the
  need for user accounts.
- A privacy policy URL is required by both stores. Ferry sends prompts to the
  relay, which forwards them to a model provider and keeps a few minutes of the
  answer's chunks; it stores no conversation of its own.
- Disclose the add-on: what it unlocks, the monthly answer allowance, and the price.

## Known limits at this version

- **Ferry does not survive 90% packet loss** with the shipped retry budget: 0/10
  answers reassembled, against 10/10 with no loss. Measured fixes exist (40
  attempts with a 1s backoff cap gives 5/5) but the constants are unchanged.
  See `server/scripts/e2e_resilience_test.py`.
- Free-tier Gemini allows **20 generations per day**, per project, per model.
- The chunk cache is in-memory, so it does not survive a restart and pins the
  relay to one instance.
