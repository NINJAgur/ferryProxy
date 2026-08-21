import json
import logging
from pathlib import Path
from typing import Dict, Optional, Tuple

logger = logging.getLogger(__name__)

# What each model costs, in US dollars per million tokens, as (input, output).
#
# This exists so the price of the add-on can be set from what answers actually
# cost rather than from a guess. Two things make that guess unreliable without
# measurement: every message re-sends the conversation so far, so a long chat's
# tenth question costs several times its first; and models that think before
# answering bill that hidden reasoning as output.
#
# Rates change. `server/model_prices.json` overrides anything here without a
# code change, and unknown models simply record tokens with no cost attached —
# a missing number is better than a wrong one.
_DEFAULT_RATES: Dict[str, Tuple[float, float]] = {
    # Anthropic, from the Claude API pricing table.
    "claude-opus-5": (5.00, 25.00),
    # Sonnet 5 carries introductory pricing ($2/$10) until 2026-08-31, after
    # which it returns to these rates.
    "claude-sonnet-5": (3.00, 15.00),
    "claude-haiku-4-5-20251001": (1.00, 5.00),
}

_OVERRIDES_PATH = Path(__file__).resolve().parent.parent / "model_prices.json"


def _load_overrides() -> Dict[str, Tuple[float, float]]:
    if not _OVERRIDES_PATH.exists():
        return {}
    try:
        raw = json.loads(_OVERRIDES_PATH.read_text(encoding="utf-8"))
        return {k: (float(v["input"]), float(v["output"])) for k, v in raw.items()}
    except (OSError, ValueError, KeyError, TypeError):
        logger.exception("model_prices.json is unreadable; using built-in rates")
        return {}


_RATES = {**_DEFAULT_RATES, **_load_overrides()}


def rate_for(model: str) -> Optional[Tuple[float, float]]:
    return _RATES.get(model)


def cost_usd(model: str, input_tokens: Optional[int], output_tokens: Optional[int]) -> Optional[float]:
    """What one answer cost, or None if it cannot be known.

    None is returned rather than zero whenever the rate or the token counts are
    missing: a zero would quietly drag an average down and make the add-on look
    cheaper to serve than it is.
    """
    rate = rate_for(model)
    if rate is None or input_tokens is None or output_tokens is None:
        return None
    per_input, per_output = rate
    return (input_tokens * per_input + output_tokens * per_output) / 1_000_000


def unpriced_models() -> list:
    """Models the relay serves but has no rate for. Surfaced by the report so a
    missing rate is noticed rather than silently excluded from the totals."""
    return sorted(_RATES)
