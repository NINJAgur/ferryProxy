import json
import logging
import threading
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Optional

from app.config import settings

logger = logging.getLogger(__name__)

# Keyed by the store's purchase id, which is what the app has instead of an
# account: there is no user table here, only "this receipt bought the add-on" and
# "this is what it has used this month".
_STORE_PATH = Path(settings.entitlement_store_path)
if not _STORE_PATH.is_absolute():
    _STORE_PATH = Path(__file__).resolve().parent.parent / _STORE_PATH
_LOCK = threading.Lock()


def current_period() -> str:
    """The month a usage allowance belongs to, as YYYY-MM in UTC."""
    return datetime.now(timezone.utc).strftime("%Y-%m")


@dataclass
class Entitlement:
    """One purchase, and what it has spent this month."""

    receipt_id: str
    unlocked: bool = False
    period: str = field(default_factory=current_period)
    answers_used: int = 0

    def rolled_over(self) -> bool:
        return self.period != current_period()


class EntitlementStore:
    def __init__(self, path: Path = _STORE_PATH) -> None:
        self._path = path
        self._entries: Dict[str, Entitlement] = {}
        self._load()

    def _load(self) -> None:
        if not self._path.exists():
            return
        try:
            raw = json.loads(self._path.read_text(encoding="utf-8"))
            self._entries = {k: Entitlement(**v) for k, v in raw.items()}
        except (OSError, ValueError, TypeError):
            logger.exception("entitlement store unreadable; starting empty")
            self._entries = {}

    def _save(self) -> None:
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            self._path.write_text(
                json.dumps({k: asdict(v) for k, v in self._entries.items()}, indent=2),
                encoding="utf-8",
            )
        except OSError:
            logger.exception("could not write the entitlement store")

    def _fresh(self, entry: Entitlement) -> Entitlement:
        """Reset the counter when the month has turned over."""
        if entry.rolled_over():
            entry.period = current_period()
            entry.answers_used = 0
        return entry

    def get(self, receipt_id: str) -> Optional[Entitlement]:
        with _LOCK:
            entry = self._entries.get(receipt_id)
            return self._fresh(entry) if entry else None

    def grant(self, receipt_id: str, unlocked: bool = True) -> Entitlement:
        """Record what the store told us about a purchase."""
        with _LOCK:
            entry = self._entries.get(receipt_id) or Entitlement(receipt_id=receipt_id)
            self._fresh(entry)
            entry.unlocked = unlocked
            self._entries[receipt_id] = entry
            self._save()
            return entry

    def record_answer(self, receipt_id: str) -> Optional[Entitlement]:
        """Count one paid answer against this month's allowance."""
        with _LOCK:
            entry = self._entries.get(receipt_id)
            if entry is None:
                return None
            self._fresh(entry)
            entry.answers_used += 1
            self._save()
            return entry


entitlement_store = EntitlementStore()
