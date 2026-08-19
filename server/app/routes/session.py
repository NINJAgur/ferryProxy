import logging
from typing import Optional

from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse

from app.accounts import Account, account_store
from app.auth import AuthNotConfigured, InvalidCredential, verify_google_id_token
from app.catalogue import catalogue
from app.config import settings
from app.protocol.schemas import ErrorEnvelope, SessionResponse

router = APIRouter()
logger = logging.getLogger(__name__)


def _error(status_code: int, error: str, message: str) -> JSONResponse:
    body = ErrorEnvelope(error=error, message=message).model_dump(by_alias=True)
    return JSONResponse(status_code=status_code, content=body)


def account_from_header(authorization: str) -> Account:
    """Resolve the caller's account from a `Bearer <google id token>` header."""
    token = authorization.split(" ", 1)[1] if " " in authorization else authorization
    subject, email = verify_google_id_token(token)
    return account_store.upsert(subject, email)


def optional_account(authorization: str) -> Optional[Account]:
    """The caller's account, or None for an anonymous one.

    Anonymous is a first-class state, not a failure: the free model is available
    without an account, so a missing token must not be treated as an error.
    """
    if not authorization:
        return None
    return account_from_header(authorization)


def _session_body(account: Optional[Account]) -> dict:
    subscribed = bool(account and account.entitled)
    return SessionResponse(
        email=account.email if account else "",
        signed_in=account is not None,
        subscribed=subscribed,
        models=catalogue(subscribed),
    ).model_dump(by_alias=True)


@router.post("/v1/session")
async def create_session(authorization: str = Header(default="")) -> JSONResponse:
    """What this caller may use — with or without an account.

    No API key is ever returned. The relay holds the service-account keys and uses
    them on the caller's behalf, so a key never reaches the device at all.
    """
    try:
        account = optional_account(authorization)
    except AuthNotConfigured as exc:
        return _error(503, "auth_not_configured", str(exc))
    except InvalidCredential as exc:
        return _error(401, "invalid_credential", str(exc))

    return JSONResponse(status_code=200, content=_session_body(account))


@router.post("/v1/subscription")
async def set_subscription(request: Request, authorization: str = Header(default="")) -> JSONResponse:
    """Subscribe or unsubscribe.

    Stands in for a payment provider: a real deployment flips this from a verified
    Stripe/RevenueCat event, never from the client, which is why it refuses outright
    once dev subscriptions are turned off.
    """
    if not settings.allow_dev_subscription:
        return _error(403, "billing_required", "subscriptions are managed by the payment provider")
    if not authorization:
        return _error(401, "not_signed_in", "an account is needed to subscribe")

    try:
        account = account_from_header(authorization)
    except AuthNotConfigured as exc:
        return _error(503, "auth_not_configured", str(exc))
    except InvalidCredential as exc:
        return _error(401, "invalid_credential", str(exc))

    body = await request.json() if await request.body() else {}
    wanted = bool(body.get("subscribed", True))
    updated = account_store.set_entitled(account.subject, wanted)
    logger.info("subscription for %s -> %s", account.email, wanted)
    return JSONResponse(status_code=200, content=_session_body(updated or account))
