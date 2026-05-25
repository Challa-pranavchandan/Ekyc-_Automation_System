"""
config.py — Application configuration using Pydantic Settings.

Pydantic Settings reads values from the .env file automatically.
Any variable defined here maps directly to a key in .env.
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """
    All environment variables for the Face Service.
    BaseSettings auto-reads from .env file.
    If a variable is missing from .env, the default value is used.
    """

    # Server config
    PORT: int = 8001
    ENVIRONMENT: str = "development"

    # CORS — which origins are allowed to call this service
    # In production this should be your Express backend URL only
    ALLOWED_ORIGINS: str = "http://localhost:8000"

    # Face match threshold:
    # DeepFace returns a distance value (lower = more similar)
    # We convert it to a similarity score (0-1, higher = more similar)
    # If score >= threshold → faces match
    FACE_MATCH_THRESHOLD: float = 0.75

    # Liveness threshold:
    # If liveness score >= threshold → person is real (not a photo/spoof)
    LIVENESS_THRESHOLD: float = 0.6

    class Config:
        # Tell Pydantic where to find the .env file
        env_file = ".env"
        case_sensitive = True


# Create a single shared instance used across the entire app
# Import this wherever you need config values:
# from core.config import settings
settings = Settings()
