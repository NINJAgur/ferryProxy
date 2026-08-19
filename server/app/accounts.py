import json
import logging
import threading
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, Optional

logger = logging.getLogger(__name__)

# Where an account store would be a database in production. A file keeps the
# entitlement seam honest — it survives a restart — without pretending to be one.
_STORE_PATH = Path(__file__).resolve().parent.parent / ".accounts.json"
_LOCK = threading.Lock()


@dataclass
class Account:
    subject: str
    email: str
    entitled: bool = False


class AccountStore:
    def __init__(self, path: Path = _STORE_PATH) -> None:
        self._path = path
        self._accounts: Dict[str, Account] = {}
        self._load()

    def _load(self) -> None:
        if not self._path.exists():
            return
        try:
            raw = json.loads(self._path.read_text(encoding="utf-8"))
            self._accounts = {k: Account(**v) for k, v in raw.items()}
        except (OSError, ValueError, TypeError):
            logger.exception("account store unreadable; starting empty")
            self._accounts = {}

    def _save(self) -> None:
        try:
            self._path.write_text(
                json.dumps({k: asdict(v) for k, v in self._accounts.items()}, indent=2),
                encoding="utf-8",
            )
        except OSError:
            logger.exception("could not write the account store")

    def upsert(self, subject: str, email: str) -> Account:
        with _LOCK:
            account = self._accounts.get(subject)
            if account is None:
                account = Account(subject=subject, email=email)
                self._accounts[subject] = account
            else:
                account.email = email
            self._save()
            return account

    def get(self, subject: str) -> Optional[Account]:
        return self._accounts.get(subject)

    def set_entitled(self, subject: str, entitled: bool) -> Optional[Account]:
        with _LOCK:
            account = self._accounts.get(subject)
            if account is None:
                return None
            account.entitled = entitled
            self._save()
            return account


account_store = AccountStore()
