import pytest

from app import receipts
from app.receipts import _is_sandbox

# Shape taken from a real RevenueCat v1 subscriber response.
PRODUCT = "pri_01m0ggkdms35b0vzdc1txzedat"
ENTITLEMENT = {"product_identifier": PRODUCT, "expires_date": None}


def subscriber(is_sandbox, bucket="non_subscriptions", as_list=True):
    entry = {"is_sandbox": is_sandbox, "store": "paddle"}
    return {bucket: {PRODUCT: [entry] if as_list else entry}}


def test_a_real_purchase_is_not_sandbox():
    assert _is_sandbox(subscriber(False), ENTITLEMENT) is False


def test_a_sandbox_purchase_is_recognised():
    # A sandbox purchase grants the same entitlement, with the same name, and is
    # bought with a test card — so this is the only thing telling them apart.
    assert _is_sandbox(subscriber(True), ENTITLEMENT) is True


def test_a_subscription_is_read_too():
    assert _is_sandbox(subscriber(True, bucket="subscriptions", as_list=False), ENTITLEMENT) is True


def test_the_latest_purchase_of_a_product_decides():
    sub = {"non_subscriptions": {PRODUCT: [{"is_sandbox": True}, {"is_sandbox": False}]}}
    assert _is_sandbox(sub, ENTITLEMENT) is False


def test_an_unrecognised_purchase_is_assumed_to_be_sandbox():
    # Failing the other way would hand out models that cost real money to anyone
    # whose response shape we did not anticipate.
    assert _is_sandbox({"non_subscriptions": {}}, ENTITLEMENT) is True
    assert _is_sandbox({"non_subscriptions": {PRODUCT: [{}]}}, ENTITLEMENT) is True


@pytest.mark.parametrize("allowed,sandbox,expected", [
    (False, False, "u1"),   # a real purchase on a production relay
    (False, True, None),    # a sandbox purchase on a production relay
    (True, True, "u1"),     # a sandbox purchase on a dev relay
])
async def test_verify_receipt_honours_the_flag(monkeypatch, allowed, sandbox, expected):
    monkeypatch.setattr(receipts.settings, "revenuecat_api_key", "sk_test")
    monkeypatch.setattr(receipts.settings, "allow_sandbox_purchases", allowed)

    class Response:
        status_code = 200

        def json(self):
            return {"subscriber": {
                "entitlements": {"pro": ENTITLEMENT},
                "non_subscriptions": {PRODUCT: [{"is_sandbox": sandbox}]},
            }}

    class Client:
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def get(self, *a, **k): return Response()

    monkeypatch.setattr(receipts.httpx, "AsyncClient", lambda **k: Client())
    assert await receipts.verify_receipt("u1") == expected
