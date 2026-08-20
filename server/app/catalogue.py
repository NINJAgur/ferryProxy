from typing import List, Optional

from app.config import settings
from app.protocol.schemas import ModelInfo, Provider, Tier

# The models Ferry offers, grouped by provider.
#
# Keys are never per-user. Four service-account keys are configured on the relay —
# one Gemini key for the free tier, one for the paid Gemini models, plus OpenAI and
# Anthropic — and the relay picks whichever the chosen model needs. Nothing about a
# credential ever reaches the device.
#
# A provider offers several variants because they differ enormously in what they
# cost per answer: a cheap one is the right default and an expensive one should be
# a deliberate choice, not something the app picks on someone's behalf.


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
        # Gemini. The free variant is the only free model Ferry has, and it is the
        # one served by the unbilled-tier key — see _key_for.
        CatalogueEntry(settings.gemini_free_model, "Flash", "gemini", "free", "Fast, and free for everyone"),
        CatalogueEntry("gemini-flash-latest", "Flash (latest)", "gemini", "paid", "Newer Flash, billed"),
        CatalogueEntry(settings.gemini_paid_model, "Pro", "gemini", "paid", "Google's stronger model"),
        # Claude, cheapest first.
        CatalogueEntry("claude-haiku-4-5-20251001", "Haiku 4.5", "anthropic", "paid", "Quick and inexpensive"),
        CatalogueEntry("claude-sonnet-5", "Sonnet 5", "anthropic", "paid", "The balanced one"),
        CatalogueEntry(settings.anthropic_model, "Opus 5", "anthropic", "paid", "Anthropic's strongest"),
        # GPT, cheapest first.
        CatalogueEntry("gpt-5.4-mini", "5.4 mini", "openai", "paid", "Quick and inexpensive"),
        CatalogueEntry(settings.openai_model, "4o", "openai", "paid", "Solid all-rounder"),
        CatalogueEntry("gpt-5.5", "5.5", "openai", "paid", "OpenAI's strongest"),
    ]


def _key_for(entry: CatalogueEntry) -> Optional[str]:
    """The service-account key this model is served with."""
    if entry.provider == "gemini":
        return settings.gemini_free_api_key if entry.tier == "free" else settings.gemini_paid_api_key
    if entry.provider == "openai":
        return settings.openai_api_key
    return settings.anthropic_api_key


def catalogue(subscribed: bool) -> List[ModelInfo]:
    """What the caller may use. Anonymous and unsubscribed callers see the same
    thing: the free model is genuinely free, with no account needed."""
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
