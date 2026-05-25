"""
liveness_service.py — Core liveness detection logic using MediaPipe.

WHAT IS LIVENESS DETECTION?
    Liveness detection checks whether the person in front of the camera is
    a real human being, not a printed photo or a screen replay (spoof attack).

HOW IT WORKS (our approach):
    We use MediaPipe Face Mesh, which detects 468 facial landmarks (key points)
    on the face. From these landmarks we:

    1. EAR CHECK (Eye Aspect Ratio):
       - Calculates how open/closed each eye is using landmark coordinates.
       - A real person's eyes have natural variation in openness.
       - A printed photo has fixed, unchanging eye openness.
       - If EAR is in a natural range → real person signal.

    2. FACIAL GEOMETRY CHECK:
       - Checks face width-to-height ratio (aspect ratio).
       - Checks symmetry between left and right sides of face.
       - A real 3D face has natural proportions.
       - A flat photo held at an angle looks distorted.

    3. LANDMARK CONFIDENCE CHECK:
       - MediaPipe gives a confidence score for each landmark detection.
       - Real faces produce high-confidence detections across all landmarks.
       - Spoofs (photos of photos) produce lower confidence.

    COMBINED SCORE:
       All three signals are weighted and combined into a final score 0-1.
       Score >= threshold (default 0.6) → PASS (real person)
       Score <  threshold              → FAIL (possible spoof)

LIMITATIONS:
    - Single image liveness is less accurate than video-based liveness.
    - For production, consider adding video-based challenge-response
      (e.g. blink, turn head) using multiple frames.
"""

import cv2               # OpenCV — image reading and processing
import numpy as np       # NumPy — numerical operations on arrays
import mediapipe as mp   # MediaPipe — face mesh landmark detection
import requests          # requests — download image from Cloudinary URL
from io import BytesIO   # BytesIO — convert bytes to file-like object
from PIL import Image    # Pillow — image format conversion

from core.config import settings


# ─── MediaPipe Setup ──────────────────────────────────────────────────────────
# MediaPipe FaceMesh detects 468 3D facial landmarks on a face.
# static_image_mode=True means we're processing individual images (not video).
# max_num_faces=1 because KYC selfie should only have one face.
# refine_landmarks=True adds extra landmarks around eyes and lips for better EAR.
# min_detection_confidence=0.5 means MediaPipe needs 50%+ confidence to report a face.
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    static_image_mode=True,
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5
)


# ─── MediaPipe Face Detection (for face presence check) ───────────────────────
# Separate from FaceMesh — used just to check if a face exists at all
# and to get a quick confidence score.
mp_face_detection = mp.solutions.face_detection
face_detector = mp_face_detection.FaceDetection(
    model_selection=1,           # model 1 = full range (better for selfies)
    min_detection_confidence=0.5
)


# ─── EAR Landmark Indices ─────────────────────────────────────────────────────
# These are the specific landmark point indices for eye corners and edges.
# MediaPipe FaceMesh uses a fixed numbering for all 468 landmarks.
# Reference: https://mediapipe.dev/solutions/face_mesh

# Left eye landmarks (6 points forming the eye outline)
LEFT_EYE_INDICES = [362, 385, 387, 263, 373, 380]

# Right eye landmarks (6 points forming the eye outline)
RIGHT_EYE_INDICES = [33, 160, 158, 133, 153, 144]


def download_image(image_url: str) -> np.ndarray:
    """
    Download an image from a URL (Cloudinary) and convert it to
    an OpenCV-compatible NumPy array (BGR format).

    Why BGR?
        OpenCV uses BGR color order internally (not RGB like most libraries).
        MediaPipe expects RGB, so we convert before passing to MediaPipe.

    Args:
        image_url: Cloudinary HTTPS URL of the image.

    Returns:
        NumPy array of shape (height, width, 3) in BGR format.

    Raises:
        ValueError: If download fails or image cannot be decoded.
    """
    # Download the image bytes from Cloudinary
    response = requests.get(image_url, timeout=15)
    if response.status_code != 200:
        raise ValueError(f"Failed to download image. HTTP {response.status_code}")

    # Convert raw bytes → PIL Image → NumPy array
    pil_image = Image.open(BytesIO(response.content)).convert("RGB")
    np_image = np.array(pil_image)

    # Convert RGB → BGR for OpenCV compatibility
    bgr_image = cv2.cvtColor(np_image, cv2.COLOR_RGB2BGR)
    return bgr_image


