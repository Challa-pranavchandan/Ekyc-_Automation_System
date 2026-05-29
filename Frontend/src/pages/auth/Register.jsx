// ============================================================
// RegisterPage.jsx — New user registration form
//
// Fields: name, email, phone, password, confirmPassword
// On success → redirected to /login (handled by useAuth.register)
// ============================================================

import { useState } from "react";
import { Link } from "react-router-dom";
import useAuth from "../../hooks/useAuth";

const RegisterPage = () => {
    const { register, loading, error, clearAuthError } = useAuth();

    const [formData, setFormData] = useState({
        name: "",
        email: "",
        phone: "",
        password: "",
        confirmPassword: "",
    });

    // Client-side validation error (e.g. passwords don't match)
    const [localError, setLocalError] = useState("");

    const handleChange = (e) => {
        clearAuthError();
        setLocalError("");
        setFormData({ ...formData, [e.target.name]: e.target.value });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        // Client-side check before sending to backend
        if (formData.password !== formData.confirmPassword) {
            setLocalError("Passwords do not match.");
            return;
        }

        // Strip confirmPassword — backend doesn't need it
        const { confirmPassword, ...submitData } = formData;
        await register(submitData);
    };

    const displayError = localError || error;

    return (
        <div className="auth-container">
            <div className="auth-card">
                <div className="auth-header">
                    <h1>eKYC Portal</h1>
                    <p>Create your account</p>
                </div>

                {displayError && (
                    <div className="error-banner">
                        <span>⚠️ {displayError}</span>
                    </div>
                )}

                <form onSubmit={handleSubmit} className="auth-form">
                    {/* Full Name */}
                    <div className="form-group">
                        <label htmlFor="name">Full Name</label>
                        <input
                            id="name"
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            placeholder="Your legal full name"
                            required
                        />
                    </div>

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
                        />
                    </div>

                    {/* Phone — backend expects +91 format */}
                    <div className="form-group">
                        <label htmlFor="phone">Phone Number</label>
                        <input
                            id="phone"
                            type="tel"
                            name="phone"
                            value={formData.phone}
                            onChange={handleChange}
                            placeholder="+919876543210"
                            required
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
                            placeholder="Min 8 characters"
                            required
                            minLength={8}
                        />
                    </div>

                    {/* Confirm Password — client-side check only */}
                    <div className="form-group">
                        <label htmlFor="confirmPassword">Confirm Password</label>
                        <input
                            id="confirmPassword"
                            type="password"
                            name="confirmPassword"
                            value={formData.confirmPassword}
                            onChange={handleChange}
                            placeholder="Repeat password"
                            required
                        />
                    </div>

                    <button
                        type="submit"
                        className="btn btn-primary btn-full"
                        disabled={loading}
                    >
                        {loading ? "Creating account..." : "Create Account"}
                    </button>
                </form>

                <p className="auth-footer">
                    Already have an account? <Link to="/login">Sign in</Link>
                </p>
            </div>
        </div>
    );
};

export default RegisterPage;
