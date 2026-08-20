from typing import List, Optional

from anthropic import APIConnectionError, APIStatusError, AsyncAnthropic

from app.config import settings
from app.llm.base import LLMConfigError, LLMProviderError, LLMResult
from app.protocol.schemas import HistoryMessage


def _supports_effort(model: str) -> bool:
    """Whether this model accepts the effort parameter.

    Haiku does not, and says so with a 400 rather than ignoring it. Named by what
    is known to refuse it, so a model added later gets the parameter by default
    and fails loudly instead of silently losing the setting.
    """
    return "haiku" not in model


class AnthropicProvider:
    def __init__(self) -> None:
        self._client: Optional[AsyncAnthropic] = None

    def _client_for(self, api_key: Optional[str]) -> AsyncAnthropic:
        # A caller-supplied key is used for that call only and never cached.
        if api_key:
            return AsyncAnthropic(api_key=api_key)
        if not settings.anthropic_api_key:
            raise LLMConfigError(
                "no Anthropic key: add one in the app, or set ANTHROPIC_API_KEY on the relay"
            )
        if self._client is None:
            self._client = AsyncAnthropic(api_key=settings.anthropic_api_key)
        return self._client

    async def generate(
        self,
        prompt: str,
        history: List[HistoryMessage],
        model: Optional[str],
        max_tokens: int,
        api_key: Optional[str] = None,
    ) -> LLMResult:
        client = self._client_for(api_key)
        messages = [{"role": h.role, "content": h.content} for h in history]
        messages.append({"role": "user", "content": prompt})

        chosen = model or settings.anthropic_model
        kwargs = {}
        # Not every model takes it — Haiku 4.5 rejects the request outright rather
        # than ignoring it, so asking for effort where it is not supported costs
        # the whole answer.
        if _supports_effort(chosen):
            kwargs["output_config"] = {"effort": settings.anthropic_effort}

        try:
            response = await client.messages.create(
                model=chosen,
                max_tokens=max_tokens,
                messages=messages,
                stream=False,
                **kwargs,
            )
        except (APIConnectionError, APIStatusError) as exc:
            raise LLMProviderError(f"Anthropic request failed: {exc}") from exc

        content = "".join(block.text for block in response.content if block.type == "text")
        return LLMResult(content=content, model=response.model, stop_reason=response.stop_reason or "")
