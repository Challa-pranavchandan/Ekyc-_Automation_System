// ============================================================
// authSlice.js — Redux state management for authentication
//
// Manages:
//   - user object (profile info)
//   - isAuthenticated flag
//   - loading / error states for async operations
//
// Uses Redux Toolkit's createAsyncThunk which handles
// pending / fulfilled / rejected lifecycle automatically.
// ============================================================

import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import authService from "../../services/authService";

// ── ASYNC THUNKS ─────────────────────────────────────────────
// Each thunk represents one async API operation.
// createAsyncThunk automatically dispatches:
//   loginUser.pending   → loading = true
//   loginUser.fulfilled → loading = false, store data
//   loginUser.rejected  → loading = false, store error

export const registerUser = createAsyncThunk(
  "auth/register",
  async (userData, { rejectWithValue }) => {
    try {
      return await authService.register(userData);
    } catch (error) {
      // Pass the backend error message to the rejected case
      return rejectWithValue(
        error.response?.data?.message || "Registration failed"
      );
    }
  }
);

export const loginUser = createAsyncThunk(
  "auth/login",
  async (credentials, { rejectWithValue }) => {
    try {
      return await authService.login(credentials);
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Login failed"
      );
    }
  }
);

export const fetchCurrentUser = createAsyncThunk(
  "auth/getMe",
  async (_, { rejectWithValue }) => {
    try {
      return await authService.getMe();
    } catch (error) {
      return rejectWithValue(
        error.response?.data?.message || "Failed to fetch user"
      );
    }
  }
);

export const logoutUser = createAsyncThunk("auth/logout", async () => {
  await authService.logout();
});

// ── INITIAL STATE ─────────────────────────────────────────────
// Hydrate from localStorage so the user stays logged in on refresh
const storedUser = localStorage.getItem("user");

const initialState = {
  user: storedUser ? JSON.parse(storedUser) : null,
  isAuthenticated: !!localStorage.getItem("accessToken"),
  loading: false,
  error: null,
};

// ── SLICE ─────────────────────────────────────────────────────
const authSlice = createSlice({
  name: "auth",
  initialState,

  reducers: {
    // Synchronous action to clear errors (e.g., when user types again)
    clearError: (state) => {
      state.error = null;
    },
  },

  extraReducers: (builder) => {
    // ── REGISTER ──────────────────────────────────────────
    builder
      .addCase(registerUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(registerUser.fulfilled, (state) => {
        state.loading = false;
        // Don't auto-login after register — user should login manually
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });

    // ── LOGIN ──────────────────────────────────────────────
    builder
      .addCase(loginUser.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.loading = false;
        state.isAuthenticated = true;
        // The user object lives inside response.data.data
        state.user = action.payload.data?.user || null;
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload;
      });

    // ── GET ME ─────────────────────────────────────────────
    builder
      .addCase(fetchCurrentUser.fulfilled, (state, action) => {
        state.user = action.payload.data;
        // Keep localStorage in sync
        localStorage.setItem("user", JSON.stringify(action.payload.data));
      });

    // ── LOGOUT ─────────────────────────────────────────────
    builder.addCase(logoutUser.fulfilled, (state) => {
      state.user = null;
      state.isAuthenticated = false;
      state.error = null;
    });
  },
});

export const { clearError } = authSlice.actions;
export default authSlice.reducer;
