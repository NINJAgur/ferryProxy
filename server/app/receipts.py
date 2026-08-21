import logging
from typing import Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# The entitlement configured in RevenueCat that the add-on grants.
REVENUECAT_ENTITLEMENT = "pro"
_REVENUECAT_URL = "https://api.revenuecat.com/v1/subscribers/{app_user_id}"

# Dev-only token shape, so the locked and unlocked states can be exercised before
# a store product exists. Refused whenever dev subscriptions are turned off.
DEV_PREFIX = "dev:"


class ReceiptInvalid(Exception):
    """The token did not check out. The caller falls back to the free tier."""


def _is_sandbox(subscriber: dict, entitlement: dict) -> bool:
    """Whether the purchase behind an entitlement was made in a store's sandbox.

    A sandbox purchase is indistinguishable from a real one at the entitlement
    level — same name, same shape — so the backing purchase has to be found and
    asked. Anything unrecognised is treated as sandbox: refusing a real purchase
    is a support ticket, honouring a fake one gives away models that cost money.
    """
    product = entitlement.get("product_identifier")
    for bucket in ("non_subscriptions", "subscriptions"):
        entries = subscriber.get(bucket, {}).get(product)
        if entries is None:
            continue
        # Non-subscriptions are a list of purchases; subscriptions are one object.
        latest = entries[-1] if isinstance(entries, list) else entries
        if isinstance(latest, dict) and "is_sandbox" in latest:
            return bool(latest["is_sandbox"])
    logger.warning("could not tell whether %s was a sandbox purchase; assuming it was", product)
    return True


async def verify_receipt(token: str) -> Optional[str]:
    """Return a stable purchase id for a verified receipt, or None.

    None means "no paid entitlement", never an error: a caller without a valid
    receipt is simply on the free tier, which needs no purchase at all.
    """
    if not token:
        return None

    if token.startswith(DEV_PREFIX):
        if not settings.allow_dev_subscription:
            logger.info("rejected a dev receipt: dev subscriptions are off")
            return None
        return token

    if not settings.revenuecat_api_key:
        # Refusing is the safe direction: treating an unverifiable token as paid
        # would hand out the paid models to anyone who sent a made-up string.
        logger.warning("a receipt arrived but REVENUECAT_API_KEY is not set; treating as free tier")
        return None

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(
                _REVENUECAT_URL.format(app_user_id=token),
                headers={"Authorization": f"Bearer {settings.revenuecat_api_key}"},
            )
        if response.status_code != 200:
            logger.info("RevenueCat rejected the receipt: %s", response.status_code)
            return None
        subscriber = response.json().get("subscriber", {})
        entitlement = subscriber.get("entitlements", {}).get(REVENUECAT_ENTITLEMENT)
        if entitlement is None:
            return None
        if _is_sandbox(subscriber, entitlement) and not settings.allow_sandbox_purchases:
            logger.warning("refused a sandbox purchase: this relay only honours real ones")
            return None
        return token
    except httpx.HTTPError:
        # A store we cannot reach must not silently unlock paid models, nor should
        # it break the free tier — so the caller carries on without the add-on.
        logger.exception("could not reach RevenueCat; treating as free tier")
        return None
