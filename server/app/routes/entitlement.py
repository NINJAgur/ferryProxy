import logging
from typing import Optional

from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse

from app.catalogue import catalogue
from app.config import settings
from app.entitlement import Entitlement, entitlement_store
from app.protocol.schemas import EntitlementResponse, ErrorEnvelope
from app.receipts import CODE_PREFIX, customer_for, verify_receipt
from app.restore_codes import restore_codes

router = APIRouter()
logger = logging.getLogger(__name__)

# The store receipt travels in its own header. It is not an identity: it says a
# purchase exists, nothing about who made it.
RECEIPT_HEADER = "X-Store-Receipt"


def _error(status_code: int, error: str, message: str) -> JSONResponse:
    body = ErrorEnvelope(error=error, message=message).model_dump(by_alias=True)
    return JSONResponse(status_code=status_code, content=body)


async def resolve_entitlement(receipt: str) -> Optional[Entitlement]:
    """The purchase behind this receipt, if it verifies and is still unlocked.

    The row is keyed by the store's transaction id, not by the receipt the caller
    sent, so reinstalling finds the pool it already spent from instead of a fresh
    one.
    """
    purchase = await verify_receipt(receipt)
    if purchase is None:
        return None

    entry = entitlement_store.get(purchase.id)
    if entry is None and not purchase.dev:
        # A real purchase the relay has not seen before. Without this it would
        # verify against the store and then find nothing to spend.
        entry = entitlement_store.grant(purchase.id, purchases=purchase.count)
    elif entry and entry.unlocked and entry.purchases != purchase.count:
        # Bought again: another pool, with what is already spent left in place.
        entry = entitlement_store.grant(purchase.id, purchases=purchase.count)
    return entry if entry and entry.unlocked else None


def allowance(entry: Optional[Entitlement]) -> int:
    """How many answers this row has bought in total."""
    purchases = max(entry.purchases, 1) if entry else 1
    return settings.purchase_answer_allowance * purchases


def has_allowance(entry: Optional[Entitlement]) -> bool:
    """Whether the purchase has answers left in its pool."""
    if entry is None:
        return False
    return entry.answers_used < allowance(entry)


# A free install is metered too. The device id is not an identity and a reinstall
# resets it — this is a ceiling on ordinary use, not a defence against someone
# determined. The provider's own quota cap is what stops a real bill.
DEVICE_HEADER = "X-Device-Id"
_FREE_PREFIX = "free:"


def free_key(device_id: str) -> str:
    return f"{_FREE_PREFIX}{device_id}"


def free_answers_used(device_id: str) -> int:
    entry = entitlement_store.get(free_key(device_id), resets_monthly=True)
    return entry.answers_used if entry else 0


def has_free_allowance(device_id: str) -> bool:
    return free_answers_used(device_id) < settings.free_answer_allowance


def record_free_answer(device_id: str) -> None:
    key = free_key(device_id)
    if entitlement_store.get(key, resets_monthly=True) is None:
        # Never unlocked: this row counts what a free device used, and must not
        # become something that grants access.
        entitlement_store.grant(key, unlocked=False)
    entitlement_store.record_answer(key, resets_monthly=True)


def entitlement_body(entry: Optional[Entitlement]) -> dict:
    """What the caller may use, and how much of the allowance is left.

    Unlocked is deliberately not the same as "has allowance": someone who has
    spent their pool still owns the add-on, so the models are shown as theirs
    while the free one carries on.
    """
    unlocked = entry is not None
    within = has_allowance(entry)
    used = entry.answers_used if entry else 0
    return EntitlementResponse(
        unlocked=unlocked,
        answers_used=used,
        answers_allowed=allowance(entry),
        capped=unlocked and not within,
        models=catalogue(subscribed=unlocked and within),
    ).model_dump(by_alias=True)


@router.post("/v1/entitlement")
async def read_entitlement(receipt: str = Header(default="", alias=RECEIPT_HEADER)) -> JSONResponse:
    """What this device may use. No receipt is fine — that is the free tier."""
    entry = await resolve_entitlement(receipt)
    return JSONResponse(status_code=200, content=entitlement_body(entry))


@router.post("/v1/customer")
async def read_customer(receipt: str = Header(default="", alias=RECEIPT_HEADER)) -> JSONResponse:
    """Who a new purchase should be recorded against.

    A device that restored with a code would otherwise buy as itself, opening a
    second customer with its own pool that the relay never adds to the first —
    money paid for answers nobody receives.
    """
    return JSONResponse(status_code=200, content={"customerId": customer_for(receipt)})


@router.post("/v1/restore-code")
async def read_restore_code(receipt: str = Header(default="", alias=RECEIPT_HEADER)) -> JSONResponse:
    """A code the buyer can carry to another device.

    Play does not need this — it can be asked what an account bought. A browser
    checkout cannot, so without a code a web purchase is stranded on the install
    that made it.
    """
    if receipt.startswith(CODE_PREFIX):
        # Already holding one. Handing back a second code for the same purchase
        # would leave them unsure which of the two still works.
        return JSONResponse(status_code=200, content={"code": receipt[len(CODE_PREFIX):]})

    entry = await resolve_entitlement(receipt)
    if entry is None:
        return _error(403, "no_purchase", "there is no purchase to make a code for")
    return JSONResponse(status_code=200, content={"code": restore_codes.for_customer(customer_for(receipt))})


@router.post("/v1/dev/entitlement")
async def grant_dev_entitlement(request: Request) -> JSONResponse:
    """Grant or revoke the add-on without a store, for development only.

    In production the store is the only source of truth and this is refused;
    entitlement then comes from a verified purchase, never from the client.
    """
    if not settings.allow_dev_subscription:
        return _error(403, "billing_required", "entitlement comes from the store")

    body = await request.json() if await request.body() else {}
    receipt_id = body.get("receipt")
    if not receipt_id:
        return _error(400, "missing_receipt", "a dev receipt id is required")

    entry = entitlement_store.grant(receipt_id, bool(body.get("unlocked", True)))
    logger.info("dev entitlement %s -> unlocked=%s", receipt_id, entry.unlocked)
    return JSONResponse(status_code=200, content=entitlement_body(entry if entry.unlocked else None))
