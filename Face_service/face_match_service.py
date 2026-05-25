"""
face_match_service.py — Face matching logic using DeepFace.

WHAT IS FACE MATCHING?
    Face matching compares two images to determine if they show the same person.
    In eKYC:
        Image 1 = selfie captured live from camera
        Image 2 = photo on the identity document (Aadhaar / Passport)

    If the faces match → the person is who they claim to be.

HOW DEEPFACE WORKS:
    DeepFace is a Python library that wraps multiple face recognition models:
        - VGG-Face  : Accurate, widely used, good for ID photos
        - Facenet   : Google's model, very accurate on clear photos
        - ArcFace   : State of the art, best for eKYC use cases
        - DeepFace  : Facebook's original model

    PIPELINE:
        1. Face Detection   → Find and crop the face region in the image
        2. Alignment        → Rotate/scale the face to a standard orientation
        3. Feature Extraction → Run the face through a neural network
                                to get a 128/512-dimensional "face embedding"
                                (a vector of numbers representing the face)
        4. Distance Calculation → Measure how different the two embeddings are
                                  using cosine similarity or euclidean distance

    DISTANCE → SCORE CONVERSION:
        DeepFace gives a "distance" (lower = more similar).
        We convert it to a "score" (higher = more similar) like this:
            score = 1 - (distance / max_possible_distance)
        This makes it intuitive: score close to 1.0 = very similar faces.

DOCUMENT FACE EXTRACTION:
    ID documents have a face photo in a specific region.
    We use DeepFace's built-in detector to find the face in the document photo.
    DeepFace handles this automatically with enforce_detection=True.
"""

import cv2               # OpenCV — image processing
import numpy as np       # NumPy — array operations
import requests          # requests — download images from Cloudinary
from io import BytesIO   # BytesIO — in-memory file handling
from PIL import Image    # Pillow — image format handling
import tempfile          # tempfile — create temporary files for DeepFace
import os                # os — file operations

# DeepFace — main face recognition library
# We import only what we need to keep startup time fast
from deepface import DeepFace

from core.config import settings


# ─── DeepFace Model Configuration ────────────────────────────────────────────
# We use VGG-Face as the default model because:
# - It's well tested for ID document matching
# - Good balance of speed and accuracy
# - Works well even with lower quality document photos
#
# Available models: "VGG-Face", "Facenet", "Facenet512", "ArcFace", "DeepFace"
# For higher security, consider "ArcFace" (most accurate but slower)
DEEPFACE_MODEL = "VGG-Face"

# Distance metric for comparing face embeddings
# "cosine" works well for VGG-Face
# Other options: "euclidean", "euclidean_l2"
DISTANCE_METRIC = "cosine"

# Maximum possible cosine distance (used for score normalization)
# Cosine distance range is 0-2, but in practice rarely exceeds 1.0
MAX_COSINE_DISTANCE = 1.0


def download_image_to_temp(image_url: str) -> str:
    """
    Download an image from a URL and save it to a temporary file on disk.

    WHY TEMP FILES?
        DeepFace works best with file paths rather than NumPy arrays
        because it needs to run its own internal face detection pipeline.
        Saving to a temp file is the most reliable approach.

    Args:
        image_url: Cloudinary HTTPS URL of the image.

    Returns:
        Path to the temporary file on disk (e.g. /tmp/tmpXXXXXX.jpg)

    Raises:
        ValueError: If download fails.
    """
    # Download image from Cloudinary
    response = requests.get(image_url, timeout=15)
    if response.status_code != 200:
        raise ValueError(f"Failed to download image from URL. HTTP {response.status_code}")

    # Determine file extension from Content-Type header
    # e.g. "image/jpeg" → ".jpg", "image/png" → ".png"
    content_type = response.headers.get("Content-Type", "image/jpeg")
    ext = ".jpg" if "jpeg" in content_type else ".png"

    # Create a named temporary file that persists until we delete it
    # delete=False means the file won't be auto-deleted when closed
    temp_file = tempfile.NamedTemporaryFile(suffix=ext, delete=False)
    temp_file.write(response.content)
    temp_file.close()

    return temp_file.name  # Return file path e.g. "/tmp/tmpABC123.jpg"


def cleanup_temp_file(file_path: str):
    """
    Delete a temporary file after we're done with it.
    Always called in a finally block to prevent disk space leaks.

    Args:
        file_path: Path to the temp file to delete.
    """
    try:
        if file_path and os.path.exists(file_path):
            os.remove(file_path)
    except Exception as e:
        # Non-critical — log but don't crash
        print(f"[FaceMatchService] Could not delete temp file {file_path}: {e}")


def convert_distance_to_score(distance: float) -> float:
    """
    Convert DeepFace distance to an intuitive similarity score.

    DeepFace distance:  0.0 = identical faces, higher = more different
    Our score:          1.0 = identical faces, lower = more different

    Formula: score = 1.0 - (distance / MAX_COSINE_DISTANCE)
    Clamped to [0.0, 1.0] to handle edge cases.

    Examples:
        distance 0.0 → score 1.0 (identical)
        distance 0.3 → score 0.7 (good match)
        distance 0.6 → score 0.4 (weak match)
        distance 1.0 → score 0.0 (completely different)

    Args:
        distance: Raw DeepFace cosine distance.

    Returns:
        Similarity score between 0.0 and 1.0.
    """
    score = 1.0 - (distance / MAX_COSINE_DISTANCE)
    return round(max(0.0, min(1.0, score)), 4)  # clamp to [0, 1]


