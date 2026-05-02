from fastapi import Request, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.base import BaseHTTPMiddleware
import os
import secrets

UNPROTECTED_ROUTES = {"/health", "/docs", "/openapi.json", "/redoc"}

security = HTTPBearer()


class AuthMiddleware(BaseHTTPMiddleware):
    """
    Checks every incoming request for a valid API key.

    Expected header:
        Authorization: Bearer <your-api-key>

    The key is compared against API_SECRET_KEY in your .env using
    secrets.compare_digest — this is timing-safe comparison, meaning
    it takes the same amount of time whether the key is wrong by
    1 character or 100. Prevents timing attacks.

    Routes in UNPROTECTED_ROUTES skip the check entirely —
    so /health and /docs are always accessible.
    """

    async def dispatch(self, request: Request, call_next):
        if request.url.path in UNPROTECTED_ROUTES:
            return await call_next(request)

        auth_header = request.headers.get("Authorization")

        if not auth_header:
            raise HTTPException(
                status_code=401,
                detail="Missing Authorization header. Expected: Bearer <api-key>",
            )

        parts = auth_header.split()
        if len(parts) != 2 or parts[0].lower() != "bearer":
            raise HTTPException(
                status_code=401,
                detail="Invalid Authorization format. Expected: Bearer <api-key>",
            )

        provided_key = parts[1]
        expected_key = os.getenv("API_SECRET_KEY", "")

        if not expected_key:
            raise HTTPException(
                status_code=500,
                detail="API_SECRET_KEY is not set on the server.",
            )

        # Timing-safe comparison — never use == for secrets
        if not secrets.compare_digest(provided_key, expected_key):
            raise HTTPException(
                status_code=403,
                detail="Invalid API key.",
            )

        return await call_next(request)
        