// ============================================================
// api.js — Central Axios instance for all API calls
//
// Why this file exists:
//   All HTTP calls go through ONE axios instance so we can:
//   1. Automatically attach the JWT token to every request
//   2. Automatically redirect to login when the token expires (401)
//   3. Set the base URL in ONE place — change it here, it applies everywhere
// ============================================================

import axios from "axios";

// Base URL of your backend — change this when deploying
const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000/api/v1";

// Create a custom axios instance with default settings
const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// ── REQUEST INTERCEPTOR ──────────────────────────────────────
// Runs BEFORE every request is sent.
// Reads the stored JWT token and injects it into the Authorization header.
api.interceptors.request.use(
  (config) => {
    // Read token from localStorage (saved on login)
    const token = localStorage.getItem("accessToken");

    if (token) {
      // Standard Bearer token format required by the backend
      config.headers.Authorization = `Bearer ${token}`;
    }

    return config; // continue with the modified config
  },
  (error) => Promise.reject(error)
);

// ── RESPONSE INTERCEPTOR ────────────────────────────────────
// Runs AFTER every response arrives.
// Handles 401 Unauthorized globally so individual pages don't have to.
api.interceptors.response.use(
  (response) => response, // success — just pass it through

  (error) => {
    if (error.response?.status === 401) {
      // Token expired or invalid → clear storage and force re-login
      localStorage.removeItem("accessToken");
      localStorage.removeItem("user");

      // Redirect to login page (works outside of React Router context)
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }

    // Always reject so individual catch blocks still run
    return Promise.reject(error);
  }
);

export default api;
