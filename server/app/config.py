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
    # One purchase must not buy unbounded API spend. Over this, paid models fall
    # back to the free one until the month turns over.
    monthly_answer_allowance: int = 300

    default_llm_provider: str = "anthropic"
    llm_max_tokens: int = 2048

    chunk_size_bytes: int = 512
    cache_ttl_seconds: int = 300

    # Comma-separated origins allowed to call the relay from a browser. The
    # native app sends no Origin at all, so this only constrains web.
    cors_allow_origins: str = "*"

    # Where purchases and this month's usage are kept. Hosts give a container an
    # ephemeral filesystem, so in production this must point inside a mounted
    # volume or every deploy silently resets everyone's allowance.
    entitlement_store_path: str = ".entitlements.json"


settings = Settings()
