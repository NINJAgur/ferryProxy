import json

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.protocol.checksum import sha256_hex
from app.protocol.compression import encode_payload


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def build_envelope(plaintext: dict, request_id: str = "request-1") -> dict:
    raw = json.dumps(plaintext).encode("utf-8")
    algorithm, payload = encode_payload(raw)
    return {"r": request_id, "a": algorithm, "k": sha256_hex(raw), "p": payload}
