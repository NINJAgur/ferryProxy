from typing import List, Optional

from openai import APIConnectionError, APIStatusError, AsyncOpenAI

from app.config import settings
from app.llm.base import LLMConfigError, LLMProviderError, LLMResult
from app.protocol.schemas import HistoryMessage


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

        try:
            response = await client.chat.completions.create(
                model=model or settings.openai_model,
                max_tokens=max_tokens,
                messages=messages,
                stream=False,
            )
        except (APIConnectionError, APIStatusError) as exc:
            raise LLMProviderError(f"OpenAI request failed: {exc}") from exc

        choice = response.choices[0]
        return LLMResult(
            content=choice.message.content or "",
            model=response.model,
            stop_reason=choice.finish_reason or "",
        )
