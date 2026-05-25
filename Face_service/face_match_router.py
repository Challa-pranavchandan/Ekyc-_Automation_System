"""
face_match_router.py — FastAPI router for the face match endpoint.

HOW EXPRESS CALLS THIS:
    Express backend sends a POST request to:
        http://localhost:8001/face-match/compare

    With JSON body:
        {
            "selfie_url": "https://res.cloudinary.com/...",
            "id_photo_url": "https://res.cloudinary.com/...",
            "document_type": "aadhaar",
            "application_id": "64abc123...",
            "threshold": 0.75  ← optional
        }

    FastAPI validates and routes to face_match_service.match_faces()
"""

from fastapi import APIRouter, HTTPException
from schemas.face_match_schema import FaceMatchRequest, FaceMatchResponse
from services.face_match_service import match_faces

# All routes here are prefixed with /face-match
router = APIRouter(prefix="/face-match", tags=["Face Match"])


@router.post(
    "/compare",
    response_model=FaceMatchResponse,
    summary="Compare selfie against identity document photo",
    description="""
    Compares a live selfie with the photo on an identity document.
    Uses DeepFace (VGG-Face model) with cosine similarity.
    Returns a similarity score and pass/fail decision.
    """
)
async def face_match_endpoint(request: FaceMatchRequest):
    """
    POST /face-match/compare

    Runs face matching between selfie and ID document photo.

    Args:
        request: FaceMatchRequest (auto-parsed by FastAPI from JSON body)

    Returns:
        FaceMatchResponse: Match result with score and pass/fail.
    """
    print(f"[FaceMatchRouter] Match requested for application: {request.application_id}, doc type: {request.document_type}")

    # Call the service — pass through the optional threshold override
    result = await match_faces(
        selfie_url=request.selfie_url,
        id_photo_url=request.id_photo_url,
        document_type=request.document_type,
        threshold_override=request.threshold,
    )

    if result is None:
        raise HTTPException(
            status_code=500,
            detail="Face match service returned no result"
        )

    return result


@router.get(
    "/health",
    summary="Health check for face match service"
)
async def face_match_health():
    """
    GET /face-match/health

    Simple health check for the face match service.
    """
    return {"status": "ok", "service": "face_match"}
