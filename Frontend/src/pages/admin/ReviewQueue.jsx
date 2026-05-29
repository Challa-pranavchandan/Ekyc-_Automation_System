// ============================================================
// ReviewPage.jsx — Admin reviews a single KYC application
//
// Shows:
//   - Personal information
//   - Uploaded documents with OCR extracted data
//   - Face verification result
//   - Approve / Reject form with notes
// ============================================================

import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import adminService from "../../services/adminService";

const ReviewPage = () => {
    const { applicationId } = useParams(); // from /admin/review/:applicationId
    const navigate = useNavigate();

    const [application, setApplication] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // Form state for approve/reject
    const [reviewNotes, setReviewNotes] = useState("");
    const [rejectionReason, setRejectionReason] = useState("");
    const [actionLoading, setActionLoading] = useState(false);

    // Load full application detail on mount
    useEffect(() => {
        const load = async () => {
            setLoading(true);
            try {
                const res = await adminService.getApplication(applicationId);
                setApplication(res.data);
            } catch (err) {
                setError(err.response?.data?.message || "Failed to load application");
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [applicationId]);

    // ── APPROVE ──────────────────────────────────────────────
    const handleApprove = async () => {
        setActionLoading(true);
        try {
            await adminService.approveApplication(applicationId, reviewNotes);
            // Navigate back to dashboard after action
            navigate("/admin/dashboard");
        } catch (err) {
            setError(err.response?.data?.message || "Approval failed");
        } finally {
            setActionLoading(false);
        }
    };

    // ── REJECT ───────────────────────────────────────────────
    const handleReject = async () => {
        if (!rejectionReason.trim()) {
            setError("Please provide a rejection reason.");
            return;
        }
        setActionLoading(true);
        try {
            await adminService.rejectApplication(
                applicationId,
                rejectionReason,
                reviewNotes
            );
            navigate("/admin/dashboard");
        } catch (err) {
            setError(err.response?.data?.message || "Rejection failed");
        } finally {
            setActionLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="page-container centered">
                <div className="spinner" />
            </div>
        );
    }

    if (!application) {
        return (
            <div className="page-container">
                <div className="error-banner">{error || "Application not found."}</div>
                <button className="btn btn-outline" onClick={() => navigate(-1)}>
                    ← Back
                </button>
            </div>
        );
    }

    const { personalInfo, documents = [], faceVerification } = application;

    return (
        <div className="page-container">
            {/* Back button */}
            <button className="btn btn-outline btn-sm mb-4" onClick={() => navigate(-1)}>
                ← Back to Queue
            </button>

            <h1>Review Application — {application.applicationNo}</h1>

            {error && <div className="error-banner">{error}</div>}

            {/* ── Personal Info ── */}
            <section className="review-section">
                <h2>Personal Information</h2>
                <div className="info-grid">
                    <div><label>Full Name</label><p>{personalInfo?.fullName}</p></div>
                    <div><label>Date of Birth</label><p>{personalInfo?.dateOfBirth?.split("T")[0]}</p></div>
                    <div><label>Gender</label><p>{personalInfo?.gender}</p></div>
                    <div><label>Nationality</label><p>{personalInfo?.nationality}</p></div>
                    <div>
                        <label>Address</label>
                        <p>
                            {personalInfo?.address?.line1},{" "}
                            {personalInfo?.address?.city},{" "}
                            {personalInfo?.address?.state} —{" "}
                            {personalInfo?.address?.pincode}
                        </p>
                    </div>
                </div>
            </section>

            {/* ── Documents ── */}
            <section className="review-section">
                <h2>Uploaded Documents</h2>
                {documents.length === 0 ? (
                    <p className="hint">No documents uploaded.</p>
                ) : (
                    <div className="doc-grid">
                        {documents.map((doc) => (
                            <div key={doc._id} className="doc-card">
                                <h4>
                                    {doc.type?.toUpperCase()} — {doc.side}
                                </h4>
                                <span
                                    className={`badge ${doc.verificationStatus === "verified"
                                            ? "badge-green"
                                            : "badge-red"
                                        }`}
                                >
                                    {doc.verificationStatus}
                                </span>
                                {doc.extractedData && (
                                    <div className="ocr-data">
                                        {doc.extractedData.name && (
                                            <p><strong>Name:</strong> {doc.extractedData.name}</p>
                                        )}
                                        {doc.extractedData.number && (
                                            <p><strong>ID No.:</strong> {doc.extractedData.number}</p>
                                        )}
                                        {doc.ocrConfidence && (
                                            <p>
                                                <strong>OCR Confidence:</strong>{" "}
                                                {(doc.ocrConfidence * 100).toFixed(0)}%
                                            </p>
                                        )}
                                    </div>
                                )}
                                {/* Show document image if URL available */}
                                {doc.fileUrl && (
                                    <a
                                        href={doc.fileUrl}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="btn btn-outline btn-sm mt-2"
                                    >
                                        View Document ↗
                                    </a>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* ── Face Verification ── */}
            <section className="review-section">
                <h2>Face Verification</h2>
                {!faceVerification ? (
                    <p className="hint">Not completed.</p>
                ) : (
                    <div className="result-rows">
                        <div className="result-row">
                            <span>Liveness Check</span>
                            <span
                                className={
                                    faceVerification.liveness?.pass ? "badge-green" : "badge-red"
                                }
                            >
                                {faceVerification.liveness?.pass ? "✓ Passed" : "✗ Failed"}
                            </span>
                        </div>
                        <div className="result-row">
                            <span>Face Match</span>
                            <span
                                className={
                                    faceVerification.faceMatch?.pass ? "badge-green" : "badge-red"
                                }
                            >
                                {faceVerification.faceMatch?.pass ? "✓ Passed" : "✗ Failed"}
                            </span>
                        </div>
                        <div className="result-row">
                            <span>Overall Status</span>
                            <span>{faceVerification.overallStatus}</span>
                        </div>
                    </div>
                )}
            </section>

            {/* ── Decision Panel ── (only show if still under review) */}
            {application.status === "under_review" && (
                <section className="review-section decision-panel">
                    <h2>Make a Decision</h2>

                    <div className="form-group">
                        <label>Review Notes (internal, optional)</label>
                        <textarea
                            rows={3}
                            value={reviewNotes}
                            onChange={(e) => setReviewNotes(e.target.value)}
                            placeholder="Add internal notes visible only to admins..."
                        />
                    </div>

                    <div className="form-group">
                        <label>Rejection Reason (shown to applicant, required to reject)</label>
                        <textarea
                            rows={3}
                            value={rejectionReason}
                            onChange={(e) => setRejectionReason(e.target.value)}
                            placeholder="Explain why this application is being rejected..."
                        />
                    </div>

                    <div className="decision-buttons">
                        <button
                            className="btn btn-success"
                            onClick={handleApprove}
                            disabled={actionLoading}
                        >
                            {actionLoading ? "Processing..." : "✅ Approve"}
                        </button>
                        <button
                            className="btn btn-danger"
                            onClick={handleReject}
                            disabled={actionLoading || !rejectionReason.trim()}
                        >
                            {actionLoading ? "Processing..." : "❌ Reject"}
                        </button>
                    </div>
                </section>
            )}

            {/* Already decided — show final status */}
            {application.status !== "under_review" && (
                <div className="final-status">
                    <strong>Application is {application.status}.</strong>
                </div>
            )}
        </div>
    );
};

export default ReviewPage;
