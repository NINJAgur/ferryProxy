import json
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from app.config import settings
from app.pricing import cost_usd

logger = logging.getLogger(__name__)

# One line per answer, appended. A log rather than a counter because the question
# it has to answer — "what does a heavy month actually cost" — needs the shape of
# the distribution, not just a total: a handful of long conversations can cost
# more than a thousand short ones.
_PATH = Path(settings.usage_log_path)
if not _PATH.is_absolute():
    _PATH = Path(__file__).resolve().parent.parent / _PATH
_LOCK = threading.Lock()


def record(
    model: str,
    tier: str,
    input_tokens: Optional[int],
    output_tokens: Optional[int],
    brief: bool,
    paid: bool,
) -> None:
    """Note what one answer cost. Never raises: a failure to measure must not
    fail the answer someone is waiting for."""
    entry = {
        "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "model": model,
        "tier": tier,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "cost_usd": cost_usd(model, input_tokens, output_tokens),
        "brief": brief,
        # Whether a purchase paid for this, as opposed to the free tier. The two
        # have very different economics and averaging them together hides both.
        "paid": paid,
    }
    try:
        with _LOCK:
            _PATH.parent.mkdir(parents=True, exist_ok=True)
            with _PATH.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(entry) + "\n")
    except OSError:
        logger.exception("could not append to the usage log")
