from fastapi import FastAPI
from contextlib import asynccontextmanager

from .routes.enroll import router as enroll_router
from .routes.events import router as events_router
from .routes.unenroll import router as unenroll_router
from .routes.dashboard import router as dashboard_router
from .services.db import init_db, close_pool
from .middleware.auth import AuthMiddleware


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Runs on startup and shutdown.
    - Startup  : creates DB tables if they don't exist
    - Shutdown : closes the asyncpg connection pool cleanly
    """
    await init_db()
    yield
    await close_pool()


app = FastAPI(
    title="DripEngine API",
    description="Self-hostable email drip/sequence engine for developers.",
    version="0.1.0",
    lifespan=lifespan,
)

# --- Middleware ---
app.add_middleware(AuthMiddleware)

# --- Routes ---
app.include_router(enroll_router,  tags=["Ingestion"])
app.include_router(events_router,  tags=["Ingestion"])
app.include_router(unenroll_router, tags=["Ingestion"])
app.include_router(dashboard_router)


@app.get("/health", tags=["Meta"])
async def health():
    return {"status": "ok", "service": "dripengine-api"}