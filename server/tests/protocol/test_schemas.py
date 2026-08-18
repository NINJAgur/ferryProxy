import pytest
from pydantic import ValidationError

from app.protocol.schemas import ChatRequestEnvelope, ChatRequestPlaintext


def test_request_plaintext_accepts_camel_case_json() -> None:
    parsed = ChatRequestPlaintext.model_validate(
        {"prompt": "hi", "provider": "openai", "maxTokens": 100}
    )
    assert parsed.prompt == "hi"
    assert parsed.provider == "openai"
    assert parsed.max_tokens == 100


def test_request_plaintext_defaults() -> None:
    parsed = ChatRequestPlaintext.model_validate({"prompt": "hi"})
    assert parsed.provider == "anthropic"
    assert parsed.model is None
    assert parsed.history == []


def test_request_plaintext_rejects_unknown_provider() -> None:
    with pytest.raises(ValidationError):
        ChatRequestPlaintext.model_validate({"prompt": "hi", "provider": "bard"})


def test_request_envelope_serializes_terse_names() -> None:
    envelope = ChatRequestEnvelope(request_id="r1", checksum="deadbeef", payload="cGF5bG9hZA==")
    dumped = envelope.model_dump(by_alias=True)
    # Single-letter names on the wire: these repeat on every message.
    assert dumped == {"r": "r1", "a": "gzip", "k": "deadbeef", "p": "cGF5bG9hZA=="}


def test_request_envelope_parses_wire_names() -> None:
    parsed = ChatRequestEnvelope.model_validate({"r": "r1", "a": "none", "k": "abcd", "p": "hi"})
    assert parsed.request_id == "r1"
    assert parsed.algorithm == "none"
