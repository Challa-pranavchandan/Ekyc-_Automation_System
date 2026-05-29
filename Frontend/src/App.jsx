// ============================================================
// App.jsx — Root component with all route definitions
//
// Route structure:
//   /login              → LoginPage       (public)
//   /register           → RegisterPage    (public)
//   /dashboard          → UserDashboard   (protected: applicant)
//   /kyc                → KYCWizard       (protected: applicant)
//   /admin/dashboard    → AdminDashboard  (protected: admin)
//   /admin/review/:id   → ReviewPage      (protected: admin)
//
// ProtectedRoute checks isAuthenticated before rendering.
// AdminRoute additionally checks role === 'admin'.
// ============================================================

import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { useSelector } from "react-redux";

// Page imports
import LoginPage from "./pages/auth/Login";
import RegisterPage from "./pages/auth/Register";
import UserDashboard from "./pages/dashboard/Dashboard";
import KYCWizard from "./pages/kyc/KYCLayout";
import AdminDashboard from "./pages/admin/AdminDashboard";
import ReviewPage from "./pages/admin/ReviewQueue";
// ── PROTECTED ROUTE ─────────────────────────────────────────
// Redirects unauthenticated users to /login.
// Any page that requires a login should be wrapped in this.
const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useSelector((state) => state.auth);
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

// ── ADMIN ROUTE ──────────────────────────────────────────────
// Additionally checks the user's role is 'admin'.
// Redirects to /dashboard if logged in but not admin.
const AdminRoute = ({ children }) => {
  const { isAuthenticated, user } = useSelector((state) => state.auth);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (user?.role !== "admin") return <Navigate to="/dashboard" replace />;
  return children;
};

function App() {
  return (
    <Router>
      <Routes>
        {/* Public routes — accessible without login */}
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />

        {/* Applicant routes — require login */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <UserDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/kyc"
          element={
            <ProtectedRoute>
              <KYCWizard />
            </ProtectedRoute>
          }
        />

        {/* Admin routes — require login + admin role */}
        <Route
          path="/admin/dashboard"
          element={
            <AdminRoute>
              <AdminDashboard />
            </AdminRoute>
          }
        />
        <Route
          path="/admin/review/:applicationId"
          element={
            <AdminRoute>
              <ReviewPage />
            </AdminRoute>
          }
        />

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
