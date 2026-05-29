// ============================================================
// documentService.js — Document Upload & OCR API calls
//
// Maps to "3. Documents" in Postman:
//   POST   /documents/:applicationId/upload        → upload file
//   GET    /documents/:applicationId               → list all docs
//   GET    /documents/:applicationId/:docId/ocr   → poll OCR result
//   DELETE /documents/:applicationId/:docId        → delete doc
//
// Document types accepted by the backend:
//   type: "aadhaar"  side: "front" | "back"
//   type: "pan"      side: "single"
//
// Files are sent as multipart/form-data (NOT JSON).
// ============================================================

import api from "./api";

const documentService = {
  // ── UPLOAD DOCUMENT ─────────────────────────────────────
  // Sends a file as multipart/form-data.
  //
  // Parameters:
  //   applicationId  → ID from createApplication
  //   file           → File object (from <input type="file">)
  //   type           → "aadhaar" | "pan"
  //   side           → "front" | "back" | "single"
  //   onProgress     → optional callback(percent) for upload progress bar
  uploadDocument: async (applicationId, file, type, side, onProgress) => {
    // Build multipart form — axios handles Content-Type boundary automatically
    const formData = new FormData();
    formData.append("document", file); // field name must match backend
    formData.append("type", type);
    formData.append("side", side);

    const response = await api.post(
      `/documents/${applicationId}/upload`,
      formData,
      {
        // Override default Content-Type so axios sets multipart boundary
        headers: { "Content-Type": "multipart/form-data" },

        // Track upload progress (optional, used by progress bar UI)
        onUploadProgress: (progressEvent) => {
          if (onProgress && progressEvent.total) {
            const percent = Math.round(
              (progressEvent.loaded * 100) / progressEvent.total
            );
            onProgress(percent);
          }
        },
      }
    );

    return response.data; // { data: { document: { _id, type, side, verificationStatus } } }
  },

  // ── GET ALL DOCUMENTS ───────────────────────────────────
  // Returns array of all uploaded documents for an application.
  getAllDocuments: async (applicationId) => {
    const response = await api.get(`/documents/${applicationId}`);
    return response.data; // { data: [ { _id, type, side, verificationStatus, ... } ] }
  },

  // ── GET OCR RESULT ──────────────────────────────────────
  // Poll this after uploading — OCR processing takes ~5 seconds.
  // Response includes: verificationStatus, ocrConfidence, extractedData
  //
  // verificationStatus can be: 'pending' | 'processing' | 'verified' | 'failed'
  // Keep polling every 3s until status is no longer 'pending' or 'processing'
  getOcrResult: async (applicationId, documentId) => {
    const response = await api.get(
      `/documents/${applicationId}/${documentId}/ocr`
    );
    return response.data;
  },

  // ── DELETE DOCUMENT ─────────────────────────────────────
  // Removes a document so the user can re-upload a better image.
  deleteDocument: async (applicationId, documentId) => {
    const response = await api.delete(
      `/documents/${applicationId}/${documentId}`
    );
    return response.data;
  },
};

export default documentService;
