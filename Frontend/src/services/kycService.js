// ============================================================
// kycService.js — KYC Application API calls
//
// Maps to "2. KYC Application" in Postman:
//   POST /kyc                              → create application
//   PUT  /kyc/:id/personal-info            → save personal details
//   GET  /kyc/my-application               → get current user's application
//   GET  /kyc/:id/status                   → get status
//   GET  /kyc/:id/history                  → get status history
//   POST /kyc/:id/submit                   → final submit for review
//
// KYC flow steps (as defined by backend):
//   1. personal_info  → fill in name, DOB, address etc.
//   2. document_upload → upload Aadhaar, PAN
//   3. face_verification → selfie + liveness check
//   4. review (admin reviews)
//   5. completed
// ============================================================

import api from "./api";

const kycService = {
  // ── CREATE APPLICATION ──────────────────────────────────
  // Starts a new KYC application. Returns an applicationId
  // that is used in all subsequent steps.
  createApplication: async () => {
    const response = await api.post("/kyc");
    return response.data; // { success, data: { _id, applicationNo, currentStep, ... } }
  },

  // ── SAVE PERSONAL INFO ──────────────────────────────────
  // Step 1 of the KYC flow.
  // personalData shape:
  // {
  //   fullName, dateOfBirth, gender, nationality,
  //   address: { line1, line2, city, state, pincode, country }
  // }
  savePersonalInfo: async (applicationId, personalData) => {
    const response = await api.put(
      `/kyc/${applicationId}/personal-info`,
      personalData
    );
    return response.data; // { data: { currentStep: 'document_upload', ... } }
  },

  // ── GET MY APPLICATION ──────────────────────────────────
  // Returns the current user's application (there's only one per user).
  getMyApplication: async () => {
    const response = await api.get("/kyc/my-application");
    return response.data;
  },

  // ── GET APPLICATION STATUS ──────────────────────────────
  // Lightweight status check (pending / under_review / approved / rejected).
  getStatus: async (applicationId) => {
    const response = await api.get(`/kyc/${applicationId}/status`);
    return response.data;
  },

  // ── GET APPLICATION HISTORY ─────────────────────────────
  // Returns a timeline of all status changes with timestamps.
  getHistory: async (applicationId) => {
    const response = await api.get(`/kyc/${applicationId}/history`);
    return response.data;
  },

  // ── SUBMIT APPLICATION ──────────────────────────────────
  // Final step: sends application for admin review.
  // Status changes from 'draft' → 'under_review'.
  submitApplication: async (applicationId) => {
    const response = await api.post(`/kyc/${applicationId}/submit`);
    return response.data;
  },
};

export default kycService;
