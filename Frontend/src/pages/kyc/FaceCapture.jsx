// ============================================================
// FaceVerificationStep.jsx — Step 3 of KYC wizard
//
// Flow:
//   1. Open webcam via getUserMedia()
//   2. User clicks "Take Selfie" → captures a frame via canvas
//   3. Canvas converts to base64 JPEG → sent to /face/:id/upload-selfie
//   4. "Run Verification" button → POST /face/:id/verify
//   5. Display liveness + face match results
//   6. If both pass → enable Continue button
// ============================================================

import { useRef, useState, useCallback } from "react";
import faceService from "../../services/faceService";

const FaceVerificationStep = ({ applicationId, onComplete }) => {
    // Webcam and capture state
    const videoRef = useRef(null);
    const canvasRef = useRef(null);
    const [streaming, setStreaming] = useState(false);
    const [capturedImage, setCapturedImage] = useState(null); // base64 string
    const [selfieUploaded, setSelfieUploaded] = useState(false);

    // Verification result
    const [result, setResult] = useState(null);

    // Loading / error state
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // ── START CAMERA ──────────────────────────────────────────
    const startCamera = useCallback(async () => {
        setError("");
        try {
            // Request camera permission from browser
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "user" }, // prefer front camera
            });
            videoRef.current.srcObject = stream;
            setStreaming(true);
        } catch {
            setError(
                "Camera access denied. Please allow camera permission in your browser."
            );
        }
    }, []);

    // ── STOP CAMERA ───────────────────────────────────────────
    const stopCamera = useCallback(() => {
        const stream = videoRef.current?.srcObject;
        stream?.getTracks().forEach((track) => track.stop()); // release camera
        setStreaming(false);
    }, []);

    // ── CAPTURE FRAME ─────────────────────────────────────────
    // Draws the current video frame onto a hidden canvas, then reads it as base64
    const captureSelfie = useCallback(() => {
        const video = videoRef.current;
        const canvas = canvasRef.current;

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        // Draw the current video frame onto canvas
        canvas.getContext("2d").drawImage(video, 0, 0);

        // Export canvas as JPEG base64 (includes "data:image/jpeg;base64,..." prefix)
        const base64 = canvas.toDataURL("image/jpeg", 0.85); // 85% quality
        setCapturedImage(base64);
        stopCamera();
    }, [stopCamera]);

    // ── UPLOAD SELFIE ─────────────────────────────────────────
    const uploadSelfie = useCallback(async () => {
        if (!capturedImage) return;
        setLoading(true);
        setError("");
        try {
            await faceService.uploadSelfie(applicationId, capturedImage);
            setSelfieUploaded(true);
        } catch (err) {
            setError(err.response?.data?.message || "Upload failed");
        } finally {
            setLoading(false);
        }
    }, [applicationId, capturedImage]);

    // ── RUN VERIFICATION ──────────────────────────────────────
    const runVerification = useCallback(async () => {
        setLoading(true);
        setError("");
        try {
            const res = await faceService.runVerification(applicationId);
            setResult(res.data);
        } catch (err) {
            setError(err.response?.data?.message || "Verification failed");
        } finally {
            setLoading(false);
        }
    }, [applicationId]);

    // Both checks must pass for the user to continue
    const verificationPassed =
        result?.liveness?.pass && result?.faceMatch?.pass;

    return (
        <div className="step-card">
            <h2>Step 3 — Face Verification</h2>
            <p className="step-desc">
                Take a selfie for liveness check and face matching against your Aadhaar.
            </p>

            {error && <div className="error-banner">{error}</div>}

            {/* ── Camera / Captured Image ── */}
            <div className="camera-container">
                {/* Live video feed — hidden once captured */}
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    style={{ display: streaming ? "block" : "none" }}
                    className="video-feed"
                />

                {/* Hidden canvas used for frame capture */}
                <canvas ref={canvasRef} style={{ display: "none" }} />

                {/* Preview of captured selfie */}
                {capturedImage && !streaming && (
                    <img src={capturedImage} alt="Captured selfie" className="selfie-preview" />
                )}

                {/* Placeholder before camera starts */}
                {!streaming && !capturedImage && (
                    <div className="camera-placeholder">
                        <span>📷</span>
                        <p>Click "Start Camera" to begin</p>
                    </div>
                )}
            </div>

            {/* ── Action Buttons ── */}
            <div className="camera-actions">
                {!streaming && !capturedImage && (
                    <button className="btn btn-outline" onClick={startCamera}>
                        Start Camera
                    </button>
                )}

                {streaming && (
                    <button className="btn btn-primary" onClick={captureSelfie}>
                        📸 Take Selfie
                    </button>
                )}

                {capturedImage && !selfieUploaded && (
                    <>
                        <button
                            className="btn btn-outline"
                            onClick={() => {
                                setCapturedImage(null);
                                startCamera();
                            }}
                        >
                            Retake
                        </button>
                        <button
                            className="btn btn-primary"
                            onClick={uploadSelfie}
                            disabled={loading}
                        >
                            {loading ? "Uploading..." : "Upload Selfie"}
                        </button>
                    </>
                )}

                {selfieUploaded && !result && (
                    <button
                        className="btn btn-primary"
                        onClick={runVerification}
                        disabled={loading}
                    >
                        {loading ? "Verifying..." : "Run Verification"}
                    </button>
                )}
            </div>

            {/* ── Verification Results ── */}
            {result && (
                <div className="verification-results">
                    <h3>Verification Results</h3>

                    <div className="result-row">
                        <span>Liveness Check</span>
                        <span className={result.liveness?.pass ? "badge-green" : "badge-red"}>
                            {result.liveness?.pass ? "✓ Passed" : "✗ Failed"}
                        </span>
                    </div>

                    <div className="result-row">
                        <span>Face Match</span>
                        <span className={result.faceMatch?.pass ? "badge-green" : "badge-red"}>
                            {result.faceMatch?.pass ? "✓ Passed" : "✗ Failed"}
                        </span>
                    </div>

                    {/* Scores if available */}
                    {result.liveness?.score !== undefined && (
                        <p className="score-hint">
                            Liveness score: {(result.liveness.score * 100).toFixed(0)}%
                        </p>
                    )}
                    {result.faceMatch?.score !== undefined && (
                        <p className="score-hint">
                            Face match score: {(result.faceMatch.score * 100).toFixed(0)}%
                        </p>
                    )}

                    {!verificationPassed && (
                        <p className="error-text">
                            Verification failed. Please retake your selfie and try again.
                        </p>
                    )}
                </div>
            )}

            {/* ── Continue Button ── */}
            <div className="form-actions">
                <button
                    className="btn btn-primary"
                    onClick={onComplete}
                    disabled={!verificationPassed}
                >
                    Continue →
                </button>
            </div>
        </div>
    );
};

export default FaceVerificationStep;
