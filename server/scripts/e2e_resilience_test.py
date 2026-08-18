"""Usage: run `uvicorn app.main:app` and `python scripts/simulate_loss.py` in separate
terminals first, then `python scripts/e2e_resilience_test.py --trials 10`.
"""
import argparse
import asyncio
import json
import logging
import os
import random
import sys
import time
import uuid
from pathlib import Path
from typing import Dict, Tuple

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.protocol.checksum import sha256_hex  # noqa: E402
from app.protocol.chunker import reassemble_chunks  # noqa: E402
from app.protocol.compression import compress_to_base64, decompress_from_base64  # noqa: E402

logger = logging.getLogger(__name__)

CHUNK_FETCH_TIMEOUT_S = 8.0
CHUNK_RETRY_BASE_DELAY_S = 0.5
CHUNK_RETRY_MAX_DELAY_S = 8.0
CHUNK_RETRY_MAX_ATTEMPTS = 5
CHUNK_RETRY_JITTER = 0.2
CHUNK_FETCH_CONCURRENCY = 3
REASSEMBLY_BUDGET_S = 60.0


def _backoff_delay(attempt: int) -> float:
    delay = min(CHUNK_RETRY_BASE_DELAY_S * (2**attempt), CHUNK_RETRY_MAX_DELAY_S)
    jitter = delay * CHUNK_RETRY_JITTER
    return max(0.0, delay + random.uniform(-jitter, jitter))


async def post_with_retry(client: httpx.AsyncClient, base_url: str, envelope: dict) -> dict:
    last_exc: Exception = RuntimeError("no attempts made")
    for attempt in range(CHUNK_RETRY_MAX_ATTEMPTS):
        try:
            response = await client.post(f"{base_url}/v1/chat", json=envelope, timeout=CHUNK_FETCH_TIMEOUT_S)
            response.raise_for_status()
            return response.json()
        except Exception as exc:  # noqa: BLE001 - deliberately broad: any failure means "retry"
            last_exc = exc
            await asyncio.sleep(_backoff_delay(attempt))
    raise RuntimeError(f"POST /v1/chat failed after {CHUNK_RETRY_MAX_ATTEMPTS} attempts: {last_exc}")


async def fetch_chunk_with_retry(client: httpx.AsyncClient, base_url: str, request_id: str, index: int) -> str:
    last_exc: Exception = RuntimeError("no attempts made")
    for attempt in range(CHUNK_RETRY_MAX_ATTEMPTS):
        try:
            response = await client.get(
                f"{base_url}/v1/chat/{request_id}/chunks/{index}", timeout=CHUNK_FETCH_TIMEOUT_S
            )
            response.raise_for_status()
            return response.json()["chunk"]
        except Exception as exc:  # noqa: BLE001
            last_exc = exc
            await asyncio.sleep(_backoff_delay(attempt))
    raise RuntimeError(f"chunk {index} failed after {CHUNK_RETRY_MAX_ATTEMPTS} attempts: {last_exc}")


async def fetch_remaining_chunks(
    client: httpx.AsyncClient, base_url: str, request_id: str, total_chunks: int, chunk_0: str
) -> Dict[int, str]:
    collected: Dict[int, str] = {0: chunk_0}
    semaphore = asyncio.Semaphore(CHUNK_FETCH_CONCURRENCY)

    async def _one(index: int) -> None:
        async with semaphore:
            collected[index] = await fetch_chunk_with_retry(client, base_url, request_id, index)

    await asyncio.gather(*[_one(i) for i in range(1, total_chunks)])
    return collected


async def run_trial(client: httpx.AsyncClient, base_url: str, trial_index: int) -> Tuple[float, int]:
    plaintext = {"prompt": f"Trial {trial_index}: explain photosynthesis in a few paragraphs."}
    raw = json.dumps(plaintext).encode("utf-8")
    envelope = {
        "protocolVersion": 1,
        "sessionId": "e2e-resilience-session",
        "requestId": str(uuid.uuid4()),
        "algorithm": "gzip",
        "encoding": "base64",
        "checksum": sha256_hex(raw),
        "payload": compress_to_base64(raw),
    }

    start = time.monotonic()
    body = await asyncio.wait_for(post_with_retry(client, base_url, envelope), timeout=REASSEMBLY_BUDGET_S)
    collected = await asyncio.wait_for(
        fetch_remaining_chunks(client, base_url, body["requestId"], body["totalChunks"], body["chunk"]),
        timeout=REASSEMBLY_BUDGET_S,
    )
    reassembled_b64 = reassemble_chunks(collected, body["totalChunks"])
    decompressed = decompress_from_base64(reassembled_b64)
    if sha256_hex(decompressed) != body["checksum"]:
        raise RuntimeError("checksum mismatch after reassembly")

    return time.monotonic() - start, body["totalChunks"]


async def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--trials", type=int, default=10)
    parser.add_argument(
        "--proxy-url", default=f"http://127.0.0.1:{os.environ.get('PROXY_PORT', '8001')}"
    )
    args = parser.parse_args()

    successes = 0
    async with httpx.AsyncClient() as client:
        for i in range(args.trials):
            try:
                elapsed, total_chunks = await run_trial(client, args.proxy_url, i)
                successes += 1
                logger.info("trial %d: OK in %.2fs (%d chunks)", i, elapsed, total_chunks)
            except Exception:
                logger.exception("trial %d: FAILED", i)

    logger.info("results: %d/%d trials succeeded", successes, args.trials)
    if successes < args.trials:
        raise SystemExit(1)


if __name__ == "__main__":
    asyncio.run(main())
