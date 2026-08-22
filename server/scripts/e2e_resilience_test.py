"""Prove the transport survives a channel that drops most of what it carries.

Run the relay and the loss proxy in separate terminals first:

    uvicorn app.main:app
    LOSS_PROBABILITY=0.9 python scripts/simulate_loss.py
    python scripts/e2e_resilience_test.py --trials 10

Sends and reassembly are measured separately, because only one of them costs
anything. The proxy drops a request before forwarding it, so a dropped send
never reaches a provider; the sends that do get through each cost one answer.
Reassembly then runs against that cached answer, free, and it is the half the
chunking protocol exists for.

Free-tier Gemini allows 20 generations per *day*, which a handful of runs will
exhaust — pass a paid model plus --receipt to keep going.

Pass --direct to run the same trials straight at the relay as a 0% control.
"""
import argparse
import asyncio
import base64
import gzip
import json
import logging
import os
import random
import statistics
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.protocol.checksum import sha256_hex  # noqa: E402
from app.protocol.chunker import reassemble_chunks  # noqa: E402

logger = logging.getLogger("resilience")

# Mirrors the client. If these drift, the proof stops describing the app.
SEND_TIMEOUT_S = 90.0
CHUNK_FETCH_TIMEOUT_S = 8.0
CHUNK_RETRY_BASE_DELAY_S = 0.5
# Mirrors client/src/transport/reassembly.ts. These drifted once already: the
# client was retuned to 40 attempts and a 1s cap while this kept measuring 5 and
# 8s, so the harness was proving a transport nobody ships.
CHUNK_RETRY_MAX_DELAY_S = 1.0
CHUNK_RETRY_MAX_ATTEMPTS = 40
SEND_RETRY_MAX_ATTEMPTS = 5
CHUNK_RETRY_JITTER = 0.2
CHUNK_FETCH_CONCURRENCY = 3
REASSEMBLY_BUDGET_S = 180.0

# The relay caches an answer's chunks for 5 minutes; re-prime before that runs out.
CACHE_REFRESH_S = 240.0

PROMPT = (
    "Explain photosynthesis: the light-dependent reactions, the Calvin cycle, and why "
    "chlorophyll is green. Then explain how C4 and CAM plants differ from C3 plants."
)


# Overridden from the command line so the retry budget can be swept: the point of
# the sweep is to find what a 90%-loss channel actually needs.
TUNING = {"attempts": CHUNK_RETRY_MAX_ATTEMPTS, "cap": CHUNK_RETRY_MAX_DELAY_S}


def _backoff_delay(attempt: int) -> float:
    delay = min(CHUNK_RETRY_BASE_DELAY_S * (2**attempt), TUNING["cap"])
    jitter = delay * CHUNK_RETRY_JITTER
    return max(0.0, delay + random.uniform(-jitter, jitter))


def build_envelope(request_id: str, model: str) -> dict:
    raw = json.dumps({"prompt": PROMPT, "model": model, "brief": False}).encode("utf-8")
    compressed = base64.b64encode(gzip.compress(raw)).decode("ascii")
    plain = raw.decode("utf-8")
    # Encoding must never inflate, so pick whichever is actually smaller.
    if len(compressed) < len(plain):
        return {"r": request_id, "a": "gzip", "k": sha256_hex(raw), "p": compressed}
    return {"r": request_id, "a": "none", "k": sha256_hex(raw), "p": plain}


def decode_payload(algorithm: str, text: str) -> bytes:
    if algorithm == "gzip":
        return gzip.decompress(base64.b64decode(text))
    return text.encode("utf-8")


@dataclass
class Attempt:
    ok: bool
    seconds: float
    requests: int
    detail: str = ""


