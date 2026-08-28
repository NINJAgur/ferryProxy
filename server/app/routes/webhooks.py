import hashlib
import hmac
import json
import logging
from typing import Optional

from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse

from app.config import settings
from app.web_purchases import web_purchases

router = APIRouter()
logger = logging.getLogger(__name__)

# The header the checkout signs each request with: HMAC-SHA256 of the raw body,
# hex encoded, under the secret shared with the dashboard.
SIGNATURE_HEADER = "X-Signature"

PAID = "paid"
BOUGHT = "order_created"
REFUNDED = "order_refunded"


def _ok(handled: str) -> JSONResponse:
    # Always 200 once the signature checks out, including for events we ignore.
    # A non-200 makes the provider retry, and it will retry an event we were
    # never going to act on for as long as it is willing to.
    return JSONResponse(status_code=200, content={"handled": handled})


def _signed(body: bytes, signature: str) -> bool:
    secret = settings.lemonsqueezy_webhook_secret or ""
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature)


def _customer_id(payload: dict) -> Optional[str]:
    """Which install opened the checkout.

    Passed in as custom data and handed back here. It is the only thing tying a
    payment to a device — the buyer's email belongs to a person, not an install,
    and the relay has no accounts to look one up in.
    """
    custom = (payload.get("meta") or {}).get("custom_data") or {}
    customer_id = custom.get("customer_id")
    return str(customer_id) if customer_id else None


@router.post("/v1/webhooks/lemonsqueezy")
async def lemonsqueezy(request: Request, signature: str = Header(default="", alias=SIGNATURE_HEADER)) -> JSONResponse:
    """A web checkout reporting a purchase, or taking one back.

    The store announces this once. There is no second source to reconcile
    against and nothing to poll, so what arrives here is the whole record — which
    is exactly why it is not believed without a signature.
    """
    if not settings.lemonsqueezy_webhook_secret:
        # Recording an unverifiable purchase would give the paid models to anyone
        # who found the URL. Refusing costs a retry; trusting costs the models.
        logger.error("a purchase webhook arrived but no signing secret is set")
        return JSONResponse(status_code=503, content={"error": "webhooks_not_configured"})

    body = await request.body()
    if not _signed(body, signature):
        logger.warning("a purchase webhook failed its signature check")
        return JSONResponse(status_code=401, content={"error": "bad_signature"})

    try:
        payload = json.loads(body)
    except ValueError:
        logger.exception("a signed purchase webhook had an unreadable body")
        return JSONResponse(status_code=400, content={"error": "bad_payload"})

    event = (payload.get("meta") or {}).get("event_name")
    data = payload.get("data") or {}
    attributes = data.get("attributes") or {}
    order_id = data.get("id")
    if not order_id:
        logger.warning("a purchase webhook arrived with no order id")
        return _ok("ignored")

    if event == REFUNDED:
        # Mirrors what the store does for Play, where a refunded purchase is
        # removed from the record rather than marked: the pool goes with it.
        web_purchases.forget(str(order_id))
        logger.info("a web purchase was refunded and its answers withdrawn")
        return _ok(REFUNDED)

    if event != BOUGHT:
        return _ok("ignored")

    if attributes.get("status") != PAID:
        # Pending and failed orders arrive here too, and a pool handed out for
        # either is one that was never paid for.
        return _ok("ignored")

    if attributes.get("test_mode") and not settings.allow_sandbox_purchases:
        # A test order takes a test card and reports the same product. Honouring
        # one in production gives away models that cost real money per answer.
        logger.info("refused a test-mode purchase on a production relay")
        return _ok("ignored")

    customer_id = _customer_id(payload)
    if customer_id is None:
        # Nothing to attach it to. Better a support ticket about one purchase
        # than a pool granted to whichever install asks next.
        logger.error("a paid web purchase arrived with no customer id; it cannot be granted")
        return _ok("ignored")

    web_purchases.record(customer_id, str(order_id))
    logger.info("recorded a web purchase")
    return _ok(BOUGHT)
