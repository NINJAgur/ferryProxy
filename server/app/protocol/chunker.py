def split_into_chunks(data: str, chunk_size: int) -> list[str]:
    if chunk_size <= 0:
        raise ValueError("chunk_size must be positive")
    if not data:
        return [""]
    return [data[i : i + chunk_size] for i in range(0, len(data), chunk_size)]


def reassemble_chunks(chunks_by_index: dict[int, str], total_chunks: int) -> str:
    missing = sorted(set(range(total_chunks)) - set(chunks_by_index))
    if missing:
        raise ValueError(f"missing chunk indices: {missing}")
    return "".join(chunks_by_index[i] for i in range(total_chunks))
