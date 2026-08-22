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


def test_the_dictionary_beats_sending_plainly_where_gzip_cannot():
    """The whole point: gzip's header costs more than it saves on a short
    payload, so below a few hundred bytes it made messages bigger."""
    from app.protocol.compression import ALGORITHM_DICT, encode_payload

    small = b'{"prompt":"hi","model":"claude-opus-5","history":[],"brief":true}'

    algorithm, text = encode_payload(small, dictionary=True)

    assert algorithm == ALGORITHM_DICT
    assert len(text) < len(small)


def test_the_dictionary_is_not_used_unless_the_caller_used_it():
    """An app that has never heard of it would receive an unreadable answer."""
    from app.protocol.compression import ALGORITHM_DICT, encode_payload

    small = b'{"prompt":"hi","model":"claude-opus-5","history":[],"brief":true}'

    algorithm, _ = encode_payload(small)

    assert algorithm != ALGORITHM_DICT


def test_a_dictionary_payload_round_trips():
    from app.protocol.compression import compress_with_dictionary, decompress_with_dictionary

    original = "a conversation, several turns of it, ".encode("utf-8") * 20

    assert decompress_with_dictionary(compress_with_dictionary(original)) == original


def test_the_dictionary_has_not_drifted_from_the_client_copy():
    """client/src/transport/dictionary.ts pins the same checksum. A dictionary
    that differs by one byte decompresses to rubbish rather than failing."""
    from app.protocol.dictionary import DICTIONARY_SHA256

    assert DICTIONARY_SHA256 == "0b0e2f8ba0dd106ea66296f4fb020f07f0e509b54dc8277e82c91b64fe994c15"


def test_the_dictionary_algorithm_is_accepted_by_the_envelope():
    """It was added to the encoder and not to the schema, so every envelope
    using it was rejected with a 422 before anything decoded it."""
    from app.protocol.schemas import ChatRequestEnvelope

    envelope = ChatRequestEnvelope(r="abc123", a="zd", k="0" * 16, p="AAAA")

    assert envelope.algorithm == "zd"