def calculate_ear(landmarks, eye_indices: list, image_width: int, image_height: int) -> float:
    """
    Calculate Eye Aspect Ratio (EAR) for one eye.

    EAR FORMULA:
        EAR = (|p2-p6| + |p3-p5|) / (2 * |p1-p4|)

        Where p1-p6 are the 6 eye landmark points:
        p1, p4 = horizontal corners (left and right)
        p2, p6 = upper and lower points near inner corner
        p3, p5 = upper and lower points near outer corner

    INTERPRETATION:
        - EAR ≈ 0.25-0.35 → eye is naturally open (real person range)
        - EAR ≈ 0.0-0.15  → eye is closed (blink) OR very sleepy
        - EAR ≈ 0.40+     → eye unusually wide open (possible photo with wide eyes)

    A real person's EAR naturally falls in the 0.2-0.35 range.
    A printed photo usually has a fixed EAR that's either too high or too low.

    Args:
        landmarks: MediaPipe normalized landmark list.
        eye_indices: List of 6 landmark indices for the eye.
        image_width: Image width in pixels (for denormalization).
        image_height: Image height in pixels (for denormalization).

    Returns:
        EAR value as a float.
    """
    # Extract the 6 eye landmark coordinates
    # MediaPipe gives normalized coords (0-1), so multiply by image dimensions
    points = []
    for idx in eye_indices:
        lm = landmarks[idx]
        x = lm.x * image_width
        y = lm.y * image_height
        points.append((x, y))

    # p1=points[0], p2=points[1], p3=points[2], p4=points[3], p5=points[4], p6=points[5]
    # Vertical distances
    vertical_1 = np.linalg.norm(np.array(points[1]) - np.array(points[5]))
    vertical_2 = np.linalg.norm(np.array(points[2]) - np.array(points[4]))

    # Horizontal distance
    horizontal = np.linalg.norm(np.array(points[0]) - np.array(points[3]))

    # Avoid division by zero
    if horizontal == 0:
        return 0.0

    ear = (vertical_1 + vertical_2) / (2.0 * horizontal)
    return float(ear)


def check_facial_geometry(landmarks, image_width: int, image_height: int) -> float:
    """
    Check facial geometry proportions to detect spoofing.

    WHAT WE CHECK:
        1. Face aspect ratio: width vs height should be in natural range (0.6-0.9)
           A face held at an angle (photo spoof) often has a distorted aspect ratio.

        2. Eye symmetry: left and right eye EAR should be similar.
           A real face has roughly symmetric eyes.
           A tilted photo of a photo has asymmetric eye appearance.

    Args:
        landmarks: MediaPipe normalized landmark list.
        image_width: Image width in pixels.
        image_height: Image height in pixels.

    Returns:
        Geometry score between 0.0 and 1.0.
        Higher = more natural/real geometry.
    """
    # ── Face bounding box from landmarks ──────────────────────────────────────
    # Get all x and y coordinates to find face boundaries
    xs = [lm.x * image_width for lm in landmarks]
    ys = [lm.y * image_height for lm in landmarks]

    face_width = max(xs) - min(xs)
    face_height = max(ys) - min(ys)

    # Avoid division by zero
    if face_height == 0:
        return 0.0

    # Check 1: Face aspect ratio
    # Normal human face aspect ratio is roughly 0.6 to 0.85
    aspect_ratio = face_width / face_height
    if 0.55 <= aspect_ratio <= 0.90:
        aspect_score = 1.0   # natural proportions
    elif 0.45 <= aspect_ratio <= 1.0:
        aspect_score = 0.6   # slightly off but acceptable
    else:
        aspect_score = 0.2   # very distorted — likely spoof

    # Check 2: Eye symmetry
    # Calculate EAR for both eyes and compare
    left_ear = calculate_ear(landmarks, LEFT_EYE_INDICES, image_width, image_height)
    right_ear = calculate_ear(landmarks, RIGHT_EYE_INDICES, image_width, image_height)

    # Symmetry = 1 - normalized difference between left and right EAR
    # If both EARs are equal → symmetry = 1.0 (perfect)
    # If very different → symmetry close to 0
    ear_diff = abs(left_ear - right_ear)
    ear_avg = (left_ear + right_ear) / 2 if (left_ear + right_ear) > 0 else 1
    symmetry_score = max(0.0, 1.0 - (ear_diff / ear_avg)) if ear_avg > 0 else 0.0

    # Combine: aspect ratio (60% weight) + symmetry (40% weight)
    geometry_score = (aspect_score * 0.6) + (symmetry_score * 0.4)
    return round(geometry_score, 4)


