import base64
import gzip
import zlib
from typing import Tuple

from app.protocol.dictionary import SHARED_DICTIONARY

# Payload encodings, in the order they were added.
#
# "none" is the UTF-8 text as-is. "gzip" is base64(gzip(bytes)) — worth it for a
# long answer and actively harmful for a short one, because gzip adds a ~20 byte
# header and base64 then inflates the result by a third, so a small prompt could
# more than double.
#
# "zd" is raw deflate against a dictionary both ends already hold, base64'd. It
# has no header to amortise and starts with a body of text to match against, so
# it beats sending plainly even at ninety bytes — the crossover the other two
# leave in the middle simply is not there.
ALGORITHM_GZIP = "gzip"
ALGORITHM_NONE = "none"
ALGORITHM_DICT = "zd"

# Raw deflate: no zlib header, because the dictionary makes it unnecessary and
# the bytes are worth more than the formality.
_RAW_DEFLATE_WINDOW = -15


def compress_to_base64(data: bytes) -> str:
    return base64.b64encode(gzip.compress(data)).decode("ascii")


def decompress_from_base64(encoded: str) -> bytes:
    return gzip.decompress(base64.b64decode(encoded))


def compress_with_dictionary(data: bytes) -> str:
    compressor = zlib.compressobj(
        9, zlib.DEFLATED, _RAW_DEFLATE_WINDOW, 9, zlib.Z_DEFAULT_STRATEGY, zdict=SHARED_DICTIONARY
    )
    return base64.b64encode(compressor.compress(data) + compressor.flush()).decode("ascii")


def decompress_with_dictionary(encoded: str) -> bytes:
    decompressor = zlib.decompressobj(_RAW_DEFLATE_WINDOW, zdict=SHARED_DICTIONARY)
    return decompressor.decompress(base64.b64decode(encoded)) + decompressor.flush()


def encode_payload(data: bytes, dictionary: bool = False) -> Tuple[str, str]:
    """Return (algorithm, text) using whichever encoding is actually smaller.

    The dictionary is only offered to a caller that used it first. A relay that
    answered in an encoding the app has never heard of would be worse than a
    slow one — the answer would arrive and be unreadable.
    """
    candidates = [(ALGORITHM_NONE, data.decode("utf-8")), (ALGORITHM_GZIP, compress_to_base64(data))]
    if dictionary:
        candidates.append((ALGORITHM_DICT, compress_with_dictionary(data)))
    algorithm, text = min(candidates, key=lambda pair: len(pair[1]))
    return algorithm, text


def decode_payload(algorithm: str, text: str) -> bytes:
    if algorithm == ALGORITHM_GZIP:
        return decompress_from_base64(text)
    if algorithm == ALGORITHM_DICT:
        return decompress_with_dictionary(text)
    if algorithm == ALGORITHM_NONE:
        return text.encode("utf-8")
    raise ValueError(f"unknown algorithm: {algorithm}")
