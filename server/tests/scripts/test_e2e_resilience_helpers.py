import httpx

from scripts.e2e_resilience_test import fetch_chunk_with_retry


class _FlakyTransport(httpx.AsyncBaseTransport):
    def __init__(self, fail_times: int):
        self._remaining_failures = fail_times
        self.call_count = 0

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        self.call_count += 1
        if self._remaining_failures > 0:
            self._remaining_failures -= 1
            raise httpx.ConnectError("simulated connection drop", request=request)
        return httpx.Response(
            200, json={"requestId": "r1", "chunkIndex": 0, "totalChunks": 1, "chunk": "abcd"}
        )


class _AlwaysFailTransport(httpx.AsyncBaseTransport):
    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("simulated connection drop", request=request)


async def test_fetch_chunk_recovers_after_transient_failures(monkeypatch):
    monkeypatch.setattr("scripts.e2e_resilience_test.CHUNK_RETRY_BASE_DELAY_S", 0.01)
    monkeypatch.setattr("scripts.e2e_resilience_test.CHUNK_RETRY_MAX_DELAY_S", 0.02)
    transport = _FlakyTransport(fail_times=3)

    async with httpx.AsyncClient(transport=transport) as client:
        chunk = await fetch_chunk_with_retry(client, "http://test", "r1", 0)

    assert chunk == "abcd"
    assert transport.call_count == 4


async def test_fetch_chunk_raises_after_max_attempts(monkeypatch):
    monkeypatch.setattr("scripts.e2e_resilience_test.CHUNK_RETRY_BASE_DELAY_S", 0.01)
    monkeypatch.setattr("scripts.e2e_resilience_test.CHUNK_RETRY_MAX_DELAY_S", 0.02)

    async with httpx.AsyncClient(transport=_AlwaysFailTransport()) as client:
        try:
            await fetch_chunk_with_retry(client, "http://test", "r1", 0)
            assert False, "expected RuntimeError"
        except RuntimeError:
            pass
