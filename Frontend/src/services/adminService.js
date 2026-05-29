// ============================================================
// adminService.js — Admin-only API calls
//
// Maps to "5. Admin" in Postman:
//   GET  /admin/stats                              → dashboard stats
//   GET  /admin/review-queue                       → paginated applications queue
//   GET  /admin/applications/:id                   → single application detail
//   POST /admin/applications/:id/approve           → approve KYC
//   POST /admin/applications/:id/reject            → reject KYC
//   GET  /admin/users                              → list all users
//   GET  /admin/audit-logs                         → audit trail
//
// All these endpoints require an admin-role JWT.
// The token is automatically attached by api.js interceptor.
// ============================================================

import api from "./api";

const adminService = {
  // ── DASHBOARD STATS ─────────────────────────────────────
  // Returns overview: totalApplications, pendingReview, approvalRate, etc.
  getDashboardStats: async () => {
    const response = await api.get("/admin/stats");
    return response.data;
  },

  // ── REVIEW QUEUE ─────────────────────────────────────────
  // Paginated list of applications needing review.
  // params: { page, limit, status }
  // status options: 'under_review' | 'approved' | 'rejected' | all
  getReviewQueue: async (params = { page: 1, limit: 10, status: "under_review" }) => {
    const response = await api.get("/admin/review-queue", { params });
    return response.data;
    // { data: { applications: [...], total, page, totalPages } }
  },

  // ── GET SINGLE APPLICATION ──────────────────────────────
  // Full application detail including documents and face verification result.
  getApplication: async (applicationId) => {
    const response = await api.get(`/admin/applications/${applicationId}`);
    return response.data;
  },

  // ── APPROVE APPLICATION ─────────────────────────────────
  // Marks the application as 'approved'.
  // reviewNotes: optional admin comment string
  approveApplication: async (applicationId, reviewNotes = "") => {
    const response = await api.post(
      `/admin/applications/${applicationId}/approve`,
      { reviewNotes }
    );
    return response.data; // { data: { status: 'approved' } }
  },

  // ── REJECT APPLICATION ──────────────────────────────────
  // Marks the application as 'rejected'.
  // rejectionReason: shown to the applicant
  // reviewNotes: internal admin note
  rejectApplication: async (applicationId, rejectionReason, reviewNotes = "") => {
    const response = await api.post(
      `/admin/applications/${applicationId}/reject`,
      { rejectionReason, reviewNotes }
    );
    return response.data;
  },

  // ── GET ALL USERS ────────────────────────────────────────
  // Paginated user list.
  getAllUsers: async (params = { page: 1, limit: 10 }) => {
    const response = await api.get("/admin/users", { params });
    return response.data;
  },

  // ── GET AUDIT LOGS ───────────────────────────────────────
  // Complete audit trail of all admin actions.
  getAuditLogs: async (params = { page: 1, limit: 20 }) => {
    const response = await api.get("/admin/audit-logs", { params });
    return response.data;
  },
};

export default adminService;
