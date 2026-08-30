import json
import logging
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)

# What someone flagged, one line per report, appended.
#
# Play requires an app that generates content with AI to let people report what
# it produced without leaving the app, and requires that those reports inform
# what the app does next. A file rather than a counter because the second half
# of that is the point: a count says how often people are unhappy, the text says
# what the model actually said and whether the prompt behind it needs changing.
_PATH = Path(settings.report_log_path)
if not _PATH.is_absolute():
    _PATH = Path(__file__).resolve().parent.parent / _PATH
_LOCK = threading.Lock()

# What someone can say is wrong with an answer. Deliberately short: a list long
# enough to be read is one people actually pick from, and every entry maps to
# something that can be acted on.
REASONS = {
    "offensive": "Offensive or hateful",
    "harmful": "Dangerous or harmful",
    "sexual": "Sexually explicit",
    "false": "Wrong or misleading",
    "other": "Something else",
}

# Enough of the answer to see what happened, not so much that a report log
# becomes a copy of everyone's conversations.
MAX_STORED_CHARS = 2000


def record(reason: str, model: Optional[str], answer: str, note: Optional[str]) -> None:
    """Write down a flagged answer. Never raises: failing to file a complaint
    must not turn into an error in front of the person making it."""
    entry = {
        "at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "reason": reason,
        "model": model,
        "answer": answer[:MAX_STORED_CHARS],
        "truncated": len(answer) > MAX_STORED_CHARS,
        "note": (note or "")[:500] or None,
    }
    try:
        _PATH.parent.mkdir(parents=True, exist_ok=True)
        with _LOCK, _PATH.open("a", encoding="utf-8") as handle:
            handle.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except OSError:
        logger.exception("could not write a content report")
