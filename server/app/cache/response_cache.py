import json
import logging
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

_SAFE_ID = re.compile(r"[A-Za-z0-9_-]{1,64}")


@dataclass
class CacheEntry:
    chunks: List[str]
    checksum: str
    expires_at: float

    @property
    def total_chunks(self) -> int:
        return len(self.chunks)


class ResponseCache:
    """Answers waiting to be collected, a chunk at a time.

    Backed by a directory as well as memory. A chunked answer is fetched over
    many requests spread across a minute or more of a bad line, and a restart in
    the middle used to lose it — the client then spent its forty retries asking
    for pieces that no longer existed, and the answer was gone for good despite
    having been paid for and generated. Memory stays the hot path; the files
    exist so a deploy or a crash costs a moment, not the answer.
    """

    def __init__(self, ttl_seconds: int, directory: Optional[Path] = None) -> None:
        self._ttl_seconds = ttl_seconds
        self._entries: Dict[str, CacheEntry] = {}
        self._dir = directory
        if self._dir is not None:
            try:
                self._dir.mkdir(parents=True, exist_ok=True)
            except OSError:
                logger.exception("no chunk cache directory; keeping answers in memory only")
                self._dir = None

    # Wall clock rather than a monotonic one: the point is to outlive the
    # process, and monotonic time restarts with it.
    def put(self, request_id: str, chunks: List[str], checksum: str) -> None:
        entry = CacheEntry(chunks=chunks, checksum=checksum, expires_at=time.time() + self._ttl_seconds)
        self._entries[request_id] = entry
        self._write(request_id, entry)

    def get(self, request_id: str) -> Optional[CacheEntry]:
        entry = self._entries.get(request_id) or self._read(request_id)
        if entry is None:
            return None
        if time.time() > entry.expires_at:
            self._forget(request_id)
            return None
        self._entries[request_id] = entry
        return entry

    def _path(self, request_id: str) -> Optional[Path]:
        # A request id arrives from the client, so it is checked rather than
        # trusted as a filename.
        if self._dir is None or not _SAFE_ID.fullmatch(request_id):
            return None
        return self._dir / f"{request_id}.json"

    def _write(self, request_id: str, entry: CacheEntry) -> None:
        path = self._path(request_id)
        if path is None:
            return
        try:
            path.write_text(
                json.dumps({"chunks": entry.chunks, "checksum": entry.checksum, "expires_at": entry.expires_at}),
                encoding="utf-8",
            )
        except OSError:
            # An answer that cannot be written is still in memory and still
            # deliverable. Failing the request here would waste a real generation.
            logger.exception("could not persist a cached answer")

    def _read(self, request_id: str) -> Optional[CacheEntry]:
        path = self._path(request_id)
        if path is None or not path.exists():
            return None
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            return CacheEntry(chunks=raw["chunks"], checksum=raw["checksum"], expires_at=raw["expires_at"])
        except (OSError, ValueError, KeyError, TypeError):
            logger.exception("a cached answer on disk was unreadable")
            return None

    def _forget(self, request_id: str) -> None:
        self._entries.pop(request_id, None)
        path = self._path(request_id)
        if path is None:
            return
        try:
            path.unlink(missing_ok=True)
        except OSError:
            logger.exception("could not remove an expired cached answer")

    def sweep(self) -> int:
        """Drop everything past its TTL. Nothing else deletes the files, and an
        answer nobody collected would otherwise sit on the disk for good."""
        removed = 0
        now = time.time()
        for request_id in [k for k, v in self._entries.items() if now > v.expires_at]:
            self._forget(request_id)
            removed += 1
        if self._dir is None:
            return removed
        try:
            for path in self._dir.glob("*.json"):
                entry = self._read(path.stem)
                if entry is None or now > entry.expires_at:
                    self._entries.pop(path.stem, None)
                    path.unlink(missing_ok=True)
                    removed += 1
        except OSError:
            logger.exception("could not sweep the chunk cache")
        return removed
