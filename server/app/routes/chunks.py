from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.protocol.schemas import ChunkResponse, ErrorEnvelope

router = APIRouter()


def _error(status_code: int, error: str, message: str) -> JSONResponse:
    body = ErrorEnvelope(error=error, message=message).model_dump(by_alias=True)
    return JSONResponse(status_code=status_code, content=body)


@router.get("/v1/chat/{request_id}/chunks/{index}")
async def get_chunk(request_id: str, index: int, request: Request) -> JSONResponse:
    entry = request.app.state.response_cache.get(request_id)
    if entry is None:
        return _error(404, "not_found", "requestId unknown or expired")

    if index < 0 or index >= entry.total_chunks:
        return _error(
            404,
            "chunk_out_of_range",
            f"index must be within [0, {entry.total_chunks})",
        )

    chunk_response = ChunkResponse(index=index, total=entry.total_chunks, chunk=entry.chunks[index])
    return JSONResponse(status_code=200, content=chunk_response.model_dump(by_alias=True))
