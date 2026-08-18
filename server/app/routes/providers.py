from fastapi import APIRouter

from app.config import settings
from app.protocol.schemas import ProviderStatus, ProvidersResponse

router = APIRouter()

# Which env var backs each provider, so the client can name it in setup instructions.
_ENV_VARS = {
    "anthropic": "ANTHROPIC_API_KEY",
    "openai": "OPENAI_API_KEY",
    "gemini": "GEMINI_API_KEY",
}


@router.get("/v1/providers", response_model=ProvidersResponse, response_model_by_alias=True)
async def list_providers() -> ProvidersResponse:
    keys = {
        "anthropic": settings.anthropic_api_key,
        "openai": settings.openai_api_key,
        "gemini": settings.gemini_api_key,
    }
    statuses = [
        ProviderStatus(name="demo", label="Demo", ready=True, requires_key=False, env_var=None)
    ]
    for name, label in (("anthropic", "Claude"), ("openai", "GPT"), ("gemini", "Gemini")):
        statuses.append(
            ProviderStatus(
                name=name,
                label=label,
                ready=bool(keys[name]),
                requires_key=True,
                env_var=_ENV_VARS[name],
            )
        )
    return ProvidersResponse(providers=statuses)
