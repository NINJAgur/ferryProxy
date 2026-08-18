from app.protocol.checksum import CHECKSUM_HEX_LEN, sha256_hex


def test_deterministic() -> None:
    assert sha256_hex(b"hello") == sha256_hex(b"hello")


def test_different_input_different_hash() -> None:
    assert sha256_hex(b"hello") != sha256_hex(b"hellp")


def test_detects_single_byte_tamper() -> None:
    original = b"the quick brown fox"
    tampered = b"the quick brown fdx"
    assert sha256_hex(original) != sha256_hex(tampered)


def test_hex_digest_shape() -> None:
    digest = sha256_hex(b"anything")
    assert len(digest) == CHECKSUM_HEX_LEN
    assert all(c in "0123456789abcdef" for c in digest)
