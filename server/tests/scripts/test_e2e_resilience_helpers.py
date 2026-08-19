import httpx

from scripts.e2e_resilience_test import TUNING, fetch_chunk


class _FlakyTransport(httpx.AsyncBaseTransport):
    def __init__(self, fail_times: int):
        self._remaining_failures = fail_times
        self.call_count = 0

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        self.call_count += 1
        if self._remaining_failures > 0:
            self._remaining_failures -= 1
            raise httpx.ConnectError("simulated connection drop", request=request)
        return httpx.Response(200, json={"i": 0, "n": 1, "c": "abcd"})


class _AlwaysFailTransport(httpx.AsyncBaseTransport):
    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("simulated connection drop", request=request)


def _fast_retries(monkeypatch):
    monkeypatch.setattr("scripts.e2e_resilience_test.CHUNK_RETRY_BASE_DELAY_S", 0.01)
    monkeypatch.setitem(TUNING, "cap", 0.02)
    monkeypatch.setitem(TUNING, "attempts", 5)


async def test_fetch_chunk_recovers_after_transient_failures(monkeypatch):
    _fast_retries(monkeypatch)
    transport = _FlakyTransport(fail_times=3)
    counter = [0]

    async with httpx.AsyncClient(transport=transport) as client:
        chunk = await fetch_chunk(client, "http://test", "r1", 0, counter)

    assert chunk == "abcd"
    assert transport.call_count == 4
    # The counter is what the proof reports as "requests spent", so it must count
    # the failures too — that number is the whole point of measuring under loss.
    assert counter[0] == 4


async def test_fetch_chunk_raises_after_max_attempts(monkeypatch):
    _fast_retries(monkeypatch)

    async with httpx.AsyncClient(transport=_AlwaysFailTransport()) as client:
        try:
            await fetch_chunk(client, "http://test", "r1", 0, [0])
            assert False, "expected RuntimeError"
        except RuntimeError:
            pass
