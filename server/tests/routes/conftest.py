import json

import pytest
from fastapi.testclient import TestClient

from app import usage
from app.entitlement import entitlement_store
from app.main import app
from app.protocol.checksum import sha256_hex
from app.protocol.compression import encode_payload


@pytest.fixture(autouse=True)
def _isolated_usage_log(tmp_path, monkeypatch):
    """Keep test traffic out of the usage log.

    The log is read to decide what the add-on costs to serve; a few hundred
    fake answers in it would quietly skew that number.
    """
    monkeypatch.setattr(usage, "_PATH", tmp_path / "usage.jsonl")


@pytest.fixture(autouse=True)
def _isolated_entitlements(tmp_path):
    """Tests meter against their own store, not the relay's.

    Sharing it meant a few hundred test answers counted against the real free
    allowance — and once development traffic crossed it, every test that sent a
    message started failing with a 429 that had nothing to do with the test.
    """
    entitlement_store._path = tmp_path / "entitlements.json"
    entitlement_store._entries = {}


@pytest.fixture(autouse=True)
def _isolated_chunk_cache(tmp_path):
    """Cached answers land in the test's own directory, not the relay's."""
    cache = app.state.response_cache
    cache._dir = tmp_path / "chunks"
    cache._dir.mkdir(parents=True, exist_ok=True)
    cache._entries = {}


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def build_envelope(plaintext: dict, request_id: str = "request-1") -> dict:
    raw = json.dumps(plaintext).encode("utf-8")
    algorithm, payload = encode_payload(raw)
    return {"r": request_id, "a": algorithm, "k": sha256_hex(raw), "p": payload}
