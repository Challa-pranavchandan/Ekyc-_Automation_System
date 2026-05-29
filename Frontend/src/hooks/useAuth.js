// ============================================================
// useAuth.js — Custom hook for authentication state & actions
//
// This hook is a thin wrapper around Redux auth state.
// Components use this instead of calling useSelector/useDispatch directly.
//
// Usage:
//   const { user, isAuthenticated, login, logout, loading, error } = useAuth();
// ============================================================

import { useDispatch, useSelector } from "react-redux";
import { useNavigate } from "react-router-dom";
import {
  loginUser,
  registerUser,
  logoutUser,
  clearError,
} from "../store/slices/authSlice";

const useAuth = () => {
  const dispatch = useDispatch();
  const navigate = useNavigate();

  // Read auth state from Redux store
  const { user, isAuthenticated, loading, error } = useSelector(
    (state) => state.auth
  );

  // ── LOGIN ──────────────────────────────────────────────
  // After successful login, redirect based on user role
  const login = async (credentials) => {
    const result = await dispatch(loginUser(credentials));

    if (loginUser.fulfilled.match(result)) {
      const loggedInUser = result.payload.data?.user;
      // Admins go to admin dashboard, applicants to their KYC page
      if (loggedInUser?.role === "admin") {
        navigate("/admin/dashboard");
      } else {
        navigate("/dashboard");
      }
    }
  };

  // ── REGISTER ──────────────────────────────────────────
  // After successful registration, redirect to login
  const register = async (userData) => {
    const result = await dispatch(registerUser(userData));
    if (registerUser.fulfilled.match(result)) {
      navigate("/login");
    }
  };

  // ── LOGOUT ────────────────────────────────────────────
  const logout = async () => {
    await dispatch(logoutUser());
    navigate("/login");
  };

  // ── CLEAR ERROR ───────────────────────────────────────
  // Call when user starts typing to remove old error messages
  const clearAuthError = () => dispatch(clearError());

  return {
    user,
    isAuthenticated,
    loading,
    error,
    login,
    register,
    logout,
    clearAuthError,
  };
};

export default useAuth;
