from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Four service-account keys, created by hand in each provider's console.
    # Two for Gemini so the free tier can never spend the paid account.
    anthropic_api_key: Optional[str] = None
    anthropic_model: str = "claude-opus-5"
    anthropic_effort: str = "medium"

    openai_api_key: Optional[str] = None
    openai_model: str = "gpt-4o"

    gemini_free_api_key: Optional[str] = None
    gemini_free_model: str = "gemini-3.6-flash"
    gemini_paid_api_key: Optional[str] = None
    gemini_paid_model: str = "gemini-pro-latest"

    # Verifies store receipts. Without it the relay cannot confirm a purchase, so
    # every caller stays on the free tier rather than being trusted.
    revenuecat_api_key: Optional[str] = None
    # Dev-only: accepts a "dev:" receipt so the locked and unlocked states can be
    # exercised before a store product exists. Off by default because the failure
    # is one-directional — a relay deployed with this on gives the paid models,
    # which cost real money per answer, to anyone who asks.
    allow_dev_subscription: bool = False
    # A store's sandbox grants the same entitlement as a real purchase, and it
    # takes test cards. A relay that honours those is giving the paid models away
    # to anyone who finds the sandbox checkout, so only a dev relay may.
    allow_sandbox_purchases: bool = False

    # What one purchase buys, for good. A pool rather than a monthly allowance:
    # the payment happens once, so the cost it covers has to be finite. A
    # renewing allowance means a buyer who keeps using it costs money every month
    # against a payment made once, and eventually costs more than they paid.
    purchase_answer_allowance: int = 500
    # The free tier does renew monthly — it is not paid for, so it is a recurring
    # gift rather than a purchased quantity, and the model behind it is cheap.
    free_answer_allowance: int = 100

    default_llm_provider: str = "anthropic"
    llm_max_tokens: int = 2048

    chunk_size_bytes: int = 512
    cache_ttl_seconds: int = 300

    # Comma-separated origins allowed to call the relay from a browser. The
    # native app sends no Origin at all, so this only constrains web.
    cors_allow_origins: str = "*"

    # Shown on the public pricing page. A payment provider verifying a seller
    # expects the advertised price to match what the checkout charges.
    unlock_price_display: str = "$20"

    # Shown on the public privacy policy the stores require. A public issue
    # tracker rather than a personal address, so the contact is not someone's inbox.
    privacy_contact: str = "https://github.com/NINJAgur/ferryProxy/issues"
    privacy_updated: str = "20 August 2026"

    # One line per answer, with its token counts and cost. The data behind the
    # add-on's price: what an answer costs cannot be guessed from its length,
    # because history is re-sent every message and thinking is billed unseen.
    usage_log_path: str = ".usage.jsonl"

    # Where purchases and this month's usage are kept. Hosts give a container an
    # ephemeral filesystem, so in production this must point inside a mounted
    # volume or every deploy silently resets everyone's allowance.
    entitlement_store_path: str = ".entitlements.json"


settings = Settings()
