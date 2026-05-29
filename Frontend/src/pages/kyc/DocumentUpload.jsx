// ============================================================
// DocumentUploadStep.jsx — Step 2 of KYC wizard
//
// Handles uploading:
//   1. Aadhaar Front
//   2. Aadhaar Back
//   3. PAN Card (single side)
//
// After each upload the backend runs OCR.
// We poll the OCR endpoint every 3 seconds until verified.
// ============================================================

import { useState, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
    uploadDocument,
    fetchDocuments,
    fetchOcrResult,
} from "../../store/slices/documentSlice";

// Which documents are required and their display labels
const REQUIRED_DOCS = [
    { type: "aadhaar", side: "front", label: "Aadhaar Card — Front" },
    { type: "aadhaar", side: "back", label: "Aadhaar Card — Back" },
    { type: "pan", side: "single", label: "PAN Card" },
];

// Map verificationStatus to a colour badge
const STATUS_BADGE = {
    pending: { label: "Pending", color: "badge-gray" },
    processing: { label: "Processing...", color: "badge-yellow" },
    verified: { label: "Verified ✓", color: "badge-green" },
    manual_review: { label: "Manual Review ✓", color: "badge-blue" },
    failed: { label: "Failed ✗", color: "badge-red" },
};

// Statuses that count as "done" for the Continue button
const DONE_STATUSES = ["verified", "manual_review", "failed"];

const DocumentUploadStep = ({ applicationId, onComplete }) => {
    const dispatch = useDispatch();
    const { documents, uploading, error } = useSelector(
        (state) => state.documents
    );

    // Track upload progress per doc key "type_side"
    const [progress, setProgress] = useState({});

    // Track which docs have timed out (stuck at processing > 90s)
    const [timedOut, setTimedOut] = useState({});

    // Store OCR poll intervals so we can clear them
    const pollRefs = useRef({});
    // Store timeout handles per doc
    const timeoutRefs = useRef({});

    // Load existing documents when component mounts
    useEffect(() => {
        dispatch(fetchDocuments(applicationId));
    }, [applicationId]);

    // For each document that is pending/processing, start polling OCR
    useEffect(() => {
        documents.forEach((doc) => {
            const isDone = DONE_STATUSES.includes(doc.verificationStatus);

            if (
                (doc.verificationStatus === "pending" ||
                    doc.verificationStatus === "processing") &&
                !pollRefs.current[doc._id]
            ) {
                // Poll every 3 seconds
                pollRefs.current[doc._id] = setInterval(() => {
                    dispatch(
                        fetchOcrResult({
                            applicationId,
                            documentId: doc._id,
                        })
                    );
                }, 3000);

                // Timeout after 90 seconds — stop polling, mark as timed out
                timeoutRefs.current[doc._id] = setTimeout(() => {
                    if (pollRefs.current[doc._id]) {
                        clearInterval(pollRefs.current[doc._id]);
                        delete pollRefs.current[doc._id];
                    }
                    setTimedOut((prev) => ({ ...prev, [doc._id]: true }));
                }, 90000);
            }

            // Clear interval + timeout once done
            if (isDone && pollRefs.current[doc._id]) {
                clearInterval(pollRefs.current[doc._id]);
                delete pollRefs.current[doc._id];
                if (timeoutRefs.current[doc._id]) {
                    clearTimeout(timeoutRefs.current[doc._id]);
                    delete timeoutRefs.current[doc._id];
                }
            }
        });

        // Cleanup on unmount
        return () => {
            Object.values(pollRefs.current).forEach(clearInterval);
            Object.values(timeoutRefs.current).forEach(clearTimeout);
        };
    }, [documents]);

    // Handle file input change for a specific doc slot
    const handleFileChange = async (e, type, side) => {
        const file = e.target.files[0];
        if (!file) return;

        const key = `${type}_${side}`;

        dispatch(
            uploadDocument({
                applicationId,
                file,
                type,
                side,
                // Update progress state for this specific doc
                onProgress: (pct) => setProgress((prev) => ({ ...prev, [key]: pct })),
            })
        );
    };

    // Find an uploaded document matching type+side
    const findDoc = (type, side) =>
        documents.find((d) => d.type === type && d.side === side);

    // All 3 docs uploaded + done (verified, manual_review, or failed) → enable Continue
    const allDone = REQUIRED_DOCS.every((req) => {
        const doc = findDoc(req.type, req.side);
        if (!doc) return false;
        return DONE_STATUSES.includes(doc.verificationStatus) ||
            timedOut[doc._id];
    });

    // Still require at least one non-failed doc to continue
    const canContinue = allDone && REQUIRED_DOCS.some((req) => {
        const doc = findDoc(req.type, req.side);
        return doc && doc.verificationStatus !== "failed" && !timedOut[doc._id];
    });

    return (
        <div className="step-card">
            <h2>Step 2 — Upload Documents</h2>
            <p className="step-desc">
                Upload clear, well-lit photos. OCR will extract your details automatically.
            </p>

            {error && <div className="error-banner">{error}</div>}

            <div className="doc-grid">
                {REQUIRED_DOCS.map(({ type, side, label }) => {
                    const doc = findDoc(type, side);
                    const key = `${type}_${side}`;
                    const status = timedOut[doc?._id]
                        ? "failed"
                        : doc?.verificationStatus || "pending";
                    const badge = STATUS_BADGE[status] || STATUS_BADGE.pending;

                    return (
                        <div key={key} className="doc-card">
                            <div className="doc-header">
                                <h4>{label}</h4>
                                {doc && (
                                    <span className={`badge ${badge.color}`}>{badge.label}</span>
                                )}
                            </div>

                            {/* Show extracted data once OCR succeeds */}
                            {doc?.verificationStatus === "verified" &&
                                doc.extractedData && (
                                    <div className="ocr-data">
                                        {doc.extractedData.name && (
                                            <p>
                                                <strong>Name:</strong> {doc.extractedData.name}
                                            </p>
                                        )}
                                        {doc.extractedData.dob && (
                                            <p>
                                                <strong>DOB:</strong> {doc.extractedData.dob}
                                            </p>
                                        )}
                                        {doc.extractedData.number && (
                                            <p>
                                                <strong>Number:</strong> {doc.extractedData.number}
                                            </p>
                                        )}
                                    </div>
                                )}

                            {/* Upload progress bar */}
                            {uploading && progress[key] !== undefined && (
                                <div className="progress-bar">
                                    <div
                                        className="progress-fill"
                                        style={{ width: `${progress[key]}%` }}
                                    />
                                    <span>{progress[key]}%</span>
                                </div>
                            )}

                            {/* File input — hidden, triggered by the button */}
                            <label className="upload-label">
                                <input
                                    type="file"
                                    accept="image/*,.pdf"
                                    style={{ display: "none" }}
                                    onChange={(e) => handleFileChange(e, type, side)}
                                    disabled={uploading}
                                />
                                <span className="btn btn-outline">
                                    {doc ? "Re-upload" : "Choose File"}
                                </span>
                            </label>
                        </div>
                    );
                })}
            </div>

            <div className="form-actions">
                <button
                    className="btn btn-primary"
                    onClick={onComplete}
                    disabled={!canContinue}
                    title={!canContinue ? "Upload and process all documents first" : ""}
                >
                    Continue →
                </button>
                {!canContinue && (
                    <p className="hint">
                        {allDone
                            ? "Please re-upload any failed documents."
                            : "All documents must finish processing before continuing."}
                    </p>
                )}
            </div>
        </div>
    );
};

export default DocumentUploadStep;
