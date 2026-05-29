// ============================================================
// LoginPage.jsx — Login form for applicants and admins
//
// Uses the useAuth hook which dispatches loginUser thunk.
// After successful login, useAuth redirects based on role:
//   admin   → /admin/dashboard
//   others  → /dashboard
// ============================================================

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import useAuth from "../../hooks/useAuth";

const LoginPage = () => {
    const { login, loading, error, clearAuthError, isAuthenticated } = useAuth();

    // Controlled form state
    const [formData, setFormData] = useState({
        email: "",
        password: "",
    });

    // Clear error when user starts typing again
    const handleChange = (e) => {
        clearAuthError();
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault(); // prevent full page reload
        await login(formData);
    };

    return (
        <div className="auth-container">
            <div className="auth-card">
                {/* Header */}
                <div className="auth-header">
                    <h1>eKYC Portal</h1>
                    <p>Sign in to your account</p>
                </div>

                {/* Error banner — shown when login fails */}
                {error && (
                    <div className="error-banner">
                        <span>⚠️ {error}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="auth-form">
                    {/* Email */}
                    <div className="form-group">
                        <label htmlFor="email">Email Address</label>
                        <input
                            id="email"
                            type="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            placeholder="you@example.com"
                            required
                            autoComplete="email"
                        />
                    </div>

                    {/* Password */}
                    <div className="form-group">
                        <label htmlFor="password">Password</label>
                        <input
                            id="password"
                            type="password"
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            placeholder="Enter your password"
                            required
                            autoComplete="current-password"
                        />
                    </div>

                    {/* Submit button — shows spinner when loading */}
                    <button
                        type="submit"
                        className="btn btn-primary btn-full"
                        disabled={loading}
                    >
                        {loading ? "Signing in..." : "Sign In"}
                    </button>
                </form>

                {/* Link to register */}
                <p className="auth-footer">
                    Don&apos;t have an account?{" "}
                    <Link to="/register">Create one here</Link>
                </p>
            </div>
        </div>
    );
};

export default LoginPage;
