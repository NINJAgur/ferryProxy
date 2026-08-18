# Ferry

Ask an LLM a question over a connection that barely works.

Ferry splits the job in two: a **relay** (Python/FastAPI) that talks to the model over
a normal connection, and a **phone app** (React Native/Expo) that talks to the relay over
a deliberately thin one. Answers come back compressed, cut into numbered pieces, and
reassembled on the phone — surviving dropped packets, 2G latency, and going offline
mid-conversation.

The wire format is documented in [PROTOCOL.md](PROTOCOL.md).

## What it actually does

- **Encodes without ever inflating.** gzip and plain text are compared per message and the
  smaller one is sent. Compressing a short prompt used to double it.
- **Splits long answers into pieces** and fetches them a few at a time, retrying only the
  failures — a dropped connection costs seconds, not the whole answer.
- **Verifies what it rebuilt** with a checksum over the decoded plaintext, so chunks that
  arrive mangled or out of order are caught rather than shown.
- **Queues what you write offline** and sends it, in order, when a line reappears.
- **Reports its own bandwidth honestly**, including the cases where it loses.

## Requirements

- Python 3.9+
- Node 18+
- One API key (Gemini has a free tier: <https://aistudio.google.com/apikey>), or none at
  all — the built-in `demo` provider answers without any key.

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

## Providers

`demo`, `anthropic`, `openai`, `gemini` — chosen per request from the app. Keys live only
in `server/.env`; the phone never holds one. `GET /v1/providers` reports which are usable,
which is what the app's first screen is checking.

The `demo` provider needs no key and answers instantly, so the whole transport can be
exercised offline.

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

Below roughly 700 bytes of answer, the fixed envelope plus base64's overhead costs more
than compression saves, and Ferry is genuinely worse than sending it plainly. Above that
the saving climbs steeply. The app reports whichever is true.

The larger saving isn't compression at all: **"Answer short first"** asks the model to be
brief, which took one real Gemini reply from 4,019 characters to 314. On a thin line,
asking for less beats compressing more.

## Known limits

- The relay keeps cached chunks in memory, so it is single-instance by design.
- TLS-intercepting antivirus (Avast and similar) will block the relay's outbound HTTPS
  until its CA is added to a trust bundle; `SSL_CERT_FILE` points Python at one.
- Ferry is its own client. It cannot compress traffic from the official ChatGPT or Gemini
  apps — that traffic is TLS-pinned, and compression needs both ends to cooperate.
