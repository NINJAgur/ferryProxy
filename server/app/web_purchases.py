import json
import logging
import threading
from pathlib import Path
from typing import Dict, List, Optional

from app.config import settings

logger = logging.getLogger(__name__)


class WebPurchases:
    """One-time purchases made through a web checkout rather than a store.

    Play can be asked at any time what an account bought, which is why nothing
    about it is written down here. A web checkout cannot be asked: it announces a
    purchase once, over a signed webhook, and that announcement is the only record
    there will ever be. So this file is the purchase — it belongs on the same
    volume as the entitlement store, and losing it strands every web buyer.

    Keyed by the customer the checkout was opened for, holding the provider's own
    order ids in the order they arrived. Two orders is two pools, the same as two
    transactions on Play.
    """

    def __init__(self, path: Optional[Path] = None) -> None:
        self._path = path or _default_path()
        self._orders: Dict[str, List[str]] = {}
        self._lock = threading.Lock()
        self._load()

    def _load(self) -> None:
        if not self._path.exists():
            return
        try:
            self._orders = json.loads(self._path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            # Starting empty would silently un-buy everyone. Better to fail loudly
            # here than to serve a free tier to people who have paid.
            logger.exception("web purchases unreadable; no web purchase will verify")
            self._orders = {}

    def _save(self) -> None:
        try:
            self._path.parent.mkdir(parents=True, exist_ok=True)
            self._path.write_text(json.dumps(self._orders, indent=2), encoding="utf-8")
        except OSError:
            logger.exception("could not write the web purchases")

    def record(self, customer_id: str, order_id: str) -> None:
        """Note that this customer paid. Repeats are ignored rather than counted:
        a provider that retries a webhook must not hand out a second pool."""
        with self._lock:
            orders = self._orders.setdefault(customer_id, [])
            if order_id in orders:
                return
            orders.append(order_id)
            self._save()

    def forget(self, order_id: str) -> None:
        """Drop a refunded order, wherever it is.

        This is what makes a refund take the answers with it — the same thing
        RevenueCat does for Play by removing the record, rather than marking it.
        """
        with self._lock:
            for customer_id, orders in list(self._orders.items()):
                if order_id not in orders:
                    continue
                orders.remove(order_id)
                if not orders:
                    del self._orders[customer_id]
                self._save()
                return

    def orders_for(self, customer_id: str) -> List[str]:
        """Every order this customer has paid for, oldest first."""
        return list(self._orders.get(customer_id, ()))


def _default_path() -> Path:
    path = Path(settings.web_purchase_store_path)
    if not path.is_absolute():
        path = Path(__file__).resolve().parent.parent / path
    return path


web_purchases = WebPurchases()
