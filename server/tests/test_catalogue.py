import pytest

from app import catalogue as cat


@pytest.fixture(autouse=True)
def all_keys_configured(monkeypatch):
    monkeypatch.setattr(cat.settings, "gemini_free_api_key", "svc-gemini-free")
    monkeypatch.setattr(cat.settings, "gemini_paid_api_key", "svc-gemini-paid")
    monkeypatch.setattr(cat.settings, "openai_api_key", "svc-openai")
    monkeypatch.setattr(cat.settings, "anthropic_api_key", "svc-anthropic")


def by_id(subscribed: bool):
    return {m.id: m for m in cat.catalogue(subscribed)}


def test_the_free_model_needs_no_account_at_all():
    free = by_id(subscribed=False)[cat.settings.gemini_free_model]
    assert free.unlocked is True
    assert free.reason == "free"
    assert free.tier == "free"


def test_paid_models_are_locked_without_a_subscription():
    models = by_id(subscribed=False)
    paid = [m for m in models.values() if m.tier == "paid"]
    assert paid, "there should be paid models to gate"
    assert all(not m.unlocked and m.reason == "needs_subscription" for m in paid)


def test_subscribing_unlocks_every_provider():
    models = by_id(subscribed=True)
    assert all(m.unlocked for m in models.values())
    assert {m.provider for m in models.values()} == {"gemini", "openai", "anthropic"}


def test_the_free_tier_never_spends_the_paid_gemini_account():
    # Two separate Gemini keys exist precisely so free traffic cannot bill the
    # paid account; picking the wrong one would be invisible without this.
    free = cat.find(cat.settings.gemini_free_model)
    paid = cat.find(cat.settings.gemini_paid_model)
    assert cat.resolve_key(free) == "svc-gemini-free"
    assert cat.resolve_key(paid) == "svc-gemini-paid"


def test_each_provider_is_served_by_its_own_service_key():
    assert cat.resolve_key(cat.find(cat.settings.openai_model)) == "svc-openai"
    assert cat.resolve_key(cat.find(cat.settings.anthropic_model)) == "svc-anthropic"


def test_a_model_with_no_key_is_unavailable_rather_than_an_upsell(monkeypatch):
    monkeypatch.setattr(cat.settings, "openai_api_key", None)
    gpt = by_id(subscribed=True)[cat.settings.openai_model]
    assert gpt.unlocked is False
    assert gpt.reason == "unavailable"


def test_the_catalogue_never_carries_a_key():
    for m in cat.catalogue(subscribed=True):
        assert "svc-" not in m.model_dump_json()


def test_is_allowed_matches_what_the_catalogue_reports():
    assert cat.is_allowed(cat.settings.gemini_free_model, subscribed=False) is True
    assert cat.is_allowed(cat.settings.anthropic_model, subscribed=False) is False
    assert cat.is_allowed(cat.settings.anthropic_model, subscribed=True) is True


def test_unknown_models_are_not_allowed():
    assert cat.is_allowed("gpt-9-ultra", subscribed=True) is False


def test_the_default_model_is_the_free_one():
    assert cat.default_model() == cat.settings.gemini_free_model