async def match_faces(
    selfie_url: str,
    id_photo_url: str,
    document_type: str,
    threshold_override: float = None
) -> dict:
    """
    Main face matching function.
    Downloads both images, runs DeepFace comparison, returns result.

    PROCESS:
        1. Download selfie to temp file
        2. Download ID document photo to temp file
        3. Run DeepFace.verify() to compare the two faces
        4. Convert distance to score
        5. Apply threshold to get pass/fail
        6. Clean up temp files
        7. Return result

    Args:
        selfie_url      : Cloudinary URL of the live selfie.
        id_photo_url    : Cloudinary URL of the identity document.
        document_type   : "aadhaar", "pan", or "passport".
        threshold_override: Optional custom threshold (uses .env default if None).

    Returns:
        Dictionary matching FaceMatchResponse schema.
    """
    # Track temp file paths so we can clean them up in finally block
    selfie_temp_path = None
    id_photo_temp_path = None

    # Use override threshold if provided, otherwise use config value
    threshold = threshold_override if threshold_override is not None else settings.FACE_MATCH_THRESHOLD

    try:
        # ── Step 1: Download both images to temp files ─────────────────────────
        print(f"[FaceMatchService] Downloading selfie from Cloudinary...")
        selfie_temp_path = download_image_to_temp(selfie_url)

        print(f"[FaceMatchService] Downloading ID photo from Cloudinary...")
        id_photo_temp_path = download_image_to_temp(id_photo_url)

        # ── Step 2: Run DeepFace face verification ─────────────────────────────
        # DeepFace.verify() does the full pipeline:
        #   detect faces → align → extract embeddings → calculate distance
        #
        # enforce_detection=True means DeepFace will raise an exception if
        # it can't find a face in either image. We catch this below.
        #
        # detector_backend="opencv" is fast and works well for clear photos.
        # Other options: "retinaface" (more accurate), "mtcnn" (balanced)
        print(f"[FaceMatchService] Running DeepFace verification...")
        result = DeepFace.verify(
            img1_path=selfie_temp_path,
            img2_path=id_photo_temp_path,
            model_name=DEEPFACE_MODEL,
            distance_metric=DISTANCE_METRIC,
            enforce_detection=True,     # Raise error if no face found
            detector_backend="opencv",
            align=True,                 # Align faces before comparison (improves accuracy)
        )

        # ── Step 3: Extract results from DeepFace output ──────────────────────
        # DeepFace.verify() returns a dict like:
        # {
        #   "verified": True/False,    ← based on DeepFace's own threshold
        #   "distance": 0.234,         ← cosine distance between embeddings
        #   "threshold": 0.40,         ← DeepFace's internal threshold
        #   "model": "VGG-Face",
        #   "detector_backend": "opencv",
        #   "similarity_metric": "cosine",
        # }
        raw_distance = result.get("distance", 1.0)

        # ── Step 4: Convert distance to our score ──────────────────────────────
        similarity_score = convert_distance_to_score(raw_distance)

        # ── Step 5: Apply OUR threshold (not DeepFace's default) ──────────────
        # We use our own threshold from config for consistency across all checks
        passed = similarity_score >= threshold

        print(f"[FaceMatchService] Score: {similarity_score}, Threshold: {threshold}, Passed: {passed}")

        return {
            "pass_check": passed,
            "score": similarity_score,
            "distance": round(raw_distance, 4),
            "threshold_used": threshold,
            "model_used": DEEPFACE_MODEL,
            "selfie_face_found": True,
            "id_face_found": True,
            "failure_reason": None if passed else f"Face similarity {similarity_score:.2f} below threshold {threshold}",
        }

    except ValueError as e:
        # DeepFace raises ValueError when no face is found in one of the images
        error_msg = str(e).lower()

        # Determine which image had the issue for a helpful error message
        selfie_face_found = "img1" not in error_msg and "first" not in error_msg
        id_face_found = "img2" not in error_msg and "second" not in error_msg

        print(f"[FaceMatchService] Face not found: {e}")
        return {
            "pass_check": False,
            "score": 0.0,
            "distance": 1.0,
            "threshold_used": threshold,
            "model_used": DEEPFACE_MODEL,
            "selfie_face_found": selfie_face_found,
            "id_face_found": id_face_found,
            "failure_reason": f"Face detection failed: {str(e)}",
        }

    except Exception as e:
        # Unexpected error — log and return safe failure response
        print(f"[FaceMatchService] Unexpected error: {e}")
        return {
            "pass_check": False,
            "score": 0.0,
            "distance": 1.0,
            "threshold_used": threshold,
            "model_used": DEEPFACE_MODEL,
            "selfie_face_found": False,
            "id_face_found": False,
            "failure_reason": "Internal face match error",
        }

    finally:
        # ── Always clean up temp files ─────────────────────────────────────────
        # This runs whether the try block succeeded or raised an exception
        # Prevents accumulation of temp files on the server disk
        cleanup_temp_file(selfie_temp_path)
        cleanup_temp_file(id_photo_temp_path)
        print(f"[FaceMatchService] Temp files cleaned up")
