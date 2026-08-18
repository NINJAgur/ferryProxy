import base64
import gzip
from typing import Tuple

# Payload encodings. "gzip" is base64(gzip(bytes)); "none" is the UTF-8 text as-is.
# Compressing short text is counterproductive: gzip adds a ~20 byte header/trailer
# and base64 then inflates the result by a third, so a small prompt can more than
# double. Encoding must never make a payload larger than sending it plainly.
ALGORITHM_GZIP = "gzip"
ALGORITHM_NONE = "none"


def compress_to_base64(data: bytes) -> str:
    return base64.b64encode(gzip.compress(data)).decode("ascii")


def decompress_from_base64(encoded: str) -> bytes:
    return gzip.decompress(base64.b64decode(encoded))


def encode_payload(data: bytes) -> Tuple[str, str]:
    """Return (algorithm, text) using whichever encoding is actually smaller."""
    compressed = compress_to_base64(data)
    plain = data.decode("utf-8")
    if len(compressed) < len(plain):
        return ALGORITHM_GZIP, compressed
    return ALGORITHM_NONE, plain


def decode_payload(algorithm: str, text: str) -> bytes:
    if algorithm == ALGORITHM_GZIP:
        return decompress_from_base64(text)
    if algorithm == ALGORITHM_NONE:
        return text.encode("utf-8")
    raise ValueError(f"unknown algorithm: {algorithm}")
