from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

Provider = Literal["anthropic", "openai", "gemini"]
Algorithm = Literal["gzip", "none"]
Tier = Literal["free", "paid"]


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class HistoryMessage(CamelModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequestPlaintext(CamelModel):
    prompt: str
    history: List[HistoryMessage] = []
    provider: Optional[Provider] = None
    model: Optional[str] = None
    max_tokens: Optional[int] = None
    brief: bool = False


class TerseModel(BaseModel):
    """Envelopes ride on every message, so their field names are bandwidth too.
    Names are single letters on the wire and spelled out in code; PROTOCOL.md
    is the map between the two."""

    model_config = ConfigDict(populate_by_name=True)


class ChatRequestEnvelope(TerseModel):
    request_id: str = Field(alias="r")
    algorithm: Algorithm = Field(default="gzip", alias="a")
    checksum: str = Field(alias="k")
    payload: str = Field(alias="p")


class ChatResponsePlaintext(CamelModel):
    content: str
    provider: Provider
    model: str
    stop_reason: str


class ChatResponseEnvelope(TerseModel):
    request_id: str = Field(alias="r")
    algorithm: Algorithm = Field(alias="a")
    checksum: str = Field(alias="k")
    total_chunks: int = Field(alias="n")
    chunk: str = Field(alias="c")
    ttl_seconds: int = Field(alias="t")


class ChunkResponse(TerseModel):
    index: int = Field(alias="i")
    total: int = Field(alias="n")
    chunk: str = Field(alias="c")


class ErrorEnvelope(CamelModel):
    error: str
    message: str


class ModelInfo(CamelModel):
    """A model the caller may or may not use. Says nothing about keys — the relay
    holds those, and which one served an answer is never the user's concern."""

    id: str
    label: str
    provider: Provider
    tier: Tier
    blurb: str
    unlocked: bool
    reason: Literal["free", "subscribed", "needs_subscription", "unavailable"]


class EntitlementResponse(CamelModel):
    """What a device may use. There is no account here — only whether a purchase
    exists, and how much of this month's allowance it has left."""

    unlocked: bool
    answers_used: int
    answers_allowed: int
    #: Owns the add-on but has spent the month's allowance; the free model carries on.
    capped: bool
    models: List[ModelInfo]


class ProviderStatus(CamelModel):
    name: Provider
    label: str
    ready: bool
    requires_key: bool
    env_var: Optional[str] = None


class ProvidersResponse(CamelModel):
    providers: List[ProviderStatus]
