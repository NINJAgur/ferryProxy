def test_unknown_request_id_returns_404(client):
    response = client.get("/v1/chat/does-not-exist/chunks/0")
    assert response.status_code == 404
    assert response.json()["error"] == "not_found"


def test_out_of_range_index_returns_404(client):
    from app.main import app

    app.state.response_cache.put(request_id="known-request", chunks=["aaaa", "bbbb"], checksum="deadbeef")

    response = client.get("/v1/chat/known-request/chunks/5")
    assert response.status_code == 404
    assert response.json()["error"] == "chunk_out_of_range"

    response = client.get("/v1/chat/known-request/chunks/1")
    assert response.status_code == 200
    assert response.json()["c"] == "bbbb"


def test_a_cached_answer_survives_the_process_that_made_it(tmp_path):
    """A chunked answer is collected over a minute or more of a bad line. A
    restart in the middle used to lose it, and the client spent its retries
    asking for pieces that no longer existed."""
    from app.cache.response_cache import ResponseCache

    first = ResponseCache(ttl_seconds=300, directory=tmp_path)
    first.put("abc123", ["one", "two"], "sum")

    # A new process, with nothing in memory.
    second = ResponseCache(ttl_seconds=300, directory=tmp_path)
    entry = second.get("abc123")

    assert entry is not None
    assert entry.chunks == ["one", "two"]
    assert entry.checksum == "sum"


def test_an_answer_nobody_collected_is_swept(tmp_path):
    from app.cache.response_cache import ResponseCache

    cache = ResponseCache(ttl_seconds=-1, directory=tmp_path)
    cache.put("abc123", ["one"], "sum")

    assert cache.sweep() >= 1
    assert cache.get("abc123") is None
    assert list(tmp_path.glob("*.json")) == []
