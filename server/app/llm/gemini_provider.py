from typing import List, Optional

from google import genai
from google.genai import errors as genai_errors
from google.genai import types

from app.config import settings
from app.llm.base import LLMConfigError, LLMProviderError, LLMResult
from app.protocol.schemas import HistoryMessage

_ROLE_MAP = {"user": "user", "assistant": "model"}


class GeminiProvider:
    def __init__(self) -> None:
        self._client: Optional[genai.Client] = None

    def _client_for(self, api_key: Optional[str]) -> genai.Client:
        # A caller-supplied key is used for that call only and never cached, so one
        # user's credential can't be handed to the next request.
        if api_key:
            return genai.Client(api_key=api_key)
        if not settings.gemini_api_key:
            raise LLMConfigError("no Gemini key: add one in the app, or set GEMINI_API_KEY on the relay")
        if self._client is None:
            self._client = genai.Client(api_key=settings.gemini_api_key)
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
        contents = [
            types.Content(role=_ROLE_MAP[h.role], parts=[types.Part(text=h.content)])
            for h in history
        ]
        contents.append(types.Content(role="user", parts=[types.Part(text=prompt)]))

        # Current Gemini Flash models think before answering and bill that hidden
        # reasoning against max_output_tokens, so a small cap truncates the reply
        # mid-sentence instead of shortening it (and thinking_budget=0 is rejected
        # outright). Brevity is therefore asked for in the prompt, and this cap is
        # only a safety ceiling.
        config = types.GenerateContentConfig(max_output_tokens=max_tokens)
        try:
            response = await client.aio.models.generate_content(
                model=model or settings.gemini_model,
                contents=contents,
                config=config,
            )
        except genai_errors.APIError as exc:
            raise LLMProviderError(f"Gemini request failed: {exc}") from exc

        candidate = response.candidates[0]
        finish_reason = candidate.finish_reason
        return LLMResult(
            content=response.text or "",
            model=model or settings.gemini_model,
            stop_reason=str(finish_reason) if finish_reason else "",
        )
