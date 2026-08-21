from dataclasses import dataclass
from typing import List, Optional, Protocol

from app.protocol.schemas import HistoryMessage


@dataclass
class LLMResult:
    content: str
    model: str
    stop_reason: str
    # What the answer cost, in tokens. None where a provider did not say — the
    # cost of an answer cannot be inferred from its length, because every message
    # re-sends the conversation so far and providers bill input and output apart.
    input_tokens: Optional[int] = None
    output_tokens: Optional[int] = None


class LLMConfigError(Exception):
    """Raised when a provider is requested but no usable API key was supplied."""


class LLMProviderError(Exception):
    """Raised when the upstream provider call fails."""


class LLMProvider(Protocol):
    async def generate(
        self,
        prompt: str,
        history: List[HistoryMessage],
        model: Optional[str],
        max_tokens: int,
        api_key: Optional[str] = None,
    ) -> LLMResult:
        """`api_key`, when given, is the caller's own key and takes precedence over
        anything configured on the relay, so each user spends their own quota."""
        ...
