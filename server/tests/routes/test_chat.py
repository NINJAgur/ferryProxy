import json

from app.llm.base import LLMConfigError, LLMResult
from app.protocol.chunker import reassemble_chunks
from app.protocol.checksum import sha256_hex
from app.protocol.compression import decode_payload
from app.routes import chat as chat_module

from .conftest import build_envelope


class FakeProvider:
    def __init__(self, content: str = "hello from claude", raises: Exception = None):
        self._content = content
        self._raises = raises

    async def generate(self, prompt, history, model, max_tokens):
        if self._raises is not None:
            raise self._raises
        return LLMResult(content=self._content, model="fake-model", stop_reason="end_turn")


def _patch_provider(monkeypatch, provider) -> None:
    monkeypatch.setattr(chat_module, "get_provider", lambda name: provider)


def test_valid_request_returns_single_chunk(client, monkeypatch):
    _patch_provider(monkeypatch, FakeProvider(content="short reply"))

    envelope = build_envelope({"prompt": "hi"})
    response = client.post("/v1/chat", json=envelope)

    assert response.status_code == 200
    body = response.json()
    assert body["n"] == 1

    decompressed = decode_payload(body["a"], body["c"])
    assert sha256_hex(decompressed) == body["k"]
    payload = json.loads(decompressed)
    assert payload["content"] == "short reply"
    assert payload["provider"] == "anthropic"


def test_bad_checksum_returns_400(client, monkeypatch):
    _patch_provider(monkeypatch, FakeProvider())

    envelope = build_envelope({"prompt": "hi"})
    envelope["k"] = "0" * 64
    response = client.post("/v1/chat", json=envelope)

    assert response.status_code == 400
    assert response.json()["error"] == "checksum_mismatch"


def test_undecodable_gzip_payload_returns_400(client, monkeypatch):
    _patch_provider(monkeypatch, FakeProvider())

    # Claims gzip but isn't: this is the branch where decoding itself fails.
    envelope = build_envelope({"prompt": "hi"})
    envelope["a"] = "gzip"
    envelope["p"] = "not-valid-base64-gzip!!"
    response = client.post("/v1/chat", json=envelope)

    assert response.status_code == 400
    assert response.json()["error"] == "invalid_payload"


def test_tampered_plain_payload_returns_400(client, monkeypatch):
    _patch_provider(monkeypatch, FakeProvider())

    # A short prompt travels uncompressed, so a corrupted body still decodes —
    # the checksum is what catches it.
    envelope = build_envelope({"prompt": "hi"})
    assert envelope["a"] == "none"
    envelope["p"] = '{"prompt": "tampered"}'
    response = client.post("/v1/chat", json=envelope)

    assert response.status_code == 400
    assert response.json()["error"] == "checksum_mismatch"


def test_missing_provider_key_returns_503(client, monkeypatch):
    _patch_provider(monkeypatch, FakeProvider(raises=LLMConfigError("ANTHROPIC_API_KEY is not configured")))

    envelope = build_envelope({"prompt": "hi"})
    response = client.post("/v1/chat", json=envelope)

    assert response.status_code == 503
    assert response.json()["error"] == "provider_not_configured"


def test_chunked_response_and_reassembly(client, monkeypatch):
    _patch_provider(monkeypatch, FakeProvider(content="x" * 5000))
    monkeypatch.setattr(chat_module.settings, "chunk_size_bytes", 64)

    envelope = build_envelope({"prompt": "hi"}, request_id="chunked-request")
    response = client.post("/v1/chat", json=envelope)

    assert response.status_code == 200
    body = response.json()
    assert body["n"] > 1

    collected = {0: body["c"]}
    for index in range(1, body["n"]):
        chunk_resp = client.get(f"/v1/chat/{body['r']}/chunks/{index}")
        assert chunk_resp.status_code == 200
        chunk_body = chunk_resp.json()
        assert chunk_body["n"] == body["n"]
        collected[index] = chunk_body["c"]

    reassembled_b64 = reassemble_chunks(collected, body["n"])
    decompressed = decode_payload(body["a"], reassembled_b64)
    assert sha256_hex(decompressed) == body["k"]
    assert json.loads(decompressed)["content"] == "x" * 5000
