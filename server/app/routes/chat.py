import json
import logging

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.config import settings
from app.llm.base import LLMConfigError, LLMProviderError
from app.llm.registry import get_provider
from app.protocol.checksum import sha256_hex
from app.protocol.chunker import split_into_chunks
from app.protocol.compression import decode_payload, encode_payload
from app.protocol.schemas import (
    ChatRequestEnvelope,
    ChatRequestPlaintext,
    ChatResponseEnvelope,
    ChatResponsePlaintext,
    ErrorEnvelope,
)

router = APIRouter()
logger = logging.getLogger(__name__)

BREVITY_INSTRUCTION = (
    "Answer in at most three short sentences. The reply crosses a very slow link, "
    "so be direct and omit preamble, caveats and restatement of the question."
)


def _error(status_code: int, error: str, message: str) -> JSONResponse:
    body = ErrorEnvelope(error=error, message=message).model_dump(by_alias=True)
    return JSONResponse(status_code=status_code, content=body)


@router.post("/v1/chat")
async def chat(envelope: ChatRequestEnvelope, request: Request) -> JSONResponse:
    try:
        decompressed = decode_payload(envelope.algorithm, envelope.payload)
    except Exception:
        return _error(400, "invalid_payload", "payload could not be decoded")

    if sha256_hex(decompressed) != envelope.checksum:
        return _error(400, "checksum_mismatch", "request checksum does not match decompressed payload")

    try:
        plaintext = ChatRequestPlaintext.model_validate(json.loads(decompressed))
    except Exception:
        return _error(400, "invalid_payload", "payload did not match the expected schema")

    provider = get_provider(plaintext.provider)
    max_tokens = plaintext.max_tokens or settings.llm_max_tokens
    # Ask for a short answer rather than cutting one off: models that think before
    # answering spend the cap on reasoning, so a low ceiling truncates mid-sentence.
    prompt = f"{BREVITY_INSTRUCTION}\n\n{plaintext.prompt}" if plaintext.brief else plaintext.prompt

    try:
        result = await provider.generate(
            prompt=prompt,
            history=plaintext.history,
            model=plaintext.model,
            max_tokens=max_tokens,
        )
    except LLMConfigError as exc:
        return _error(503, "provider_not_configured", str(exc))
    except LLMProviderError as exc:
        logger.exception("provider call failed")
        return _error(502, "provider_error", str(exc))

    response_plaintext = ChatResponsePlaintext(
        content=result.content,
        provider=plaintext.provider,
        model=result.model,
        stop_reason=result.stop_reason,
    )
    response_bytes = response_plaintext.model_dump_json(by_alias=True).encode("utf-8")
    response_checksum = sha256_hex(response_bytes)
    algorithm, encoded = encode_payload(response_bytes)

    chunks = split_into_chunks(encoded, settings.chunk_size_bytes)
    total_chunks = len(chunks)

    if total_chunks > 1:
        request.app.state.response_cache.put(
            request_id=envelope.request_id,
            chunks=chunks,
            checksum=response_checksum,
        )

    response_envelope = ChatResponseEnvelope(
        request_id=envelope.request_id,
        algorithm=algorithm,
        checksum=response_checksum,
        total_chunks=total_chunks,
        chunk=chunks[0],
        ttl_seconds=settings.cache_ttl_seconds,
    )
    return JSONResponse(status_code=200, content=response_envelope.model_dump(by_alias=True))
