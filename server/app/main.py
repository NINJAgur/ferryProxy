from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.cache.response_cache import ResponseCache
from app.config import settings
from app.logging_config import configure_logging
from app.routes.chat import router as chat_router
from app.routes.chunks import router as chunks_router
from app.routes.providers import router as providers_router

configure_logging()

app = FastAPI(title="proxyAI")
app.state.response_cache = ResponseCache(ttl_seconds=settings.cache_ttl_seconds)

# Permissive by design: this is a local dev/demo proxy, not a multi-tenant service,
# and the client (Expo web/PC, iOS, Android) can run from any dev port or device.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(chat_router)
app.include_router(chunks_router)
app.include_router(providers_router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
