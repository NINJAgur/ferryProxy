from typing import List, Optional

from openai import APIConnectionError, APIStatusError, AsyncOpenAI

from app.config import settings
from app.llm.base import LLMConfigError, LLMProviderError, LLMResult
from app.protocol.schemas import HistoryMessage


def _token_limit_param(model: str) -> str:
    """What this model calls its output cap.

    The GPT-5 family rejects max_tokens and requires max_completion_tokens; older
    models only understand the original name. Sending the wrong one is a 400, not
    a warning, so the answer is lost either way.
    """
    return "max_completion_tokens" if model.startswith("gpt-5") else "max_tokens"


class OpenAIProvider:
    def __init__(self) -> None:
        self._client: Optional[AsyncOpenAI] = None

    def _client_for(self, api_key: Optional[str]) -> AsyncOpenAI:
        # A caller-supplied key is used for that call only and never cached.
        if api_key:
            return AsyncOpenAI(api_key=api_key)
        if not settings.openai_api_key:
            raise LLMConfigError("no OpenAI key: add one in the app, or set OPENAI_API_KEY on the relay")
        if self._client is None:
            self._client = AsyncOpenAI(api_key=settings.openai_api_key)
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

        chosen = model or settings.openai_model
        try:
            response = await client.chat.completions.create(
                model=chosen,
                messages=messages,
                stream=False,
                **{_token_limit_param(chosen): max_tokens},
            )
        except (APIConnectionError, APIStatusError) as exc:
            raise LLMProviderError(f"OpenAI request failed: {exc}") from exc

        choice = response.choices[0]
        usage = getattr(response, "usage", None)
        return LLMResult(
            content=choice.message.content or "",
            model=response.model,
            stop_reason=choice.finish_reason or "",
            input_tokens=getattr(usage, "prompt_tokens", None),
            output_tokens=getattr(usage, "completion_tokens", None),
        )
