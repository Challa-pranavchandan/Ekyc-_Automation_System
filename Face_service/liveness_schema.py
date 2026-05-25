"""
liveness_schema.py — Pydantic models for liveness check request and response.

Pydantic models in FastAPI serve two purposes:
1. REQUEST validation  — FastAPI automatically validates incoming JSON against these models.
                         If a required field is missing or wrong type, FastAPI returns 422.
2. RESPONSE serialization — Ensures the response JSON always has the correct shape.

Think of these like TypeScript interfaces but with runtime validation built in.
"""

from pydantic import BaseModel, Field, HttpUrl
from typing import Optional


class LivenessRequest(BaseModel):
    """
    Data that Express backend sends to FastAPI for liveness check.

    Fields:
        selfie_url  : Cloudinary URL of the captured selfie image.
                      FastAPI will download and analyze this image.
        application_id : KYC application ID — used for logging/tracing only.
                         Not used in the actual liveness computation.
    """

    selfie_url: str = Field(
        ...,  # '...' means this field is required (no default)
        description="Cloudinary URL of the selfie image"
    )

    application_id: str = Field(
        ...,
        description="KYC Application ID for tracing"
    )


class LivenessResponse(BaseModel):
    """
    What FastAPI returns to Express after liveness check.

    Fields:
        pass_check      : True if person is real, False if spoof detected.
        score           : Confidence score between 0.0 and 1.0.
                          Higher = more confident the person is real.
        method          : Which detection method was used.
        spoofing_detected: True if a printed photo / screen replay was detected.
        failure_reason  : Human-readable reason if check failed. None if passed.
        face_detected   : Whether a face was found in the image at all.
    """

    pass_check: bool = Field(description="True if liveness passed")
    score: float = Field(ge=0.0, le=1.0, description="Liveness confidence score 0-1")
    method: str = Field(description="Detection method used")
    spoofing_detected: bool = Field(description="True if spoofing was detected")
    failure_reason: Optional[str] = Field(default=None, description="Reason for failure if any")
    face_detected: bool = Field(description="Whether a face was found in the image")
