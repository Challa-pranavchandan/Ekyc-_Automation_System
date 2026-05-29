// ============================================================
// AdminDashboard.jsx — Admin home page
//
// Shows:
//   - Overview stats (total, pending, approval rate)
//   - Paginated review queue table
//   - Link to individual review page
// ============================================================

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import useAuth from "../../hooks/useAuth";
import adminService from "../../services/adminService";

const AdminDashboard = () => {
    const navigate = useNavigate();
    const { user, logout } = useAuth();

    const [stats, setStats] = useState(null);
    const [queue, setQueue] = useState([]);
    const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    // Fetch stats and first page of review queue on mount
    useEffect(() => {
        fetchStats();
        fetchQueue(1);
    }, []);

    const fetchStats = async () => {
        try {
            const res = await adminService.getDashboardStats();
            setStats(res.data?.overview);
        } catch (err) {
            setError(err.response?.data?.message || "Failed to load stats");
        }
    };

    const fetchQueue = async (page = 1) => {
        setLoading(true);
        try {
            const res = await adminService.getReviewQueue({ page, limit: 10, status: "under_review" });
            setQueue(res.data?.applications || []);
            setPagination({
                page,
                total: res.data?.total || 0,
                totalPages: res.data?.totalPages || 1,
            });
        } catch (err) {
            setError(err.response?.data?.message || "Failed to load queue");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="dashboard-layout">
            {/* ── Header ── */}
            <header className="dashboard-header">
                <h1>eKYC Admin Panel</h1>
                <div className="header-right">
                    <span>🔑 {user?.name}</span>
                    <button className="btn btn-outline btn-sm" onClick={logout}>
                        Logout
                    </button>
                </div>
            </header>

            <main className="dashboard-main">
                {error && <div className="error-banner">{error}</div>}

                {/* ── Stats Cards ── */}
                {stats && (
                    <div className="stats-grid">
                        <div className="stat-card">
                            <span className="stat-value">{stats.totalApplications}</span>
                            <span className="stat-label">Total Applications</span>
                        </div>
                        <div className="stat-card">
                            <span className="stat-value" style={{ color: "#d97706" }}>
                                {stats.pendingReview}
                            </span>
                            <span className="stat-label">Pending Review</span>
                        </div>
                        <div className="stat-card">
                            <span className="stat-value" style={{ color: "#16a34a" }}>
                                {stats.approvalRate
                                    ? `${(stats.approvalRate * 100).toFixed(0)}%`
                                    : "—"}
                            </span>
                            <span className="stat-label">Approval Rate</span>
                        </div>
                        <div className="stat-card">
                            <span className="stat-value" style={{ color: "#dc2626" }}>
                                {stats.rejected || 0}
                            </span>
                            <span className="stat-label">Rejected</span>
                        </div>
                    </div>
                )}

                {/* ── Review Queue Table ── */}
                <section className="queue-section">
                    <h2>Review Queue</h2>

                    {loading ? (
                        <div className="spinner" />
                    ) : queue.length === 0 ? (
                        <div className="empty-state">
                            <p>No applications pending review. 🎉</p>
                        </div>
                    ) : (
                        <>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>App No.</th>
                                        <th>Applicant</th>
                                        <th>Email</th>
                                        <th>Submitted</th>
                                        <th>Status</th>
                                        <th>Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {queue.map((app) => (
                                        <tr key={app._id}>
                                            <td>{app.applicationNo}</td>
                                            <td>{app.personalInfo?.fullName || "—"}</td>
                                            <td>{app.user?.email || "—"}</td>
                                            <td>
                                                {app.submittedAt
                                                    ? new Date(app.submittedAt).toLocaleDateString()
                                                    : "—"}
                                            </td>
                                            <td>
                                                <span className="badge badge-yellow">{app.status}</span>
                                            </td>
                                            <td>
                                                {/* Navigate to the review page for this application */}
                                                <button
                                                    className="btn btn-primary btn-sm"
                                                    onClick={() =>
                                                        navigate(`/admin/review/${app._id}`)
                                                    }
                                                >
                                                    Review
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>

                            {/* Pagination */}
                            <div className="pagination">
                                <button
                                    className="btn btn-outline btn-sm"
                                    disabled={pagination.page <= 1}
                                    onClick={() => fetchQueue(pagination.page - 1)}
                                >
                                    ← Prev
                                </button>
                                <span>
                                    Page {pagination.page} of {pagination.totalPages}
                                </span>
                                <button
                                    className="btn btn-outline btn-sm"
                                    disabled={pagination.page >= pagination.totalPages}
                                    onClick={() => fetchQueue(pagination.page + 1)}
                                >
                                    Next →
                                </button>
                            </div>
                        </>
                    )}
                </section>
            </main>
        </div>
    );
};

export default AdminDashboard;
