"""
face_match_schema.py — Pydantic models for face match request and response.

Face match compares two images:
  1. selfie_url  — live photo captured from camera (uploaded to Cloudinary by Express)
  2. id_photo_url — photo extracted from the identity document (Aadhaar/Passport)

The service checks if both images are of the same person.
"""

from pydantic import BaseModel, Field
from typing import Optional


class FaceMatchRequest(BaseModel):
    """
    Data that Express sends to FastAPI for face matching.

    Fields:
        selfie_url   : Cloudinary URL of the captured selfie.
        id_photo_url : Cloudinary URL of the identity document image.
                       FastAPI will crop/extract the face from this document photo.
        document_type: Type of ID document — helps FastAPI know where to look
                       for the face on the document (e.g. top-right for Aadhaar).
        application_id: For logging/tracing only.
        threshold    : Optional override for the match threshold.
                       If not provided, uses the value from .env (default 0.75).
    """

    selfie_url: str = Field(
        ...,
        description="Cloudinary URL of the live selfie"
    )

    id_photo_url: str = Field(
        ...,
        description="Cloudinary URL of the identity document"
    )

    document_type: str = Field(
        ...,
        description="Type of document: aadhaar, pan, passport"
    )

    application_id: str = Field(
        ...,
        description="KYC Application ID for tracing"
    )

    threshold: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Optional custom threshold override (0-1)"
    )


class FaceMatchResponse(BaseModel):
    """
    What FastAPI returns to Express after face match.

    Fields:
        pass_check       : True if faces match, False if they don't.
        score            : Similarity score between 0.0 and 1.0.
                           Higher = more similar faces.
        distance         : Raw DeepFace distance (lower = more similar).
                           Kept for debugging/audit purposes.
        threshold_used   : The threshold that was applied for pass/fail decision.
        model_used       : Which DeepFace model was used (e.g. "VGG-Face").
        selfie_face_found: Whether a face was detected in the selfie.
        id_face_found    : Whether a face was detected in the ID document.
        failure_reason   : Human-readable reason if match failed. None if passed.
    """

    pass_check: bool = Field(description="True if faces match")
    score: float = Field(ge=0.0, le=1.0, description="Similarity score 0-1")
    distance: float = Field(description="Raw DeepFace distance value")
    threshold_used: float = Field(description="Threshold applied for decision")
    model_used: str = Field(description="DeepFace model used for comparison")
    selfie_face_found: bool = Field(description="Face detected in selfie")
    id_face_found: bool = Field(description="Face detected in ID document")
    failure_reason: Optional[str] = Field(default=None, description="Reason for failure")
