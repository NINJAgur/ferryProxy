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

    # Set this to the OAuth client id from Google Cloud Console → Credentials.
    # Without it the relay cannot verify who anyone is, and says so rather
    # than trusting whatever it is handed.
    google_client_id: Optional[str] = None
    # Dev-only: lets the subscribe button flip entitlement without a payment
    # provider wired up. Must be off anywhere real money is involved.
    allow_dev_subscription: bool = True

    default_llm_provider: str = "anthropic"
    llm_max_tokens: int = 2048

    chunk_size_bytes: int = 512
    cache_ttl_seconds: int = 300


settings = Settings()