@dataclass
class Phase:
    name: str
    attempts: List[Attempt] = field(default_factory=list)

    def add(self, attempt: Attempt) -> None:
        self.attempts.append(attempt)

    def report(self) -> None:
        total = len(self.attempts)
        if not total:
            return
        wins = [a for a in self.attempts if a.ok]
        logger.info("")
        logger.info("%s: %d/%d succeeded", self.name, len(wins), total)
        if wins:
            times = sorted(a.seconds for a in wins)
            logger.info(
                "  time to succeed: median %.1fs, worst %.1fs", statistics.median(times), times[-1]
            )
            reqs = [a.requests for a in wins]
            logger.info(
                "  HTTP requests spent: median %d, worst %d", int(statistics.median(reqs)), max(reqs)
            )
        for a in self.attempts:
            if not a.ok:
                logger.info("  failed: %s", a.detail)


async def send_once(
    client: httpx.AsyncClient, base_url: str, model: str, receipt: Optional[str] = None
) -> Tuple[dict, int]:
    """POST /v1/chat with the client's retry discipline. Returns (body, requests spent)."""
    request_id = f"e2e{random.randint(10**8, 10**9 - 1)}"
    envelope = build_envelope(request_id, model)
    headers = {"X-Store-Receipt": receipt} if receipt else {}
    spent = 0
    last = "no attempts"
    for attempt in range(TUNING["attempts"]):
        spent += 1
        try:
            response = await client.post(
                f"{base_url}/v1/chat", json=envelope, headers=headers, timeout=SEND_TIMEOUT_S
            )
            if response.status_code == 502 and "RESOURCE_EXHAUSTED" in response.text:
                # A provider quota is not a transport failure, so say so rather than
                # reporting it as one. The free-tier limit is per day: waiting will
                # not clear it, and the run needs a paid model to continue.
                raise RuntimeError(
                    "provider quota exhausted — free-tier Gemini allows 20 generations "
                    "per day. Re-run with --model gpt-4o --receipt dev:this-device"
                )
            if response.status_code >= 400:
                # 4xx is the same answer every time; only transient failures are worth a retry.
                raise RuntimeError(f"HTTP {response.status_code}: {response.text[:120]}")
            return response.json(), spent
        except RuntimeError:
            raise
        except Exception as exc:  # noqa: BLE001 — a dropped connection is the point of the test
            last = f"{type(exc).__name__}: {exc}"
            await asyncio.sleep(_backoff_delay(attempt))
    raise RuntimeError(f"send failed after {TUNING['attempts']} attempts ({last})")


async def fetch_chunk(
    client: httpx.AsyncClient, base_url: str, request_id: str, index: int, counter: List[int]
) -> str:
    last = "no attempts"
    for attempt in range(TUNING["attempts"]):
        counter[0] += 1
        try:
            response = await client.get(
                f"{base_url}/v1/chat/{request_id}/chunks/{index}", timeout=CHUNK_FETCH_TIMEOUT_S
            )
            if response.status_code == 404:
                raise RuntimeError("the relay no longer has this answer (cache expired)")
            response.raise_for_status()
            return response.json()["c"]
        except RuntimeError:
            raise
        except Exception as exc:  # noqa: BLE001
            last = f"{type(exc).__name__}: {exc}"
            await asyncio.sleep(_backoff_delay(attempt))
    raise RuntimeError(f"chunk {index} failed after {TUNING['attempts']} attempts ({last})")


async def reassemble(
    client: httpx.AsyncClient, base_url: str, body: dict
) -> Tuple[str, int]:
    """Fetch every chunk but the first, 3 in flight, and verify the whole answer."""
    counter = [0]
    collected: Dict[int, str] = {0: body["c"]}
    semaphore = asyncio.Semaphore(CHUNK_FETCH_CONCURRENCY)

    async def one(index: int) -> None:
        async with semaphore:
            collected[index] = await fetch_chunk(client, base_url, body["r"], index, counter)

    await asyncio.gather(*[one(i) for i in range(1, body["n"])])

    decoded = decode_payload(body["a"], reassemble_chunks(collected, body["n"]))
    if sha256_hex(decoded) != body["k"]:
        raise RuntimeError("checksum mismatch after reassembly")
    return json.loads(decoded)["content"], counter[0]


