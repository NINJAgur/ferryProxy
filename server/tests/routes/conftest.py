import json

import pytest
from fastapi.testclient import TestClient

from app import usage
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


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def build_envelope(plaintext: dict, request_id: str = "request-1") -> dict:
    raw = json.dumps(plaintext).encode("utf-8")
    algorithm, payload = encode_payload(raw)
    return {"r": request_id, "a": algorithm, "k": sha256_hex(raw), "p": payload}
