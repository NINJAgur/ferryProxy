import time
from dataclasses import dataclass
from typing import Dict, List, Optional


@dataclass
class CacheEntry:
    chunks: List[str]
    checksum: str
    expires_at: float

    @property
    def total_chunks(self) -> int:
        return len(self.chunks)


class ResponseCache:
    def __init__(self, ttl_seconds: int) -> None:
        self._ttl_seconds = ttl_seconds
        self._entries: Dict[str, CacheEntry] = {}

    def put(self, request_id: str, chunks: List[str], checksum: str) -> None:
        self._entries[request_id] = CacheEntry(
            chunks=chunks,
            checksum=checksum,
            expires_at=time.monotonic() + self._ttl_seconds,
        )

    def get(self, request_id: str) -> Optional[CacheEntry]:
        entry = self._entries.get(request_id)
        if entry is None:
            return None
        if time.monotonic() > entry.expires_at:
            del self._entries[request_id]
            return None
        return entry
