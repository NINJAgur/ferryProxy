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
    # How many times the add-on was bought against this row. Each purchase buys
    # its own pool, so this multiplies the allowance rather than replacing it.
    purchases: int = 1

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

    def _fresh(self, entry: Entitlement, resets_monthly: bool) -> Entitlement:
        """Reset the counter when the month has turned over, for those that renew.

        A purchase does not renew. It buys a fixed pool of answers, so its counter
        runs for the life of the purchase — resetting it monthly would mean one
        payment covering an unbounded number of answers. The free tier does renew,
        because nobody paid for it.
        """
        if resets_monthly and entry.rolled_over():
            entry.period = current_period()
            entry.answers_used = 0
        return entry

    def get(self, receipt_id: str, resets_monthly: bool = False) -> Optional[Entitlement]:
        with _LOCK:
            entry = self._entries.get(receipt_id)
            return self._fresh(entry, resets_monthly) if entry else None

    def grant(self, receipt_id: str, unlocked: bool = True, purchases: int = 1) -> Entitlement:
        """Record what the store told us about a purchase.

        Answers already spent are kept: this is called again whenever the store
        reports another purchase, and that must add to the pool rather than wipe
        the count of what has been used out of it.
        """
        with _LOCK:
            entry = self._entries.get(receipt_id) or Entitlement(receipt_id=receipt_id)
            entry.unlocked = unlocked
            entry.purchases = purchases
            self._entries[receipt_id] = entry
            self._save()
            return entry

    def record_answer(self, receipt_id: str, resets_monthly: bool = False) -> Optional[Entitlement]:
        """Count one answer against whatever allowance this id has."""
        with _LOCK:
            entry = self._entries.get(receipt_id)
            if entry is None:
                return None
            self._fresh(entry, resets_monthly)
            entry.answers_used += 1
            self._save()
            return entry


entitlement_store = EntitlementStore()
