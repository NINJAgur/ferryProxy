import pytest

from app import catalogue as cat
from app.entitlement import entitlement_store
from app.llm.base import LLMResult
from app.routes import chat as chat_module
from app.routes import entitlement as ent_module

from .conftest import build_envelope

FREE_MODEL = cat.settings.gemini_free_model
PAID_MODEL = cat.settings.anthropic_model
RECEIPT = "dev:buyer-1"
HEADERS = {"X-Store-Receipt": RECEIPT}


@pytest.fixture(autouse=True)
def service_keys(monkeypatch, tmp_path):
    for name, value in [
        ("gemini_free_api_key", "svc-gemini-free"),
        ("gemini_paid_api_key", "svc-gemini-paid"),
        ("openai_api_key", "svc-openai"),
        ("anthropic_api_key", "svc-anthropic"),
    ]:
        monkeypatch.setattr(cat.settings, name, value)
    monkeypatch.setattr(ent_module.settings, "allow_dev_subscription", True)
    # A store per test, so one test's purchases never leak into the next.
    entitlement_store._path = tmp_path / "entitlements.json"
    entitlement_store._entries = {}


class FakeProvider:
    def __init__(self) -> None:
        self.calls = 0
        self.seen_key = None

    async def generate(self, prompt, history, model, max_tokens, api_key=None):
        self.calls += 1
        self.seen_key = api_key
        return LLMResult(content="ok", model=model or "m", stop_reason="end_turn")


def buy(client, unlocked=True):
    return client.post("/v1/dev/entitlement", json={"receipt": RECEIPT, "unlocked": unlocked})


def test_no_receipt_is_the_free_tier_not_an_error(client):
    body = client.post("/v1/entitlement").json()

    assert body["unlocked"] is False
    models = {m["id"]: m for m in body["models"]}
    assert models[FREE_MODEL]["unlocked"] is True
    assert models[PAID_MODEL]["unlocked"] is False


def test_an_unverifiable_receipt_stays_on_the_free_tier(client, monkeypatch):
    # A made-up token must not unlock anything, or the paid models are free to
    # anyone who sends a random string.
    monkeypatch.setattr(ent_module.settings, "allow_dev_subscription", False)

    body = client.post("/v1/entitlement", headers={"X-Store-Receipt": "not-a-real-receipt"}).json()

    assert body["unlocked"] is False


def test_a_purchase_unlocks_every_paid_model(client):
    buy(client)

    body = client.post("/v1/entitlement", headers=HEADERS).json()

    assert body["unlocked"] is True
    assert all(m["unlocked"] for m in body["models"])


def test_revoking_a_purchase_locks_them_again(client):
    buy(client)
    buy(client, unlocked=False)

    body = client.post("/v1/entitlement", headers=HEADERS).json()

    assert body["unlocked"] is False
    assert {m["id"]: m["unlocked"] for m in body["models"]}[PAID_MODEL] is False


def test_dev_grants_are_refused_when_the_store_is_the_only_source(client, monkeypatch):
    monkeypatch.setattr(ent_module.settings, "allow_dev_subscription", False)

    response = buy(client)

    assert response.status_code == 403
    assert response.json()["error"] == "billing_required"


def test_a_free_send_needs_no_receipt(client, monkeypatch):
    fake = FakeProvider()
    monkeypatch.setattr(chat_module, "get_provider", lambda name: fake)

    response = client.post("/v1/chat", json=build_envelope({"prompt": "hi", "model": FREE_MODEL}))

    assert response.status_code == 200
    assert fake.seen_key == "svc-gemini-free"


def test_a_paid_send_without_a_receipt_is_refused(client, monkeypatch):
    def explode(*_a, **_k):
        raise AssertionError("a locked model must never reach a provider")

    monkeypatch.setattr(chat_module, "get_provider", explode)

    response = client.post("/v1/chat", json=build_envelope({"prompt": "hi", "model": PAID_MODEL}))

    assert response.status_code == 403
    assert response.json()["error"] == "model_locked"


