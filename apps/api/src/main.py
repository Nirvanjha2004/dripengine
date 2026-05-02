from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# We will uncomment these as we build out the respective files in the routes directory
# from src.routes import enroll, events, unenroll

app = FastAPI(
    title="DripEngine API",
    description="Ingestion layer for the DripEngine sequence scheduler.",
    version="0.1.0",
    docs_url="/docs",
    redoc_url=None,
)

# Configure CORS
# For self-hosting, we allow all origins by default. This can be restricted via env vars later.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], 
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health", tags=["System"])
async def health_check():
    """
    Standard health check endpoint. 
    Useful for Docker/docker-compose to verify the ingestion layer is up.
    """
    return {
        "status": "healthy",
        "service": "dripengine-api",
        "message": "Ingestion layer is running and ready."
    }

# Route Registration
# This wires up the isolated route files to the main application
# app.include_router(enroll.router, prefix="/api/v1/enroll", tags=["Enrollment"])
# app.include_router(events.router, prefix="/api/v1/event", tags=["Events"])
# app.include_router(unenroll.router, prefix="/api/v1/unenroll", tags=["Enrollment"])