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
| `ENTITLEMENT_STORE_PATH` | inside the volume | Otherwise purchases and usage reset on every deploy. |
| `RESTORE_CODE_STORE_PATH` | inside the volume | The only thing linking a web purchase to a new device. Losing it strands every web buyer. |
| `CHUNK_CACHE_PATH` | inside the volume | Answers waiting to be collected. Without it a deploy mid-answer loses one already generated and paid for. |
| `USAGE_LOG_PATH` | inside the volume | What answers cost, which is how the price is set. |
| `ALLOW_SANDBOX_PURCHASES` | **unset, or `false`** | When true a store's test purchase unlocks the paid models, and anyone who finds the sandbox checkout gets them free. |
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

Done: `client/eas.json` points `preview` and `production` at
`https://ferryproxy.onrender.com`. The `development` profile still uses
`http://127.0.0.1:8000`, so a dev build talks to a relay on your machine.

## 3. Build the app

`client/app.json` carries the identity that becomes permanent at first publish:

- `android.package` is `com.ninjagur.ferry`, and is now fixed: a build carrying it
  has been uploaded to Play, so it cannot change. (`ios.bundleIdentifier` is set to
  match but unused — iOS is not being shipped.)

Four build profiles, because where an app is distributed decides how it may take
money. Play requires Play Billing for anything it distributes; an APK from
anywhere else, and Ferry in a browser, use a hosted web checkout instead. The
relay never learns which was used — RevenueCat normalises both to a customer id.

| Profile | Output | Billing | For |
|---|---|---|---|
| `development` | dev client | Play | a relay on your own machine |
| `preview` | APK | Play | installing on your own phone |
| `production` | AAB | Play | the Play Console |
| `sideload` | APK | web checkout | Aptoide, GitHub Releases |

```
npm install -g eas-cli
eas login
eas build --profile preview --platform android   # installable .apk to test on a real phone
eas build --profile production --platform all
```

In-app purchases cannot run in Expo Go — the unlock button needs a dev or preview
build against a real store product.

## 4. Before a store submission

- **The purchase works, and has been made.** `client/src/billing/` holds the two
  providers; on web and in Expo Go the native module does not exist, so it falls
  back to the relay's dev endpoint, which production refuses. On Play it is real,
  and what it needed was:
  - A Play Console one-time product, priced, created as a **consumable** so a pool
    that runs out can be bought again.
  - The product in RevenueCat, in a **package** inside the current offering — an
    offering holds one product per app, and ours had only the web one for a while,
    which is what "there is an issue with your configuration" meant.
  - `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` set for the build, and `REVENUECAT_API_KEY`
    (the secret key) on the relay.
  - A Google Payments merchant profile, and service credentials that take **up to 36
    hours** to become valid — every check fails meanwhile, which looks like a mistake
    and is not.
  - **12 testers for 14 continuous days** on a closed track, before a personal
    account can apply for production access. Internal testing does not count toward
    it: a tester has to open the closed track's own opt-in link.

  Note what is *not* required: an entitlement. A consumable does not hold one open,
  so both ends count one-time purchases instead — the allowance is 500 per purchase,
  and an entitlement is a boolean.
- Restore Purchases must work — both stores require it, and it is what removes the
  need for user accounts.
- A privacy policy URL is required by both stores. Ferry sends prompts to the
  relay, which forwards them to a model provider and keeps a few minutes of the
  answer's chunks; it stores no conversation of its own.
- Disclose the add-on: what it unlocks, the monthly answer allowance, and the price.

## The store listing

`client/assets/play-icon-512.png` and `play-feature-1024x500.png` are for the
Play Console. Everything else in `assets/` ships inside the app and is never
uploaded. Screenshots have to be real captures — there is nothing to generate.

## Known limits at this version

- **Ferry does not survive 90% packet loss** with the shipped retry budget: 0/10
  answers reassembled, against 10/10 with no loss. Measured fixes exist (40
  attempts with a 1s backoff cap gives 5/5) but the constants are unchanged.
  See `server/scripts/e2e_resilience_test.py`.
- Free-tier Gemini allows **20 generations per day**, per project, per model.
- The chunk cache is in-memory, so it does not survive a restart and pins the
  relay to one instance.
