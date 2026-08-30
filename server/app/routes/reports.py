import logging

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app import reports

router = APIRouter()
logger = logging.getLogger(__name__)


class Report(BaseModel):
    """A flagged answer.

    No receipt and no device id: reporting is not a paid feature and attaching an
    identity to a complaint would make the log a record of who complained about
    what. The answer itself is what has to be looked at.
    """

    reason: str = Field(alias="n")
    answer: str = Field(alias="a")
    model: str = Field(default="", alias="m")
    note: str = Field(default="", alias="t")

    model_config = {"populate_by_name": True}


@router.post("/v1/report")
async def report(body: Report) -> JSONResponse:
    """Someone flagging what the model said.

    Accepted whatever arrives, within reason. A report is the one request in the
    app where the sender is already unhappy, and answering it with a validation
    error would be the second thing to go wrong for them.
    """
    reason = body.reason if body.reason in reports.REASONS else "other"
    if not body.answer.strip():
        return JSONResponse(status_code=400, content={"error": "nothing_to_report"})

    reports.record(reason=reason, model=body.model or None, answer=body.answer, note=body.note or None)
    logger.info("an answer was reported as %s", reason)
    return JSONResponse(status_code=200, content={"received": True})
