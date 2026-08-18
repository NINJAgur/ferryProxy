import pytest

from app.protocol.chunker import reassemble_chunks, split_into_chunks


def test_split_exact_multiple() -> None:
    chunks = split_into_chunks("abcdefgh", chunk_size=4)
    assert chunks == ["abcd", "efgh"]


def test_split_with_remainder() -> None:
    chunks = split_into_chunks("abcdefghij", chunk_size=4)
    assert chunks == ["abcd", "efgh", "ij"]


def test_split_shorter_than_chunk_size() -> None:
    chunks = split_into_chunks("ab", chunk_size=4)
    assert chunks == ["ab"]


def test_split_empty_data_yields_single_empty_chunk() -> None:
    assert split_into_chunks("", chunk_size=4) == [""]


def test_split_rejects_non_positive_chunk_size() -> None:
    with pytest.raises(ValueError):
        split_into_chunks("abc", chunk_size=0)


def test_reassemble_round_trip() -> None:
    original = "abcdefghij"
    chunks = split_into_chunks(original, chunk_size=4)
    by_index = dict(enumerate(chunks))
    assert reassemble_chunks(by_index, len(chunks)) == original


def test_reassemble_out_of_order() -> None:
    chunks = split_into_chunks("abcdefghij", chunk_size=4)
    by_index = {2: chunks[2], 0: chunks[0], 1: chunks[1]}
    assert reassemble_chunks(by_index, 3) == "abcdefghij"


def test_reassemble_missing_index_raises() -> None:
    chunks = split_into_chunks("abcdefghij", chunk_size=4)
    by_index = {0: chunks[0], 2: chunks[2]}
    with pytest.raises(ValueError, match=r"missing chunk indices: \[1\]"):
        reassemble_chunks(by_index, 3)
