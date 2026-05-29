// ============================================================
// useKYC.js — Custom hook for KYC application state & actions
//
// Manages local component state for the KYC wizard flow.
// Wraps kycService calls with loading/error state.
//
// Usage:
//   const { application, createApplication, savePersonalInfo, ... } = useKYC();
// ============================================================

import { useState, useCallback } from "react";
import kycService from "../services/kycService";

const useKYC = () => {
  // The current application object returned from the backend
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Helper: wraps any async service call with loading + error handling
  const run = useCallback(async (fn) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fn();
      return result;
    } catch (err) {
      const msg = err.response?.data?.message || "Something went wrong";
      setError(msg);
      throw err; // re-throw so callers can handle if needed
    } finally {
      setLoading(false);
    }
  }, []);

  // ── CREATE APPLICATION ──────────────────────────────────
  const createApplication = useCallback(async () => {
    return run(async () => {
      const res = await kycService.createApplication();
      setApplication(res.data);
      return res.data;
    });
  }, [run]);

  // ── SAVE PERSONAL INFO ──────────────────────────────────
  const savePersonalInfo = useCallback(
    async (applicationId, personalData) => {
      return run(async () => {
        const res = await kycService.savePersonalInfo(applicationId, personalData);
        setApplication(res.data); // backend returns updated application
        return res.data;
      });
    },
    [run]
  );

  // ── LOAD MY APPLICATION ─────────────────────────────────
  // Called on the dashboard to load existing application
  const loadMyApplication = useCallback(async () => {
    return run(async () => {
      const res = await kycService.getMyApplication();
      setApplication(res.data);
      return res.data;
    });
  }, [run]);

  // ── SUBMIT APPLICATION ──────────────────────────────────
  const submitApplication = useCallback(async (applicationId) => {
    return run(async () => {
      const res = await kycService.submitApplication(applicationId);
      setApplication(res.data);
      return res.data;
    });
  }, [run]);

  return {
    application,
    loading,
    error,
    createApplication,
    savePersonalInfo,
    loadMyApplication,
    submitApplication,
    setError,
  };
};

export default useKYC;
