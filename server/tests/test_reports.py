import json

import pytest
from fastapi.testclient import TestClient

from app import reports
from app.main import app


@pytest.fixture
def log(tmp_path, monkeypatch):
    path = tmp_path / "reports.jsonl"
    monkeypatch.setattr(reports, "_PATH", path)
    return path


def post(body: dict):
    with TestClient(app) as client:
        return client.post("/v1/report", json=body)


def lines(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


def test_a_report_is_written_down(log):
    response = post({"n": "offensive", "a": "something vile", "m": "claude-opus-5"})

    assert response.status_code == 200
    entry = lines(log)[0]
    assert entry["reason"] == "offensive"
    assert entry["answer"] == "something vile"
    assert entry["model"] == "claude-opus-5"


def test_an_unknown_reason_is_filed_rather_than_refused(log):
    """The one request where the sender is already unhappy. Answering it with a
    validation error would be the second thing to go wrong for them."""
    assert post({"n": "made-up", "a": "an answer"}).status_code == 200
    assert lines(log)[0]["reason"] == "other"


def test_an_empty_report_is_refused(log):
    # Nothing to look at, so nothing to file.
    assert post({"n": "other", "a": "   "}).status_code == 400
    assert not log.exists()


def test_a_long_answer_is_truncated_and_says_so(log):
    post({"n": "false", "a": "x" * (reports.MAX_STORED_CHARS + 500)})

    entry = lines(log)[0]
    assert len(entry["answer"]) == reports.MAX_STORED_CHARS
    assert entry["truncated"] is True


def test_a_report_carries_no_identity(log):
    """A complaint should not be filed against the person making it."""
    post({"n": "harmful", "a": "an answer"})

    entry = lines(log)[0]
    assert "device" not in entry
    assert "receipt" not in entry


def test_reports_accumulate(log):
    post({"n": "offensive", "a": "one"})
    post({"n": "false", "a": "two"})

    assert [e["answer"] for e in lines(log)] == ["one", "two"]


def test_a_failed_write_does_not_fail_the_report(monkeypatch, tmp_path):
    # Losing a complaint is bad; showing an error to someone already unhappy is
    # worse, and they cannot do anything about a full disk.
    monkeypatch.setattr(reports, "_PATH", tmp_path / "nope" / "x" / "reports.jsonl")
    monkeypatch.setattr(reports.Path, "mkdir", lambda *a, **k: (_ for _ in ()).throw(OSError("no")))

    assert post({"n": "other", "a": "an answer"}).status_code == 200
