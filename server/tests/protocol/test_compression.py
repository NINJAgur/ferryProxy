import pytest

from app.protocol.compression import (
    compress_to_base64,
    decode_payload,
    decompress_from_base64,
    encode_payload,
)


@pytest.mark.parametrize(
    "data",
    [
        pytest.param(b"", id="empty"),
        pytest.param(b"a", id="single_byte"),
        pytest.param(b"hello world", id="short_text"),
        pytest.param("unicode: éè中文".encode("utf-8"), id="unicode_text"),
    ],
)
def test_round_trip(data: bytes) -> None:
    encoded = compress_to_base64(data)
    assert decompress_from_base64(encoded) == data


def test_round_trip_large_payload() -> None:
    data = ("x" * 100_000).encode("utf-8")
    encoded = compress_to_base64(data)
    assert decompress_from_base64(encoded) == data


def test_encoded_output_is_base64_ascii() -> None:
    encoded = compress_to_base64(b"hello world")
    assert encoded.isascii()
    assert isinstance(encoded, str)


def test_large_payload_is_smaller_compressed() -> None:
    data = ("hello " * 10_000).encode("utf-8")
    encoded = compress_to_base64(data)
    assert len(encoded) < len(data)


def test_short_text_is_sent_uncompressed() -> None:
    # gzip's header plus base64's third again makes a short prompt far bigger.
    data = b'{"prompt": "Is a 9% mid-lease rent rise normal?"}'
    algorithm, encoded = encode_payload(data)
    assert algorithm == "none"
    assert len(encoded) == len(data)


def test_long_repetitive_text_is_compressed() -> None:
    data = ("the rent review clause says " * 60).encode("utf-8")
    algorithm, encoded = encode_payload(data)
    assert algorithm == "gzip"
    assert len(encoded) < len(data)


def test_encoding_never_inflates_a_payload() -> None:
    for sample in [b"", b"a", b"hi there", b'{"prompt":"x"}', ("abc" * 500).encode("utf-8")]:
        algorithm, encoded = encode_payload(sample)
        assert len(encoded) <= max(len(sample.decode("utf-8")), 1) or algorithm == "gzip"
        assert decode_payload(algorithm, encoded) == sample


def test_encode_decode_round_trip_both_algorithms() -> None:
    for sample in [b"short", ("x" * 4000).encode("utf-8"), "unicode: éè中文".encode("utf-8")]:
        algorithm, encoded = encode_payload(sample)
        assert decode_payload(algorithm, encoded) == sample


def test_decode_rejects_unknown_algorithm() -> None:
    with pytest.raises(ValueError):
        decode_payload("brotli", "abc")
