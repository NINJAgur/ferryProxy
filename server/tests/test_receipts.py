import pytest

from app import receipts
from app.receipts import Purchase, _purchase

# Shape taken from a real RevenueCat v1 subscriber response.
PRODUCT = "pri_01m0ggkdms35b0vzdc1txzedat"
ENTITLEMENT = {"product_identifier": PRODUCT, "expires_date": None}
TRANSACTION = "GPA.3311-8834-1201-55118"


def record(is_sandbox=False, transaction=TRANSACTION, purchased="2026-08-01T10:00:00Z"):
    return {
        "is_sandbox": is_sandbox,
        "store": "play_store",
        "store_transaction_id": transaction,
        "purchase_date": purchased,
    }


def subscriber(*records, bucket="non_subscriptions", as_list=True):
    entries = list(records) if as_list else records[0]
    return {bucket: {PRODUCT: entries}}


def test_the_transaction_id_identifies_the_purchase():
    # Not the token the caller sent: that belongs to an install and a reinstall
    # generates a new one, which would find an empty pool and refill it.
    assert _purchase(subscriber(record())) == Purchase(id=TRANSACTION, count=1)


def test_buying_again_counts_as_another_pool():
    found = _purchase(subscriber(record(), record(transaction="GPA.2", purchased="2026-09-01T10:00:00Z")))
    assert found == Purchase(id=TRANSACTION, count=2)


def test_the_oldest_purchase_keys_the_pool():
    """So the row stays put as later purchases are added to it."""
    later = record(transaction="GPA.2", purchased="2026-09-01T10:00:00Z")
    assert _purchase(subscriber(later, record())).id == TRANSACTION


def test_a_sandbox_purchase_is_refused(monkeypatch):
    # It grants the same entitlement, with the same name, bought with a test card.
    monkeypatch.setattr(receipts.settings, "allow_sandbox_purchases", False)
    assert _purchase(subscriber(record(is_sandbox=True))) is None


def test_a_sandbox_purchase_does_not_pad_a_real_one(monkeypatch):
    monkeypatch.setattr(receipts.settings, "allow_sandbox_purchases", False)
    found = _purchase(subscriber(record(), record(is_sandbox=True, transaction="GPA.2")))
    assert found == Purchase(id=TRANSACTION, count=1)


def test_a_sandbox_purchase_counts_on_a_dev_relay(monkeypatch):
    monkeypatch.setattr(receipts.settings, "allow_sandbox_purchases", True)
    assert _purchase(subscriber(record(is_sandbox=True))).count == 1


def test_a_subscription_is_read_too():
    entry = record()
    assert _purchase(subscriber(entry, bucket="subscriptions", as_list=False)).id == TRANSACTION


def test_an_unrecognised_purchase_is_assumed_to_be_sandbox():
    # Failing the other way would hand out models that cost real money to anyone
    # whose response shape we did not anticipate.
    assert _purchase({"non_subscriptions": {}}) is None
    assert _purchase({"non_subscriptions": {PRODUCT: [{}]}}) is None


def test_a_purchase_with_no_transaction_id_is_refused():
    assert _purchase(subscriber(record(transaction=None))) is None


@pytest.mark.parametrize("allowed,sandbox,expected", [
    (False, False, Purchase(id=TRANSACTION, count=1)),   # a real purchase on a production relay
    (False, True, None),                                 # a sandbox purchase on a production relay
    (True, True, Purchase(id=TRANSACTION, count=1)),     # a sandbox purchase on a dev relay
])
async def test_verify_receipt_honours_the_flag(monkeypatch, allowed, sandbox, expected):
    monkeypatch.setattr(receipts.settings, "revenuecat_api_key", "sk_test")
    monkeypatch.setattr(receipts.settings, "allow_sandbox_purchases", allowed)

    class Response:
        status_code = 200

        def json(self):
            return {"subscriber": {
                "entitlements": {"pro": ENTITLEMENT},
                "non_subscriptions": {PRODUCT: [record(is_sandbox=sandbox)]},
            }}

    class Client:
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def get(self, *a, **k): return Response()

    monkeypatch.setattr(receipts.httpx, "AsyncClient", lambda **k: Client())
    assert await receipts.verify_receipt("u1") == expected


async def test_a_dev_receipt_keeps_its_own_id(monkeypatch):
    monkeypatch.setattr(receipts.settings, "allow_dev_subscription", True)
    assert await receipts.verify_receipt("dev:me") == Purchase(id="dev:me", dev=True)


def test_a_consumable_counts_without_any_entitlement():
    """RevenueCat does not hold an entitlement open for a consumable, so asking
    whether the customer owns "pro" answered no straight after a purchase they
    had just paid for."""
    without = {"non_subscriptions": {PRODUCT: [record()]}, "entitlements": {}}

    assert _purchase(without) == Purchase(id=TRANSACTION, count=1)


def test_purchases_of_different_products_are_all_counted():
    """The pool is a count of what was bought, not of one product id."""
    other = {"non_subscriptions": {
        PRODUCT: [record()],
        "some_other_product": [record(transaction="GPA.2", purchased="2026-09-01T10:00:00Z")],
    }}

    assert _purchase(other).count == 2
