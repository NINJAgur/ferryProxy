# Wire Protocol

Canonical source of truth for what Ferry puts on the wire. Mirrored in
`server/app/protocol/schemas.py` (Pydantic) and `client/src/transport/types.ts`
(TypeScript). Any change here must be applied to both, and to the tests.

- **Transport:** HTTP POST/GET, `Content-Type: application/json`. No SSE, no WebSockets.
- **Field names are single letters.** These envelopes repeat on every message and every
  chunk, so the names themselves are bandwidth. The map is below; code uses readable
  names and aliases them at the boundary.

## Encoding: never inflate

`algorithm` is chosen per payload as **whichever is actually smaller**:

| value | meaning |
|---|---|
| `none` | the UTF-8 text as-is |
| `gzip` | `base64(gzip(bytes))` |

Compressing short text is counterproductive: gzip adds ~20 bytes of header/trailer and
base64 then inflates the result by a third, so a small prompt can more than double.
A 66-byte prompt became 112 bytes under unconditional gzip. Both sides therefore encode
with `encode_payload` / `encodePayload`, which compare and pick the smaller.

**Checksum:** first 16 hex chars (64 bits) of the SHA-256 of the *decompressed plaintext*.
Gzip already CRC-checks its own stream; this guards against chunks arriving mangled,
duplicated, or out of order — accident, not forgery — for which 64 bits is ample. The
full 64-char digest cost 48 bytes in every envelope.

**Ids:** 12 base62 characters (~71 bits), not UUIDs. Enough to keep requests apart for a
300-second cache TTL, and 24 bytes shorter everywhere one appears.

## Request — `POST /v1/chat`

```jsonc
{
  "r": "aZ3kP9xQ2mVt",   // requestId — also the chunk-cache key
  "a": "none",           // algorithm: "none" | "gzip"
  "k": "9f2a1c7b3e5d8a04",  // checksum of the plaintext below
  "p": "{\"prompt\":\"…\"}"  // payload, encoded per "a"
}
```

Decoded payload (`ChatRequestPlaintext`):

```jsonc
{
  "prompt": "…",
  "history": [{ "role": "user" | "assistant", "content": "…" }],
  "provider": "demo" | "anthropic" | "openai" | "gemini",
  "model": "…",        // optional per-provider override
  "maxTokens": 2048    // optional
}
```

Server: decode by `a` → **verify `k` before trusting the JSON** → validate → call the
provider with streaming disabled.

## Response

The server encodes the whole answer once, then either returns it whole or splits it.

- Fits in `CHUNK_SIZE_BYTES` (default 512) → returned whole, `n: 1`.
- Otherwise → split into fixed-size slices; the full string is cached by `r` for
  `CACHE_TTL_SECONDS` (default 300). **Chunk 0 comes back in the POST response**, saving
  a round trip; the rest are fetched individually.

```jsonc
// POST /v1/chat response
{
  "r": "aZ3kP9xQ2mVt",   // requestId
  "a": "gzip",           // algorithm of the reassembled payload
  "k": "9f2a1c7b3e5d8a04",  // checksum of the full decoded plaintext
  "n": 3,                // total chunks
  "c": "H4sIAAAA…",      // chunk 0
  "t": 300               // seconds the server will hold the rest
}

// GET /v1/chat/{requestId}/chunks/{index}
{ "i": 1, "n": 3, "c": "…" }   // index, total, chunk
```

Decoded payload (`ChatResponsePlaintext`):

```jsonc
{ "content": "…markdown…", "provider": "demo", "model": "demo-1", "stopReason": "end_turn" }
```

Reassembly: concatenate chunks **in index order** → decode by `a` → parse → verify `k`.

## Chunking and retries

- No persistent connection: the client **polls** missing indices. The server never pushes.
- Chunk fetches run 3 at a time — sequential is too slow, unbounded defeats the point.
- Out-of-order arrival is fine; chunks are held in a map keyed by index.
- Per-chunk timeout 8s. Backoff 500ms base, ×2, cap 8s, ±20% jitter, max 5 attempts.
  Whole-reassembly budget 60s.
- **Only transient failures are retried.** A dropped connection or timeout is retried; a
  4xx, a 404 for an expired cache entry, or a 503 for an unconfigured provider is not —
  those fail identically every time, so retrying them only stalls the UI behind backoff.
- A 404 or a checksum mismatch after full reassembly is unrecoverable at the chunk level:
  the client abandons that `r` and resends the original prompt under a new one.

## Other endpoints

```jsonc
GET /health        → { "status": "ok" }
GET /v1/providers  → { "providers": [
  { "name": "demo", "label": "Demo", "ready": true, "requiresKey": false, "envVar": null },
  { "name": "anthropic", "label": "Claude", "ready": false, "requiresKey": true, "envVar": "ANTHROPIC_API_KEY" }
] }
```

`ready` reports whether the **relay** holds a usable key. Nobody signs in from the phone.

## Errors

```jsonc
{ "error": "checksum_mismatch", "message": "…" }
```

`invalid_payload` (400), `checksum_mismatch` (400), `not_found` / `chunk_out_of_range` (404),
`provider_not_configured` (503), `provider_error` (502).

## What this costs

Measured against sending the same prompt and answer as plain JSON, at a 512-byte chunk size:

| answer size | plain | Ferry | saved |
|---|---|---|---|
| 259 B | 341 B | 505 B | −48% |
| 2,269 B | 2,379 B | 1,828 B | **+23%** |

Fixed overhead is ~71 B per request envelope, ~90 B per response envelope, ~20 B per extra
chunk. Below roughly 700 bytes of answer that overhead — plus base64's third on the
compressed bytes — costs more than compression saves, so short replies are genuinely worse
off. Above it the saving climbs steeply (~+60% at 2.4 KB, ~+86% at 10 KB). The Data screen
reports the real figure either way rather than a flattering one.