def check_ear_naturalness(landmarks, image_width: int, image_height: int) -> float:
    """
    Check if eye openness (EAR) falls in the natural human range.

    A real person's eyes are naturally open when taking a selfie.
    EAR in range 0.20-0.38 → natural → high score
    EAR outside this range → possibly a spoof photo

    Args:
        landmarks: MediaPipe normalized landmark list.
        image_width: Image width in pixels.
        image_height: Image height in pixels.

    Returns:
        EAR naturalness score between 0.0 and 1.0.
    """
    left_ear = calculate_ear(landmarks, LEFT_EYE_INDICES, image_width, image_height)
    right_ear = calculate_ear(landmarks, RIGHT_EYE_INDICES, image_width, image_height)

    # Average EAR across both eyes
    avg_ear = (left_ear + right_ear) / 2

    # Score based on how natural the EAR range is
    if 0.20 <= avg_ear <= 0.38:
        # Perfect natural range — likely a real person
        ear_score = 1.0
    elif 0.15 <= avg_ear <= 0.45:
        # Slightly outside range — could be real but unusual
        ear_score = 0.65
    else:
        # Very abnormal — strong spoof indicator
        ear_score = 0.2

    return round(ear_score, 4)


async def check_liveness(selfie_url: str) -> dict:
    """
    Main liveness detection function.
    Downloads the selfie and runs all three checks.

    SCORING WEIGHTS:
        - EAR naturalness   : 35% — eye openness naturalness
        - Facial geometry   : 40% — face proportions and symmetry
        - Detection confidence: 25% — MediaPipe's own confidence in the detection

    Args:
        selfie_url: Cloudinary URL of the selfie image.

    Returns:
        Dictionary with all liveness results matching LivenessResponse schema.
    """
    try:
        # ── Step 1: Download image ─────────────────────────────────────────────
        bgr_image = download_image(selfie_url)
        image_height, image_width = bgr_image.shape[:2]

        # Convert BGR → RGB for MediaPipe (MediaPipe expects RGB)
        rgb_image = cv2.cvtColor(bgr_image, cv2.COLOR_BGR2RGB)

        # ── Step 2: Detect face presence ──────────────────────────────────────
        # First check: does the image even contain a face?
        detection_results = face_detector.process(rgb_image)

        if not detection_results.detections:
            # No face found at all → cannot do liveness
            return {
                "pass_check": False,
                "score": 0.0,
                "method": "mediapipe_face_mesh",
                "spoofing_detected": False,
                "failure_reason": "No face detected in the image",
                "face_detected": False,
            }

        # Get MediaPipe's confidence in detecting the face
        # This is the detector's own confidence, separate from our analysis
        detection_confidence = detection_results.detections[0].score[0]

        # ── Step 3: Run FaceMesh for landmark detection ────────────────────────
        # FaceMesh gives us all 468 landmark points
        mesh_results = face_mesh.process(rgb_image)

        if not mesh_results.multi_face_landmarks:
            # FaceMesh couldn't map landmarks (face too small/blurry/angled)
            return {
                "pass_check": False,
                "score": 0.2,
                "method": "mediapipe_face_mesh",
                "spoofing_detected": True,
                "failure_reason": "Could not map facial landmarks — image may be a spoof",
                "face_detected": True,
            }

        # Get the first (and only) face's landmarks
        face_landmarks = mesh_results.multi_face_landmarks[0].landmark

        # ── Step 4: Run our three analysis checks ─────────────────────────────
        ear_score = check_ear_naturalness(face_landmarks, image_width, image_height)
        geometry_score = check_facial_geometry(face_landmarks, image_width, image_height)

        # Normalize detection confidence to 0-1 (it's already 0-1 from MediaPipe)
        confidence_score = float(detection_confidence)

        # ── Step 5: Combine into final score ──────────────────────────────────
        # Weighted combination of all three signals
        final_score = (
            ear_score * 0.35 +           # 35% weight on EAR
            geometry_score * 0.40 +      # 40% weight on geometry
            confidence_score * 0.25      # 25% weight on detection confidence
        )
        final_score = round(final_score, 4)

        # ── Step 6: Apply threshold ────────────────────────────────────────────
        passed = final_score >= settings.LIVENESS_THRESHOLD
        spoofing_detected = not passed and final_score < 0.4

        return {
            "pass_check": passed,
            "score": final_score,
            "method": "mediapipe_face_mesh",
            "spoofing_detected": spoofing_detected,
            "failure_reason": None if passed else f"Liveness score {final_score} below threshold {settings.LIVENESS_THRESHOLD}",
            "face_detected": True,
        }

    except ValueError as e:
        # Image download or format error
        return {
            "pass_check": False,
            "score": 0.0,
            "method": "mediapipe_face_mesh",
            "spoofing_detected": False,
            "failure_reason": str(e),
            "face_detected": False,
        }
    except Exception as e:
        # Unexpected error — log and return safe failure
        print(f"[LivenessService] Unexpected error: {e}")
        return {
            "pass_check": False,
            "score": 0.0,
            "method": "mediapipe_face_mesh",
            "spoofing_detected": False,
            "failure_reason": "Internal liveness check error",
            "face_detected": False,
        }
