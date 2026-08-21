from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.cache.response_cache import ResponseCache
from app.config import settings
from app.logging_config import configure_logging
from app.routes.chat import router as chat_router
from app.routes.chunks import router as chunks_router
from app.routes.deletion import router as deletion_router
from app.routes.entitlement import router as entitlement_router
from app.routes.privacy import router as privacy_router
from app.routes.site import router as site_router
from app.routes.terms import router as terms_router

configure_logging()

app = FastAPI(title="proxyAI")
app.state.response_cache = ResponseCache(ttl_seconds=settings.cache_ttl_seconds)

# The native app sends no Origin, so this only constrains browsers. "*" suits a
# dev machine, where the app runs from whatever port Expo picked.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.cors_allow_origins.split(",") if o.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

app.include_router(chat_router)
app.include_router(chunks_router)
app.include_router(entitlement_router)
app.include_router(privacy_router)
app.include_router(deletion_router)
app.include_router(terms_router)
app.include_router(site_router)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}
