// ============================================================
// documentSlice.js — Redux state for document uploads
//
// Tracks per-document upload state:
//   - The list of uploaded documents
//   - Upload progress (0–100) for each upload
//   - OCR verification status per document
//   - Loading / error states
// ============================================================

import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import documentService from "../../services/documentService";

// ── ASYNC THUNKS ─────────────────────────────────────────────

export const uploadDocument = createAsyncThunk(
  "documents/upload",
  async ({ applicationId, file, type, side, onProgress }, { rejectWithValue }) => {
    try {
      return await documentService.uploadDocument(
        applicationId,
        file,
        type,
        side,
        onProgress
      );
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Upload failed"
      );
    }
  }
);

export const fetchDocuments = createAsyncThunk(
  "documents/fetchAll",
  async (applicationId, { rejectWithValue }) => {
    try {
      return await documentService.getAllDocuments(applicationId);
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch documents"
      );
    }
  }
);

export const fetchOcrResult = createAsyncThunk(
  "documents/fetchOcr",
  async ({ applicationId, documentId }, { rejectWithValue }) => {
    try {
      return await documentService.getOcrResult(applicationId, documentId);
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch OCR"
      );
    }
  }
);

export const removeDocument = createAsyncThunk(
  "documents/delete",
  async ({ applicationId, documentId }, { rejectWithValue }) => {
    try {
      await documentService.deleteDocument(applicationId, documentId);
      return documentId; // return ID so reducer can filter it out
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Delete failed"
      );
    }
  }
);

// ── SLICE ─────────────────────────────────────────────────────
const documentSlice = createSlice({
  name: "documents",
  initialState: {
    documents: [],    // array of document objects from backend
    loading: false,
    uploading: false, // separate flag specifically for upload spinner
    error: null,
  },

  reducers: {
    clearDocumentError: (state) => {
      state.error = null;
    },
  },

  extraReducers: (builder) => {
    // ── UPLOAD ──────────────────────────────────────────
    builder
      .addCase(uploadDocument.pending, (state) => {
        state.uploading = true;
        state.error = null;
      })
      .addCase(uploadDocument.fulfilled, (state, action) => {
        state.uploading = false;
        const newDoc = action.payload.data?.document;
        if (newDoc) {
          // Add the new doc to the list (avoid duplicates)
          state.documents = state.documents.filter(
            (d) => !(d.type === newDoc.type && d.side === newDoc.side)
          );
          state.documents.push(newDoc);
        }
      })
      .addCase(uploadDocument.rejected, (state, action) => {
        state.uploading = false;
        state.error = action.payload;
      });

    // ── FETCH ALL ────────────────────────────────────────
    builder
      .addCase(fetchDocuments.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchDocuments.fulfilled, (state, action) => {
        state.loading = false;
        state.documents = action.payload.data || [];
      })
      .addCase(fetchDocuments.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });

    // ── OCR RESULT ───────────────────────────────────────
    // Update the matching document's verification status in place.
    // NOTE: The OCR endpoint returns { verificationStatus, ocrConfidence, extractedData }
    // but does NOT include _id. We use the documentId from the thunk args instead.
    builder.addCase(fetchOcrResult.fulfilled, (state, action) => {
      const updated = action.payload.data;
      const documentId = action.meta.arg.documentId;
      if (updated && documentId) {
        state.documents = state.documents.map((doc) =>
          doc._id === documentId ? { ...doc, ...updated } : doc
        );
      }
    });

    // ── DELETE ───────────────────────────────────────────
    builder.addCase(removeDocument.fulfilled, (state, action) => {
      state.documents = state.documents.filter(
        (doc) => doc._id !== action.payload
      );
    });
  },
});

export const { clearDocumentError } = documentSlice.actions;
export default documentSlice.reducer;
