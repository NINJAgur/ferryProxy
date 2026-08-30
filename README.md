# Ferry

Ask an LLM a question over a connection that barely works.

Ferry splits the job in two: a **relay** (Python/FastAPI) that talks to the model over
a normal connection, and a **phone app** (React Native/Expo) that talks to the relay over
a deliberately thin one. Answers come back compressed, cut into numbered pieces, and
reassembled on the phone — surviving dropped packets, 2G latency, and going offline
mid-conversation.

The wire format is documented in [PROTOCOL.md](PROTOCOL.md).

## What it actually does

- **Encodes without ever inflating.** Three encodings are compared per message and the
  smallest is sent: plain text, gzip, and raw deflate against a dictionary both ends
  already hold. The dictionary is what makes a short message compressible at all.
- **Splits long answers into pieces** and fetches them a few at a time, retrying only the
  failures — a dropped connection costs seconds, not the whole answer.
- **Verifies what it rebuilt** with a checksum over the decoded plaintext, so chunks that
  arrive mangled or out of order are caught rather than shown.
- **Queues what you write offline** and sends it, in order, when a line reappears.
- **Reports its own bandwidth honestly**, including the cases where it loses.

## Requirements

- Python 3.9+
- Node 18+
- An API key for at least one model. Gemini has a free tier:
  <https://aistudio.google.com/apikey>

## Running it

**Relay:**

```bash
cd server
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements-dev.txt   # macOS/Linux: .venv/bin/python
cp ../.env.example .env        # then put your key in server/.env
.venv/Scripts/python -m uvicorn app.main:app --port 8000
```

Check a key works before involving the app:

```bash
python scripts/check_provider.py gemini
python scripts/check_provider.py gemini --list-models
```

**App:**

```bash
cd client
npm install
npm start          # then press w for web, or scan the QR code with Expo Go
```

Point the app at the relay with `client/.env`:

```
EXPO_PUBLIC_API_URL=http://127.0.0.1:8000
```

On a physical phone, use your machine's LAN IP rather than `127.0.0.1`.

## Providers and what a purchase buys

`anthropic`, `openai`, `gemini` — nine models across the three, chosen per message in the
app. The relay holds the accounts: four service keys in `server/.env`, two of them for
Gemini so free traffic can never bill the paid account. There is no key entry in the app
and nothing is stored on the device — which model you may use is decided by the relay
from your receipt, not by the client asking nicely.

Gemini Flash is free, with a monthly allowance that renews. One optional purchase of
**$20** adds Claude, GPT and Gemini Pro: a fixed pool of **500 answers** to spend across
them, which does not expire and does not renew. A pool rather than a subscription because
the payment happens once, so what it covers has to be finite.

There are no accounts. The store's receipt is the credential, and Play replays it onto a
new device through Restore Purchases.

Ownership is a count rather than a flag. The relay asks the store what this customer has
bought, keys the pool to the oldest transaction so it survives a reinstall, and allows
500 answers for each purchase — so buying again tops the pool up rather than replacing
it.

## Testing a bad connection

`scripts/simulate_loss.py` is a proxy that drops and delays requests on purpose:

```bash
cd server
LOSS_PROBABILITY=0.9 LATENCY_MIN_MS=300 LATENCY_MAX_MS=2000 \
  TARGET_URL=http://127.0.0.1:8000 PROXY_PORT=8001 \
  .venv/Scripts/python scripts/simulate_loss.py
```

Point `EXPO_PUBLIC_API_URL` at `http://127.0.0.1:8001` and the app runs over a link that
loses 90% of what it sends. `scripts/e2e_resilience_test.py` drives the same path headlessly
and asserts the answer still arrives intact.

```bash
cd server && .venv/Scripts/python -m pytest    # relay
cd client && npm test                          # app
```

## What it costs

Measured, at a 512-byte chunk size:

| answer | plain | Ferry | saved |
|---|---|---|---|
| 259 B | 341 B | 505 B | −48% |
| 2,269 B | 2,379 B | 1,828 B | **+23%** |
| 4,019 B (real Gemini) | 4,291 B | 3,101 B | **+28%** |

There used to be a crossover around 700 bytes: below it the envelope plus base64's
overhead cost more than compression saved, and Ferry was genuinely worse than sending
plainly. A shared dictionary removed it. Deflate has nothing to point at in a short
message, so both ends now hold 401 bytes of what every payload repeats — envelope keys,
model ids, common words — and match into that before the message starts. A 91-byte
request becomes 56; a 514-byte one becomes 140, where gzip managed 232.

The app still compares all three per message and reports whichever won, because the
rule has not changed: encoding must never make a payload larger.

The larger saving isn't compression at all: **"Answer short first"** asks the model to be
brief, which took one real Gemini reply from 4,019 characters to 314. On a thin line,
asking for less beats compressing more.

## Known limits

- Cached chunks are written to disk as well as held in memory, so an answer survives a
  restart mid-collection — but the cache is local to one relay, so it is still
  single-instance by design.
- Ferry Pro is sold through Google Play only. Two merchants of record declined the
  category, so a browser or a sideloaded APK gets the free model and nothing to buy.
- TLS-intercepting antivirus (Avast and similar) will block the relay's outbound HTTPS
  until its CA is added to a trust bundle; `SSL_CERT_FILE` points Python at one.
- Ferry is its own client. It cannot compress traffic from the official ChatGPT or Gemini
  apps — that traffic is TLS-pinned, and compression needs both ends to cooperate.
