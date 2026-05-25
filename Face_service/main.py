"""
main.py — FastAPI application entry point.

This is where the FastAPI app is created and configured.
Similar to app.js in Express — sets up middleware, mounts routers,
and defines global error handling.

HOW TO RUN:
    Development:
        uvicorn main:app --reload --port 8001

    Production:
        uvicorn main:app --host 0.0.0.0 --port 8001 --workers 2

    The Express backend calls this service at:
        http://localhost:8001

AUTO-GENERATED DOCS:
    FastAPI auto-generates interactive API docs at:
        http://localhost:8001/docs      ← Swagger UI
        http://localhost:8001/redoc     ← ReDoc UI
    Very useful for testing endpoints without Postman.
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from dotenv import load_dotenv
import time

# Load .env file before anything else
# This ensures all environment variables are available when config.py loads
load_dotenv()

from core.config import settings
from routers.liveness_router import router as liveness_router
from routers.face_match_router import router as face_match_router


# ─── Create FastAPI App ───────────────────────────────────────────────────────
# title and description appear in the auto-generated /docs page
app = FastAPI(
    title="eKYC Face Service",
    description="Liveness detection and face matching microservice for eKYC",
    version="1.0.0",
    # In production, disable docs to avoid exposing the API
    docs_url="/docs" if settings.ENVIRONMENT == "development" else None,
    redoc_url="/redoc" if settings.ENVIRONMENT == "development" else None,
)


# ─── CORS Middleware ──────────────────────────────────────────────────────────
# CORS controls which origins (domains) can call this API.
# We only allow our Express backend — not the browser directly.
# The browser calls Express, Express calls FastAPI.
#
# allow_origins: list of allowed origins from ALLOWED_ORIGINS env variable
# allow_methods: only POST and GET needed for our endpoints
# allow_headers: Content-Type needed for JSON body
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type", "Authorization"],
)


# ─── Request Timing Middleware ────────────────────────────────────────────────
# Logs how long each request takes — useful for performance monitoring.
# Face operations can be slow (1-5 seconds), so timing is important.
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    """
    Middleware that runs before and after every request.
    Adds X-Process-Time header to responses showing processing time in seconds.
    """
    start_time = time.time()
    response = await call_next(request)
    process_time = time.time() - start_time
    response.headers["X-Process-Time"] = str(round(process_time, 3))
    print(f"[{request.method}] {request.url.path} → {response.status_code} ({process_time:.3f}s)")
    return response


# ─── Global Exception Handler ─────────────────────────────────────────────────
# Catches any unhandled exception and returns a clean JSON error response.
# Prevents Python stack traces from leaking to the Express backend.
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Catches all unhandled exceptions.
    Returns a clean JSON error instead of a Python traceback.
    """
    print(f"[GlobalExceptionHandler] Unhandled error on {request.url.path}: {exc}")
    return JSONResponse(
        status_code=500,
        content={
            "success": False,
            "message": "Internal server error in face service",
            "detail": str(exc) if settings.ENVIRONMENT == "development" else "Contact support",
        }
    )


# ─── Mount Routers ────────────────────────────────────────────────────────────
# Register all routers with the app.
# Each router has its own prefix defined internally (/liveness, /face-match)
app.include_router(liveness_router)
app.include_router(face_match_router)


# ─── Root Health Check ────────────────────────────────────────────────────────
@app.get("/", tags=["Health"])
async def root():
    """
    GET /
    Root health check. Express can ping this to verify the service is alive.
    """
    return {
        "service": "eKYC Face Service",
        "status": "running",
        "version": "1.0.0",
        "environment": settings.ENVIRONMENT,
        "endpoints": {
            "liveness": "/liveness/check",
            "face_match": "/face-match/compare",
            "docs": "/docs",
        }
    }


# ─── Run directly (for development) ──────────────────────────────────────────
# This block only runs when you execute: python main.py
# For production, use: uvicorn main:app --host 0.0.0.0 --port 8001
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=settings.PORT,
        reload=settings.ENVIRONMENT == "development",  # auto-reload on code change
    )
