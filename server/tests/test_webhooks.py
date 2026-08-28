import hashlib
import hmac
import json

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routes import webhooks
from app.web_purchases import WebPurchases

SECRET = "test-signing-secret"
CUSTOMER = "device-abc"
ORDER = "9001"


@pytest.fixture
def store(tmp_path, monkeypatch):
    store = WebPurchases(path=tmp_path / "web-purchases.json")
    monkeypatch.setattr(webhooks, "web_purchases", store)
    monkeypatch.setattr(webhooks.settings, "lemonsqueezy_webhook_secret", SECRET)
    monkeypatch.setattr(webhooks.settings, "allow_sandbox_purchases", False)
    return store


def payload(event="order_created", order=ORDER, status="paid", test_mode=False, customer=CUSTOMER):
    meta = {"event_name": event}
    if customer is not None:
        meta["custom_data"] = {"customer_id": customer}
    return {"meta": meta, "data": {"id": order, "attributes": {"status": status, "test_mode": test_mode}}}


def post(body: dict, secret=SECRET):
    raw = json.dumps(body).encode()
    signature = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    with TestClient(app) as client:
        return client.post("/v1/webhooks/lemonsqueezy", content=raw, headers={"X-Signature": signature})


def test_a_paid_order_is_recorded(store):
    assert post(payload()).status_code == 200
    assert store.orders_for(CUSTOMER) == [ORDER]


def test_an_unsigned_webhook_is_refused(store):
    response = post(payload(), secret="not-the-secret")

    # The signature is the only thing between this endpoint and free pools.
    assert response.status_code == 401
    assert store.orders_for(CUSTOMER) == []


def test_a_refund_withdraws_the_order(store):
    post(payload())
    assert post(payload(event="order_refunded")).status_code == 200
    assert store.orders_for(CUSTOMER) == []


def test_a_test_order_is_refused_in_production(store):
    assert post(payload(test_mode=True)).status_code == 200
    assert store.orders_for(CUSTOMER) == []


def test_a_test_order_counts_on_a_dev_relay(store, monkeypatch):
    monkeypatch.setattr(webhooks.settings, "allow_sandbox_purchases", True)
    post(payload(test_mode=True))
    assert store.orders_for(CUSTOMER) == [ORDER]


def test_an_unpaid_order_grants_nothing(store):
    """Pending and failed orders arrive here too."""
    post(payload(status="pending"))
    assert store.orders_for(CUSTOMER) == []


def test_an_order_with_no_customer_grants_nothing(store):
    # There is nothing to attach it to, and guessing would unlock a stranger.
    assert post(payload(customer=None)).status_code == 200
    assert store.orders_for(CUSTOMER) == []


def test_an_unrelated_event_is_accepted_and_ignored(store):
    # A non-200 would have the provider retry an event we never act on.
    assert post(payload(event="subscription_created")).status_code == 200
    assert store.orders_for(CUSTOMER) == []


def test_a_repeated_delivery_does_not_buy_twice(store):
    post(payload())
    post(payload())
    assert store.orders_for(CUSTOMER) == [ORDER]


def test_a_free_order_still_counts(store):
    """A 100%-off tester code is a real order with a total of zero."""
    body = payload()
    body["data"]["attributes"]["total"] = 0
    post(body)
    assert store.orders_for(CUSTOMER) == [ORDER]


def test_nothing_is_recorded_without_a_configured_secret(store, monkeypatch):
    monkeypatch.setattr(webhooks.settings, "lemonsqueezy_webhook_secret", None)
    assert post(payload()).status_code == 503
    assert store.orders_for(CUSTOMER) == []
