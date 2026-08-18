from typing import Dict

from app.llm.anthropic_provider import AnthropicProvider
from app.llm.base import LLMProvider
from app.llm.demo_provider import DemoProvider
from app.llm.gemini_provider import GeminiProvider
from app.llm.openai_provider import OpenAIProvider

_PROVIDERS: Dict[str, LLMProvider] = {
    "anthropic": AnthropicProvider(),
    "openai": OpenAIProvider(),
    "gemini": GeminiProvider(),
    "demo": DemoProvider(),
}


def get_provider(name: str) -> LLMProvider:
    try:
        return _PROVIDERS[name]
    except KeyError:
        raise ValueError(f"unknown provider: {name}") from None
