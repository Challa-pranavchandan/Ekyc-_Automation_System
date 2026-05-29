// ============================================================
// faceService.js — Face Verification API calls
//
// Maps to "4. Face Verification" in Postman:
//   POST /face/:applicationId/upload-selfie  → send selfie as base64
//   POST /face/:applicationId/verify         → run liveness + face match
//   GET  /face/:applicationId/result         → get verification result
//
// Flow:
//   1. User takes a selfie via webcam (captured as base64 JPEG)
//   2. uploadSelfie() sends the base64 image
//   3. runVerification() triggers AI liveness check + face match vs Aadhaar
//   4. getResult() returns: { overallStatus, liveness: {pass}, faceMatch: {pass} }
// ============================================================

import api from "./api";

const faceService = {
  // ── UPLOAD SELFIE ───────────────────────────────────────
  // Sends a base64-encoded image string.
  // imageBase64 must include the data URI prefix:
  //   "data:image/jpeg;base64,/9j/4AAQ..."
  // (which is what canvas.toDataURL() returns automatically)
  uploadSelfie: async (applicationId, imageBase64) => {
    const response = await api.post(
      `/face/${applicationId}/upload-selfie`,
      { imageBase64 } // JSON body with base64 string
    );
    return response.data; // { data: { selfieUrl } }
  },

  // ── RUN FACE VERIFICATION ───────────────────────────────
  // Triggers the AI model to:
  //   1. Check liveness (is this a real person, not a photo?)
  //   2. Match face against the uploaded Aadhaar document
  // This may take 2–5 seconds.
  runVerification: async (applicationId) => {
    const response = await api.post(`/face/${applicationId}/verify`);
    return response.data;
    // { data: { overallStatus, liveness: { pass, score }, faceMatch: { pass, score } } }
  },

  // ── GET VERIFICATION RESULT ─────────────────────────────
  // Retrieve the stored result without re-running the check.
  getResult: async (applicationId) => {
    const response = await api.get(`/face/${applicationId}/result`);
    return response.data;
  },
};

export default faceService;
