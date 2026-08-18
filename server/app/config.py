from typing import Optional

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    anthropic_api_key: Optional[str] = None
    anthropic_model: str = "claude-opus-5"
    anthropic_effort: str = "medium"

    openai_api_key: Optional[str] = None
    openai_model: str = "gpt-4o"

    gemini_api_key: Optional[str] = None
    gemini_model: str = "gemini-3.6-flash"

    default_llm_provider: str = "anthropic"
    llm_max_tokens: int = 2048
    demo_delay_ms: int = 1200

    chunk_size_bytes: int = 512
    cache_ttl_seconds: int = 300


settings = Settings()
