import hashlib

# 64 bits is ample to catch chunks arriving mangled, duplicated or out of order —
# the failure this guards against is accident, not forgery. The full 64-hex digest
# cost 48 bytes in every envelope on a channel where bytes are the whole point.
CHECKSUM_HEX_LEN = 16


def sha256_hex(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()[:CHECKSUM_HEX_LEN]
