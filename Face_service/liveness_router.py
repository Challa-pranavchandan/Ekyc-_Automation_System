"""
liveness_router.py — FastAPI router for the liveness check endpoint.

WHAT IS A ROUTER?
    In FastAPI, a router is like an Express Router — it groups related
    endpoints together. This router handles everything under /liveness.

HOW EXPRESS CALLS THIS:
    Express backend sends a POST request to:
        http://localhost:8001/liveness/check

    With JSON body:
        {
            "selfie_url": "https://res.cloudinary.com/...",
            "application_id": "64abc123..."
        }

    FastAPI validates the body against LivenessRequest schema,
    runs the check, and returns a LivenessResponse JSON.
"""

from fastapi import APIRouter, HTTPException
from schemas.liveness_schema import LivenessRequest, LivenessResponse
from services.liveness_service import check_liveness

# Create a router instance
# prefix="/liveness" means all routes here start with /liveness
# tags=["Liveness"] groups these endpoints in the auto-generated API docs
router = APIRouter(prefix="/liveness", tags=["Liveness"])


@router.post(
    "/check",
    response_model=LivenessResponse,  # FastAPI validates response against this schema
    summary="Check liveness of a selfie image",
    description="""
    Analyzes a selfie image to determine if it's a real person or a spoof.
    Uses MediaPipe FaceMesh to check:
    - Eye Aspect Ratio (naturalness of eye openness)
    - Facial geometry (proportions and symmetry)
    - Detection confidence
    """
)
async def check_liveness_endpoint(request: LivenessRequest):
    """
    POST /liveness/check

    Receives a selfie URL, runs liveness detection, returns result.

    FastAPI automatically:
    - Parses the JSON body into a LivenessRequest object
    - Validates all required fields are present and correct types
    - Returns 422 Unprocessable Entity if validation fails
    - Serializes our return dict into LivenessResponse JSON

    Args:
        request: LivenessRequest object (auto-parsed from JSON body by FastAPI)

    Returns:
        LivenessResponse: Liveness check result.
    """
    print(f"[LivenessRouter] Check requested for application: {request.application_id}")

    # Call the service function — all logic is there
    result = await check_liveness(selfie_url=request.selfie_url)

    # If there's a critical internal error (not just a failed check),
    # raise HTTP 500. But normal fail results (spoof detected) return 200
    # with pass_check=False — that's not an error, it's a valid result.
    if result is None:
        raise HTTPException(
            status_code=500,
            detail="Liveness service returned no result"
        )

    return result


@router.get(
    "/health",
    summary="Health check for liveness service",
    description="Returns 200 if the liveness service is running correctly."
)
async def liveness_health():
    """
    GET /liveness/health

    Simple health check endpoint.
    Express backend can call this before sending a real request
    to verify the Python service is up and running.
    """
    return {"status": "ok", "service": "liveness"}
