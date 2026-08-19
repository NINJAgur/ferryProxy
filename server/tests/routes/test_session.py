import pytest

from app import catalogue as cat
from app.accounts import account_store
from app.llm.base import LLMResult
from app.routes import chat as chat_module
from app.routes import session as session_module

from .conftest import build_envelope

FREE_MODEL = cat.settings.gemini_free_model
PAID_MODEL = cat.settings.anthropic_model


@pytest.fixture(autouse=True)
def service_keys(monkeypatch):
    monkeypatch.setattr(cat.settings, "gemini_free_api_key", "svc-gemini-free")
    monkeypatch.setattr(cat.settings, "gemini_paid_api_key", "svc-gemini-paid")
    monkeypatch.setattr(cat.settings, "openai_api_key", "svc-openai")
    monkeypatch.setattr(cat.settings, "anthropic_api_key", "svc-anthropic")


@pytest.fixture
def signed_in(monkeypatch):
    """A verified Google sign-in, without needing a real token."""
    account_store.upsert("sub-1", "a@b.c")
    account_store.set_entitled("sub-1", False)
    resolve = lambda _h: account_store.get("sub-1")  # noqa: E731
    monkeypatch.setattr(session_module, "account_from_header", resolve)
    monkeypatch.setattr(session_module, "optional_account", lambda h: resolve(h) if h else None)
    monkeypatch.setattr(chat_module, "optional_account", lambda h: resolve(h) if h else None)
    return account_store.get("sub-1")


class FakeProvider:
    def __init__(self) -> None:
        self.seen_key = None
        self.seen_model = None

    async def generate(self, prompt, history, model, max_tokens, api_key=None):
        self.seen_key = api_key
        self.seen_model = model
        return LLMResult(content="ok", model=model or "m", stop_reason="end_turn")


def test_anonymous_callers_get_the_free_model_without_signing_in(client):
    response = client.post("/v1/session")

    assert response.status_code == 200
    body = response.json()
    assert body["signedIn"] is False
    assert body["subscribed"] is False
    assert body["email"] == ""

    models = {m["id"]: m for m in body["models"]}
    assert models[FREE_MODEL]["unlocked"] is True
    assert models[PAID_MODEL]["unlocked"] is False


def test_signing_in_alone_does_not_unlock_the_paid_models(client, signed_in):
    body = client.post("/v1/session", headers={"Authorization": "Bearer t"}).json()

    assert body["signedIn"] is True
    assert body["subscribed"] is False
    assert {m["id"]: m["unlocked"] for m in body["models"]}[PAID_MODEL] is False


def test_subscribing_unlocks_every_model(client, signed_in):
    body = client.post(
        "/v1/subscription", headers={"Authorization": "Bearer t"}, json={"subscribed": True}
    ).json()

    assert body["subscribed"] is True
    assert all(m["unlocked"] for m in body["models"])


def test_unsubscribing_locks_them_again(client, signed_in):
    client.post("/v1/subscription", headers={"Authorization": "Bearer t"}, json={"subscribed": True})
    body = client.post(
        "/v1/subscription", headers={"Authorization": "Bearer t"}, json={"subscribed": False}
    ).json()

    assert body["subscribed"] is False
    assert {m["id"]: m["unlocked"] for m in body["models"]}[PAID_MODEL] is False


def test_subscribing_needs_an_account(client):
    response = client.post("/v1/subscription")
    assert response.status_code == 401
    assert response.json()["error"] == "not_signed_in"


def test_a_session_never_returns_a_key(client, signed_in):
    response = client.post("/v1/session", headers={"Authorization": "Bearer t"})
    assert "svc-" not in response.text


def test_an_anonymous_send_uses_the_free_gemini_service_key(client, monkeypatch):
    fake = FakeProvider()
    monkeypatch.setattr(chat_module, "get_provider", lambda name: fake)

    response = client.post("/v1/chat", json=build_envelope({"prompt": "hi", "model": FREE_MODEL}))

    assert response.status_code == 200
    assert fake.seen_key == "svc-gemini-free"
    assert fake.seen_model == FREE_MODEL


def test_an_anonymous_send_cannot_reach_a_paid_model(client, monkeypatch):
    def explode(*_a, **_k):
        raise AssertionError("a locked model must never reach a provider")

    monkeypatch.setattr(chat_module, "get_provider", explode)

    response = client.post("/v1/chat", json=build_envelope({"prompt": "hi", "model": PAID_MODEL}))

    assert response.status_code == 403
    assert response.json()["error"] == "model_locked"


def test_a_subscriber_reaches_a_paid_model_on_its_own_service_key(client, signed_in, monkeypatch):
    account_store.set_entitled("sub-1", True)
    fake = FakeProvider()
    monkeypatch.setattr(chat_module, "get_provider", lambda name: fake)

    response = client.post(
        "/v1/chat",
        json=build_envelope({"prompt": "hi", "model": PAID_MODEL}),
        headers={"Authorization": "Bearer t"},
    )

    assert response.status_code == 200
    assert fake.seen_key == "svc-anthropic"


def test_an_unknown_model_is_rejected(client):
    response = client.post("/v1/chat", json=build_envelope({"prompt": "hi", "model": "gpt-9-ultra"}))
    assert response.status_code == 400
    assert response.json()["error"] == "unknown_model"


def test_a_send_with_no_model_falls_back_to_the_free_one(client, monkeypatch):
    fake = FakeProvider()
    monkeypatch.setattr(chat_module, "get_provider", lambda name: fake)

    response = client.post("/v1/chat", json=build_envelope({"prompt": "hi"}))

    assert response.status_code == 200
    assert fake.seen_model == FREE_MODEL


def test_an_unconfigured_model_reports_the_relay_not_the_subscription(client, signed_in, monkeypatch):
    # A subscriber told to "subscribe" because the relay is missing a key would be
    # sent to buy something they already have.
    account_store.set_entitled("sub-1", True)
    monkeypatch.setattr(cat.settings, "anthropic_api_key", None)

    response = client.post(
        "/v1/chat",
        json=build_envelope({"prompt": "hi", "model": PAID_MODEL}),
        headers={"Authorization": "Bearer t"},
    )

    assert response.status_code == 503
    assert response.json()["error"] == "provider_not_configured"
