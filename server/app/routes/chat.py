import json
import logging

from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse

from app.catalogue import default_model, find, is_allowed, resolve_key
from app.config import settings
from app.entitlement import entitlement_store
from app.routes.entitlement import (
    DEVICE_HEADER,
    RECEIPT_HEADER,
    has_allowance,
    has_free_allowance,
    record_free_answer,
    resolve_entitlement,
)
from app.llm.base import LLMConfigError, LLMProviderError
from app.llm.registry import get_provider
from app.protocol.checksum import sha256_hex
from app.protocol.chunker import split_into_chunks
from app.protocol.compression import decode_payload, encode_payload
from app.usage import record as record_usage
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
async def chat(
    envelope: ChatRequestEnvelope,
    request: Request,
    receipt: str = Header(default="", alias=RECEIPT_HEADER),
    device_id: str = Header(default="", alias=DEVICE_HEADER),
) -> JSONResponse:
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

    # No receipt is the free tier, not an error. A purchase that has spent the
    # month's allowance is treated the same way for access purposes: it still
    # owns the add-on, but a paid answer would exceed what it paid for.
    entry = await resolve_entitlement(receipt)
    within_allowance = has_allowance(entry)
    subscribed = entry is not None and within_allowance

    model_id = plaintext.model or default_model()
    model_entry = find(model_id)
    if model_entry is None:
        return _error(400, "unknown_model", f"{model_id} is not a model Ferry offers")

    # "The relay can't serve this" is checked before "this isn't yours". Both leave
    # the model locked, but only one of them is the caller's problem, and telling a
    # subscriber to subscribe because a key is missing would be a lie.
    api_key = resolve_key(model_entry)
    if not api_key:
        return _error(503, "provider_not_configured", f"{model_entry.label} is not configured on the relay")

    # A free answer is cheap, not free. Meter it per device, falling back to the
    # caller's address when no device id was sent, so the meter cannot be skipped
    # by simply omitting the header.
    metered_as = device_id or (request.client.host if request.client else "unknown")
    free_answer = model_entry.tier == "free"
    if free_answer and entry is None and not has_free_allowance(metered_as):
        return _error(
            429,
            "free_allowance_spent",
            "This device has used its free answers for the month",
        )

    if not is_allowed(model_id, subscribed):
        if entry is not None and not within_allowance:
            return _error(
                429,
                "allowance_spent",
                f"{model_entry.label} is included, but the answers bought with it are used up",
            )
        return _error(403, "model_locked", f"{model_entry.label} needs the add-on")

    provider = get_provider(model_entry.provider)
    max_tokens = plaintext.max_tokens or settings.llm_max_tokens
    # Ask for a short answer rather than cutting one off: models that think before
    # answering spend the cap on reasoning, so a low ceiling truncates mid-sentence.
    prompt = f"{BREVITY_INSTRUCTION}\n\n{plaintext.prompt}" if plaintext.brief else plaintext.prompt

    try:
        result = await provider.generate(
            prompt=prompt,
            history=plaintext.history,
            model=model_entry.model_id,
            max_tokens=max_tokens,
            api_key=api_key,
        )
    except LLMConfigError as exc:
        return _error(503, "provider_not_configured", str(exc))
    except LLMProviderError as exc:
        logger.exception("provider call failed")
        return _error(502, "provider_error", str(exc))

    record_usage(
        model=model_entry.model_id,
        tier=model_entry.tier,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
        brief=bool(plaintext.brief),
        paid=model_entry.tier == "paid",
    )

    # Counted only after an answer exists: a failed call should not spend the
    # allowance the caller paid for.
    if entry is not None and model_entry.tier == "paid":
        entitlement_store.record_answer(entry.receipt_id)
    elif free_answer and entry is None:
        record_free_answer(metered_as)

    response_plaintext = ChatResponsePlaintext(
        content=result.content,
        provider=model_entry.provider,
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