def test_a_purchase_reaches_a_paid_model_on_its_service_key(client, monkeypatch):
    buy(client)
    fake = FakeProvider()
    monkeypatch.setattr(chat_module, "get_provider", lambda name: fake)

    response = client.post(
        "/v1/chat", json=build_envelope({"prompt": "hi", "model": PAID_MODEL}), headers=HEADERS
    )

    assert response.status_code == 200
    assert fake.seen_key == "svc-anthropic"


def test_paid_answers_count_against_the_monthly_allowance(client, monkeypatch):
    buy(client)
    monkeypatch.setattr(chat_module, "get_provider", lambda name: FakeProvider())

    for _ in range(3):
        client.post(
            "/v1/chat", json=build_envelope({"prompt": "hi", "model": PAID_MODEL}), headers=HEADERS
        )

    body = client.post("/v1/entitlement", headers=HEADERS).json()
    assert body["answersUsed"] == 3


def test_free_answers_do_not_spend_the_allowance(client, monkeypatch):
    buy(client)
    monkeypatch.setattr(chat_module, "get_provider", lambda name: FakeProvider())

    client.post(
        "/v1/chat", json=build_envelope({"prompt": "hi", "model": FREE_MODEL}), headers=HEADERS
    )

    assert client.post("/v1/entitlement", headers=HEADERS).json()["answersUsed"] == 0


def test_a_failed_call_does_not_spend_the_allowance(client, monkeypatch):
    buy(client)

    class Failing:
        async def generate(self, *_a, **_k):
            from app.llm.base import LLMProviderError

            raise LLMProviderError("upstream fell over")

    monkeypatch.setattr(chat_module, "get_provider", lambda name: Failing())

    client.post(
        "/v1/chat", json=build_envelope({"prompt": "hi", "model": PAID_MODEL}), headers=HEADERS
    )

    # Paying for an answer that never arrived would be the wrong way round.
    assert client.post("/v1/entitlement", headers=HEADERS).json()["answersUsed"] == 0


def test_spending_the_allowance_falls_back_rather_than_locking_out(client, monkeypatch):
    buy(client)
    monkeypatch.setattr(chat_module.settings, "monthly_answer_allowance", 1)
    monkeypatch.setattr(ent_module.settings, "monthly_answer_allowance", 1)
    monkeypatch.setattr(chat_module, "get_provider", lambda name: FakeProvider())

    client.post(
        "/v1/chat", json=build_envelope({"prompt": "one", "model": PAID_MODEL}), headers=HEADERS
    )
    second = client.post(
        "/v1/chat", json=build_envelope({"prompt": "two", "model": PAID_MODEL}), headers=HEADERS
    )

    assert second.status_code == 429
    assert second.json()["error"] == "allowance_spent"

    body = client.post("/v1/entitlement", headers=HEADERS).json()
    # Still theirs — they own the add-on, they have just used this month's answers.
    assert body["unlocked"] is True
    assert body["capped"] is True
    # And the free model still works, so they are not locked out of the app.
    assert {m["id"]: m["unlocked"] for m in body["models"]}[FREE_MODEL] is True


def test_the_free_model_still_answers_once_the_allowance_is_spent(client, monkeypatch):
    buy(client)
    monkeypatch.setattr(chat_module.settings, "monthly_answer_allowance", 0)
    monkeypatch.setattr(ent_module.settings, "monthly_answer_allowance", 0)
    fake = FakeProvider()
    monkeypatch.setattr(chat_module, "get_provider", lambda name: fake)

    response = client.post(
        "/v1/chat", json=build_envelope({"prompt": "hi", "model": FREE_MODEL}), headers=HEADERS
    )

    assert response.status_code == 200
    assert fake.calls == 1


def test_an_entitlement_never_carries_a_key(client):
    buy(client)
    assert "svc-" not in client.post("/v1/entitlement", headers=HEADERS).text


