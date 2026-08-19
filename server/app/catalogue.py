from typing import List, Optional

from app.config import settings
from app.protocol.schemas import ModelInfo, Provider, Tier

# The models Ferry offers, and what it takes to reach each one.
#
# Keys are never per-user. Four service-account keys are configured on the relay —
# one Gemini key for the free tier, one for the paid Gemini models, plus OpenAI and
# Anthropic — and the relay picks whichever the chosen model needs. Nothing about a
# credential ever reaches the device.


class CatalogueEntry:
    def __init__(
        self,
        model_id: str,
        label: str,
        provider: Provider,
        tier: Tier,
        blurb: str,
    ) -> None:
        self.model_id = model_id
        self.label = label
        self.provider = provider
        self.tier = tier
        self.blurb = blurb


def _entries() -> List[CatalogueEntry]:
    return [
        CatalogueEntry(
            settings.gemini_free_model,
            "Gemini Flash",
            "gemini",
            "free",
            "Fast and free, for everyone",
        ),
        CatalogueEntry(
            settings.gemini_paid_model,
            "Gemini Pro",
            "gemini",
            "paid",
            "Google's stronger model",
        ),
        CatalogueEntry(settings.openai_model, "GPT", "openai", "paid", "OpenAI's flagship"),
        CatalogueEntry(settings.anthropic_model, "Claude", "anthropic", "paid", "Anthropic's flagship"),
    ]


def _key_for(entry: CatalogueEntry) -> Optional[str]:
    """The service-account key this model is served with."""
    if entry.provider == "gemini":
        return settings.gemini_free_api_key if entry.tier == "free" else settings.gemini_paid_api_key
    if entry.provider == "openai":
        return settings.openai_api_key
    return settings.anthropic_api_key


def catalogue(subscribed: bool) -> List[ModelInfo]:
    """What the caller may use. Anonymous and signed-out-but-unsubscribed callers
    see the same thing: the free model is genuinely free, with no account needed."""
    out: List[ModelInfo] = []
    for entry in _entries():
        configured = bool(_key_for(entry))
        if not configured:
            unlocked, reason = False, "unavailable"
        elif entry.tier == "free":
            unlocked, reason = True, "free"
        elif subscribed:
            unlocked, reason = True, "subscribed"
        else:
            unlocked, reason = False, "needs_subscription"

        out.append(
            ModelInfo(
                id=entry.model_id,
                label=entry.label,
                provider=entry.provider,
                tier=entry.tier,
                blurb=entry.blurb,
                unlocked=unlocked,
                reason=reason,
            )
        )
    return out


def find(model_id: str) -> Optional[CatalogueEntry]:
    return next((e for e in _entries() if e.model_id == model_id), None)


def resolve_key(entry: CatalogueEntry) -> Optional[str]:
    return _key_for(entry)


def is_allowed(model_id: str, subscribed: bool) -> bool:
    return any(m.id == model_id and m.unlocked for m in catalogue(subscribed))


def default_model() -> str:
    """The free model — what an anonymous user gets without choosing anything."""
    return settings.gemini_free_model
