// ============================================================
// UserDashboard.jsx — Applicant's home page
//
// Shows:
//   - Current KYC application status
//   - Status history timeline
//   - Button to start/continue KYC wizard
// ============================================================

import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import useAuth from "../../hooks/useAuth";
import useKYC from "../../hooks/useKYC";

// Human-readable labels and colors for each backend status
const STATUS_CONFIG = {
    draft: { label: "Draft — Not Submitted", color: "#6b7280", icon: "📝" },
    under_review: { label: "Under Review", color: "#d97706", icon: "🔍" },
    approved: { label: "Approved ✓", color: "#16a34a", icon: "✅" },
    rejected: { label: "Rejected", color: "#dc2626", icon: "❌" },
};

const UserDashboard = () => {
    const navigate = useNavigate();
    const { user, logout } = useAuth();
    const { application, loading, error, loadMyApplication } = useKYC();

    // Load application on mount
    useEffect(() => {
        loadMyApplication().catch(() => {
            // User has no application yet — that's fine, we show a "Start KYC" button
        });
    }, []);

    const statusConfig =
        STATUS_CONFIG[application?.status] || STATUS_CONFIG.draft;

    return (
        <div className="dashboard-layout">
            {/* ── Top nav ── */}
            <header className="dashboard-header">
                <h1>eKYC Portal</h1>
                <div className="header-right">
                    <span>👤 {user?.name || user?.email}</span>
                    <button className="btn btn-outline btn-sm" onClick={logout}>
                        Logout
                    </button>
                </div>
            </header>

            <main className="dashboard-main">
                <h2>My KYC Application</h2>

                {loading && <div className="spinner" />}
                {error && !application && (
                    // Error loading application — might just mean no application yet
                    <p className="hint">{error}</p>
                )}

                {/* ── No Application Yet ── */}
                {!application && !loading && (
                    <div className="empty-state">
                        <div className="empty-icon">📋</div>
                        <h3>No KYC Application Found</h3>
                        <p>Start your KYC verification process to get verified.</p>
                        <button
                            className="btn btn-primary"
                            onClick={() => navigate("/kyc")}
                        >
                            Start KYC Process
                        </button>
                    </div>
                )}

                {/* ── Application Card ── */}
                {application && (
                    <div className="app-card">
                        {/* Status badge */}
                        <div
                            className="status-badge-large"
                            style={{ borderColor: statusConfig.color, color: statusConfig.color }}
                        >
                            <span className="status-icon">{statusConfig.icon}</span>
                            <span>{statusConfig.label}</span>
                        </div>

                        <div className="app-details">
                            <div className="detail-row">
                                <span>Application No.</span>
                                <strong>{application.applicationNo}</strong>
                            </div>
                            <div className="detail-row">
                                <span>Current Step</span>
                                <strong>{application.currentStep?.replace("_", " ")}</strong>
                            </div>
                            <div className="detail-row">
                                <span>Submitted</span>
                                <strong>
                                    {application.submittedAt
                                        ? new Date(application.submittedAt).toLocaleDateString()
                                        : "Not submitted yet"}
                                </strong>
                            </div>
                        </div>

                        {/* Rejection reason if applicable */}
                        {application.status === "rejected" && (
                            <div className="rejection-box">
                                <strong>Reason for Rejection:</strong>
                                <p>{application.rejectionReason || "No reason provided."}</p>
                            </div>
                        )}

                        {/* Action buttons based on status */}
                        <div className="app-actions">
                            {(application.status === "draft") && (
                                <button
                                    className="btn btn-primary"
                                    onClick={() => navigate("/kyc")}
                                >
                                    Continue KYC →
                                </button>
                            )}
                            {application.status === "rejected" && (
                                <button
                                    className="btn btn-primary"
                                    onClick={() => navigate("/kyc")}
                                >
                                    Resubmit Application
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};

export default UserDashboard;
