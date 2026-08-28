import pytest

from app import receipts
from app.receipts import Purchase
from app.restore_codes import RestoreCodes
from app.web_purchases import WebPurchases

CUSTOMER = "device-abc"


@pytest.fixture
def store(tmp_path):
    return WebPurchases(path=tmp_path / "web-purchases.json")


def test_a_purchase_is_remembered(store):
    store.record(CUSTOMER, "order-1")
    assert store.orders_for(CUSTOMER) == ["order-1"]


def test_a_customer_who_bought_nothing_has_nothing(store):
    assert store.orders_for(CUSTOMER) == []


def test_a_repeated_webhook_does_not_buy_twice(store):
    # Providers retry until they get a 200, so the same order arrives again.
    store.record(CUSTOMER, "order-1")
    store.record(CUSTOMER, "order-1")
    assert store.orders_for(CUSTOMER) == ["order-1"]


def test_buying_again_adds_a_pool(store):
    store.record(CUSTOMER, "order-1")
    store.record(CUSTOMER, "order-2")
    assert store.orders_for(CUSTOMER) == ["order-1", "order-2"]


def test_a_refund_takes_the_order_back(store):
    store.record(CUSTOMER, "order-1")
    store.forget("order-1")
    assert store.orders_for(CUSTOMER) == []


def test_a_refund_of_one_leaves_the_other(store):
    store.record(CUSTOMER, "order-1")
    store.record(CUSTOMER, "order-2")
    store.forget("order-1")
    assert store.orders_for(CUSTOMER) == ["order-2"]


def test_forgetting_an_unknown_order_is_harmless(store):
    store.record(CUSTOMER, "order-1")
    store.forget("never-existed")
    assert store.orders_for(CUSTOMER) == ["order-1"]


def test_purchases_survive_a_restart(tmp_path):
    """The webhook fires once. If a deploy loses this, the purchase is gone."""
    path = tmp_path / "web-purchases.json"
    WebPurchases(path=path).record(CUSTOMER, "order-1")

    assert WebPurchases(path=path).orders_for(CUSTOMER) == ["order-1"]


def test_a_web_purchase_looks_like_any_other(store, monkeypatch):
    monkeypatch.setattr(receipts, "web_purchases", store)
    store.record(CUSTOMER, "order-1")
    store.record(CUSTOMER, "order-2")

    # Keyed to the oldest so the pool stays put, counting the rest so the second
    # purchase adds answers instead of being swallowed by the row already there.
    assert receipts._web_purchase(CUSTOMER) == Purchase(id="order-1", count=2)


async def test_a_web_receipt_verifies_without_the_store(store, monkeypatch):
    """RevenueCat has never heard of this purchase, and must not be asked."""
    monkeypatch.setattr(receipts, "web_purchases", store)
    monkeypatch.setattr(receipts.settings, "revenuecat_api_key", None)
    store.record(CUSTOMER, "order-1")

    assert await receipts.verify_receipt(CUSTOMER) == Purchase(id="order-1", count=1)


async def test_a_restore_code_finds_the_web_purchase(store, tmp_path, monkeypatch):
    """The whole point of a code: the device asking is not the one that bought."""
    codes = RestoreCodes(path=tmp_path / "restore-codes.json")
    monkeypatch.setattr(receipts, "web_purchases", store)
    monkeypatch.setattr(receipts, "restore_codes", codes)
    monkeypatch.setattr(receipts.settings, "revenuecat_api_key", None)
    store.record(CUSTOMER, "order-1")
    code = codes.for_customer(CUSTOMER)

    assert await receipts.verify_receipt(f"code:{code}") == Purchase(id="order-1", count=1)


async def test_nothing_bought_still_falls_through_to_the_store(store, monkeypatch):
    monkeypatch.setattr(receipts, "web_purchases", store)
    monkeypatch.setattr(receipts.settings, "revenuecat_api_key", None)

    # No web purchase and no RevenueCat key: the free tier, not an error.
    assert await receipts.verify_receipt("someone-else") is None
