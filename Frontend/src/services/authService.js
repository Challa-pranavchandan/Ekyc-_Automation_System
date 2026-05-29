// ============================================================
// authService.js — All authentication-related API calls
//
// Maps directly to the "1. Auth" section of your Postman collection:
//   POST /auth/register
//   POST /auth/login
//   GET  /auth/me
//   POST /auth/change-password
//   POST /auth/logout
// ============================================================

import api from "./api";

const authService = {
  // ── REGISTER ──────────────────────────────────────────────
  // Creates a new applicant account.
  // Body: { name, email, password, phone }
  register: async (userData) => {
    const response = await api.post("/auth/register", userData);
    return response.data; // { success: true, data: { ... } }
  },

  // ── LOGIN ─────────────────────────────────────────────────
  // Authenticates user and returns a JWT access token.
  // Body: { email, password }
  // On success we SAVE the token to localStorage so the api.js interceptor
  // can pick it up automatically for every subsequent request.
  login: async (credentials) => {
    const response = await api.post("/auth/login", credentials);
    const { data } = response.data;

    if (data?.accessToken) {
      // Persist token and user info so they survive page refreshes
      localStorage.setItem("accessToken", data.accessToken);
      localStorage.setItem("user", JSON.stringify(data.user || {}));
    }

    return response.data;
  },

  // ── GET CURRENT USER ──────────────────────────────────────
  // Fetches the logged-in user's profile.
  // Uses the Bearer token automatically (via interceptor).
  getMe: async () => {
    const response = await api.get("/auth/me");
    return response.data;
  },

  // ── CHANGE PASSWORD ───────────────────────────────────────
  // Body: { currentPassword, newPassword }
  changePassword: async (passwords) => {
    const response = await api.post("/auth/change-password", passwords);
    return response.data;
  },

  // ── LOGOUT ────────────────────────────────────────────────
  // Tells the backend to invalidate the token, then clears local storage.
  logout: async () => {
    try {
      await api.post("/auth/logout");
    } finally {
      // Always clear local storage even if backend call fails
      localStorage.removeItem("accessToken");
      localStorage.removeItem("user");
    }
  },
};

export default authService;
