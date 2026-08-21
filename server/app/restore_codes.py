import json
import logging
import secrets
import threading
from pathlib import Path
from typing import Dict, Optional

from app.config import settings

logger = logging.getLogger(__name__)

# A code stands in for the customer id a purchase was made under.
#
# A store can be asked "what did this person buy?" — that is what Restore does
# on Play, and why it needs no account. A browser checkout cannot be asked: the
# purchase is recorded against an id this install generated, and a reinstall
# generates a different one. The purchase is then unreachable, on this device or
# any other.
#
# So the buyer is given something to carry. The code resolves to the original
# customer id and nothing more — the store still decides whether that id owns
# anything, and how much of the pool is left. It is a portable alias, not a
# second source of truth.
_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no O/0 or I/1 to copy out wrong
_GROUPS = 3
_GROUP_LEN = 4


def _new_code() -> str:
    body = "".join(secrets.choice(_ALPHABET) for _ in range(_GROUPS * _GROUP_LEN))
    return "-".join(body[i:i + _GROUP_LEN] for i in range(0, len(body), _GROUP_LEN))


class RestoreCodes:
    def __init__(self, path: Optional[Path] = None) -> None:
        self._path = path or _default_path()
        self._codes: Dict[str, str] = {}
        self._lock = threading.Lock()
        self._load()

    def _load(self) -> None:
        if not self._path.exists():
            return
        try:
            self._codes = json.loads(self._path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            logger.exception("restore codes unreadable; starting empty")
            self._codes = {}

    def _save(self) -> None:
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            self._path.write_text(json.dumps(self._codes, indent=2), encoding="utf-8")
        except OSError:
            logger.exception("could not write the restore codes")

    def for_customer(self, customer_id: str) -> str:
        """The code for this customer, minting one the first time.

        Stable on purpose: someone who asks twice and is shown two different
        codes has no way to know which one they wrote down is still good.
        """
        with self._lock:
            for code, owner in self._codes.items():
                if owner == customer_id:
                    return code
            code = _new_code()
            while code in self._codes:
                code = _new_code()
            self._codes[code] = customer_id
            self._save()
            return code

    def resolve(self, code: str) -> Optional[str]:
        return self._codes.get(code.strip().upper())


def _default_path() -> Path:
    path = Path(settings.restore_code_store_path)
    if not path.is_absolute():
        path = Path(__file__).resolve().parent.parent / path
    return path


restore_codes = RestoreCodes()