def test_each_model_bills_only_its_own_project(client, monkeypatch):
    """The free Gemini key must be unreachable from anything but the free model.

    Both Gemini models come from one provider, so a tier mistake here would put
    Gemini Pro traffic on the free project's bill — or the reverse — and nothing
    in the request would look wrong.
    """
    buy(client)
    seen = {}

    class Recording:
        def __init__(self, name):
            self.name = name

        async def generate(self, prompt, history, model, max_tokens, api_key=None):
            seen[model] = api_key
            return LLMResult(content="ok", model=model, stop_reason="end_turn")

    monkeypatch.setattr(chat_module, "get_provider", lambda name: Recording(name))

    for model in [FREE_MODEL, cat.settings.gemini_paid_model, cat.settings.openai_model, PAID_MODEL]:
        client.post(
            "/v1/chat", json=build_envelope({"prompt": "hi", "model": model}), headers=HEADERS
        )

    assert seen == {
        FREE_MODEL: "svc-gemini-free",
        cat.settings.gemini_paid_model: "svc-gemini-paid",
        cat.settings.openai_model: "svc-openai",
        PAID_MODEL: "svc-anthropic",
    }


def test_a_free_device_gets_a_months_answers_and_no_more(client, monkeypatch):
    """The free model is cheap, not free, so an anonymous device is metered too."""
    monkeypatch.setattr(chat_module.settings, "free_answer_allowance", 2)
    monkeypatch.setattr(ent_module.settings, "free_answer_allowance", 2)
    monkeypatch.setattr(chat_module, "get_provider", lambda name: FakeProvider())
    device = {"X-Device-Id": "device-a"}

    for _ in range(2):
        ok = client.post(
            "/v1/chat", json=build_envelope({"prompt": "hi", "model": FREE_MODEL}), headers=device
        )
        assert ok.status_code == 200

    spent = client.post(
        "/v1/chat", json=build_envelope({"prompt": "hi", "model": FREE_MODEL}), headers=device
    )
    assert spent.status_code == 429
    assert spent.json()["error"] == "free_allowance_spent"


def test_one_device_running_out_does_not_stop_another(client, monkeypatch):
    monkeypatch.setattr(chat_module.settings, "free_answer_allowance", 1)
    monkeypatch.setattr(ent_module.settings, "free_answer_allowance", 1)
    monkeypatch.setattr(chat_module, "get_provider", lambda name: FakeProvider())

    for _ in range(2):
        client.post(
            "/v1/chat",
            json=build_envelope({"prompt": "hi", "model": FREE_MODEL}),
            headers={"X-Device-Id": "heavy"},
        )

    fresh = client.post(
        "/v1/chat",
        json=build_envelope({"prompt": "hi", "model": FREE_MODEL}),
        headers={"X-Device-Id": "quiet"},
    )
    assert fresh.status_code == 200


def test_a_free_meter_never_becomes_an_entitlement(client, monkeypatch):
    """Counting a free device must not hand it the paid models."""
    monkeypatch.setattr(chat_module, "get_provider", lambda name: FakeProvider())
    client.post(
        "/v1/chat",
        json=build_envelope({"prompt": "hi", "model": FREE_MODEL}),
        headers={"X-Device-Id": "device-b"},
    )

    # The meter is keyed "free:<id>"; presenting that key as a receipt must not unlock.
    body = client.post("/v1/entitlement", headers={"X-Store-Receipt": "free:device-b"}).json()
    assert body["unlocked"] is False


def test_a_buyer_is_not_charged_against_the_free_meter(client, monkeypatch):
    buy(client)
    monkeypatch.setattr(chat_module.settings, "free_answer_allowance", 0)
    monkeypatch.setattr(ent_module.settings, "free_answer_allowance", 0)
    monkeypatch.setattr(chat_module, "get_provider", lambda name: FakeProvider())

    # Someone who paid still reaches the free model even with the free meter spent.
    response = client.post(
        "/v1/chat",
        json=build_envelope({"prompt": "hi", "model": FREE_MODEL}),
        headers={**HEADERS, "X-Device-Id": "buyer-device"},
    )
    assert response.status_code == 200