async def run(args: argparse.Namespace) -> int:
    lossy = args.direct or f"http://127.0.0.1:{os.environ.get('PROXY_PORT', '8001')}"
    clean = args.relay

    async with httpx.AsyncClient() as client:
        logger.info("priming: one clean send to %s so there is an answer to re-fetch", clean)
        primed, _ = await send_once(client, clean, args.model, args.receipt)
        primed_at = time.monotonic()
        answer, _ = await reassemble(client, clean, primed)
        logger.info(
            "primed: %d chunks, %d characters of answer", primed["n"], len(answer)
        )
        if primed["n"] < 2:
            logger.warning("only one chunk — there is no reassembly here to test")

        send_phase = Phase(f"SEND through {lossy}")
        for i in range(args.send_trials):
            start = time.monotonic()
            try:
                _, spent = await asyncio.wait_for(
                    send_once(client, lossy, args.model, args.receipt), timeout=REASSEMBLY_BUDGET_S
                )
                send_phase.add(Attempt(True, time.monotonic() - start, spent))
                logger.info("send %d: OK after %d attempt(s)", i, spent)
            except Exception as exc:  # noqa: BLE001
                send_phase.add(Attempt(False, time.monotonic() - start, 0, str(exc)[:150]))
                logger.info("send %d: gave up (%s)", i, str(exc)[:90])

        reassembly_phase = Phase(f"REASSEMBLY through {lossy}")
        for i in range(args.trials):
            if time.monotonic() - primed_at > CACHE_REFRESH_S:
                logger.info("re-priming: the relay's cache of that answer is about to expire")
                primed, _ = await send_once(client, clean, args.model, args.receipt)
                primed_at = time.monotonic()

            start = time.monotonic()
            try:
                _, requests = await asyncio.wait_for(
                    reassemble(client, lossy, primed), timeout=REASSEMBLY_BUDGET_S
                )
                reassembly_phase.add(Attempt(True, time.monotonic() - start, requests))
                logger.info(
                    "reassembly %d: OK in %.1fs — %d requests for %d chunks",
                    i,
                    time.monotonic() - start,
                    requests,
                    primed["n"] - 1,
                )
            except Exception as exc:  # noqa: BLE001
                reassembly_phase.add(Attempt(False, time.monotonic() - start, 0, str(exc)[:150]))
                logger.info("reassembly %d: FAILED (%s)", i, str(exc)[:90])

    send_phase.report()
    reassembly_phase.report()

    failed = [a for a in reassembly_phase.attempts if not a.ok]
    return 1 if failed else 0


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    # Every dropped request would otherwise log a line, burying the result.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    parser = argparse.ArgumentParser()
    parser.add_argument("--trials", type=int, default=10, help="reassembly trials (cheap)")
    parser.add_argument("--send-trials", type=int, default=3, help="send trials (each costs an answer)")
    parser.add_argument("--relay", default="http://127.0.0.1:8000", help="the relay, no loss")
    parser.add_argument(
        "--direct",
        nargs="?",
        const="http://127.0.0.1:8000",
        default=None,
        help="skip the lossy proxy — the 0%% control",
    )
    parser.add_argument("--model", default="gemini-3.6-flash")
    parser.add_argument(
        "--receipt", default=None, help="store receipt, needed for a paid model"
    )
    parser.add_argument("--max-attempts", type=int, default=CHUNK_RETRY_MAX_ATTEMPTS)
    parser.add_argument("--backoff-cap", type=float, default=CHUNK_RETRY_MAX_DELAY_S)
    args = parser.parse_args()
    TUNING["attempts"] = args.max_attempts
    TUNING["cap"] = args.backoff_cap
    logger.info(
        "tuning: %d attempts per request, backoff capped at %.1fs",
        args.max_attempts,
        args.backoff_cap,
    )
    raise SystemExit(asyncio.run(run(args)))


if __name__ == "__main__":
    main()
