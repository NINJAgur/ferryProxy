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
