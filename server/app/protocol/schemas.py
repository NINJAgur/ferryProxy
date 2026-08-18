from typing import List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

Provider = Literal["demo", "anthropic", "openai", "gemini"]
Algorithm = Literal["gzip", "none"]


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class HistoryMessage(CamelModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequestPlaintext(CamelModel):
    prompt: str
    history: List[HistoryMessage] = []
    provider: Provider = "anthropic"
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


class ProviderStatus(CamelModel):
    name: Provider
    label: str
    ready: bool
    requires_key: bool
    env_var: Optional[str] = None


class ProvidersResponse(CamelModel):
    providers: List[ProviderStatus]
