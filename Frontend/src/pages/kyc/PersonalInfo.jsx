// ============================================================
// PersonalInfoStep.jsx — Step 1 of KYC wizard
//
// Collects: fullName, dateOfBirth, gender, nationality, address
// On save → backend advances currentStep to 'document_upload'
// ============================================================

import { useState } from "react";
import useKYC from "../../hooks/useKYC";

const PersonalInfoStep = ({ applicationId, initialData, onComplete }) => {
    const { savePersonalInfo, loading, error } = useKYC();

    // Pre-fill form if user already saved this step previously
    const [form, setForm] = useState({
        fullName: initialData?.fullName || "",
        dateOfBirth: initialData?.dateOfBirth?.split("T")[0] || "", // ISO date → YYYY-MM-DD
        gender: initialData?.gender || "male",
        nationality: initialData?.nationality || "Indian",
        address: {
            line1: initialData?.address?.line1 || "",
            line2: initialData?.address?.line2 || "",
            city: initialData?.address?.city || "",
            state: initialData?.address?.state || "",
            pincode: initialData?.address?.pincode || "",
            country: initialData?.address?.country || "India",
        },
    });

    // Handle top-level fields
    const handleChange = (e) => {
        setForm({ ...form, [e.target.name]: e.target.value });
    };

    // Handle nested address fields
    const handleAddressChange = (e) => {
        setForm({
            ...form,
            address: { ...form.address, [e.target.name]: e.target.value },
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await savePersonalInfo(applicationId, form);
            onComplete(); // tell wizard to advance to next step
        } catch {
            // Error already stored in hook state — displayed below
        }
    };

    return (
        <div className="step-card">
            <h2>Step 1 — Personal Information</h2>
            <p className="step-desc">
                Enter your details exactly as they appear on your Aadhaar card.
            </p>

            {error && <div className="error-banner">{error}</div>}

            <form onSubmit={handleSubmit} className="kyc-form">
                {/* Full Name */}
                <div className="form-group">
                    <label>Full Name *</label>
                    <input
                        type="text"
                        name="fullName"
                        value={form.fullName}
                        onChange={handleChange}
                        required
                        placeholder="As on Aadhaar"
                    />
                </div>

                {/* Date of Birth + Gender in a row */}
                <div className="form-row">
                    <div className="form-group">
                        <label>Date of Birth *</label>
                        <input
                            type="date"
                            name="dateOfBirth"
                            value={form.dateOfBirth}
                            onChange={handleChange}
                            required
                            max={new Date().toISOString().split("T")[0]} // no future dates
                        />
                    </div>

                    <div className="form-group">
                        <label>Gender *</label>
                        <select name="gender" value={form.gender} onChange={handleChange}>
                            <option value="male">Male</option>
                            <option value="female">Female</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                </div>

                {/* Nationality */}
                <div className="form-group">
                    <label>Nationality *</label>
                    <input
                        type="text"
                        name="nationality"
                        value={form.nationality}
                        onChange={handleChange}
                        required
                    />
                </div>

                {/* Address section */}
                <div className="section-divider">
                    <h3>Address</h3>
                </div>

                <div className="form-group">
                    <label>Address Line 1 *</label>
                    <input
                        type="text"
                        name="line1"
                        value={form.address.line1}
                        onChange={handleAddressChange}
                        required
                        placeholder="Street / House No."
                    />
                </div>

                <div className="form-group">
                    <label>Address Line 2</label>
                    <input
                        type="text"
                        name="line2"
                        value={form.address.line2}
                        onChange={handleAddressChange}
                        placeholder="Apartment, Suite (optional)"
                    />
                </div>

                <div className="form-row">
                    <div className="form-group">
                        <label>City *</label>
                        <input
                            type="text"
                            name="city"
                            value={form.address.city}
                            onChange={handleAddressChange}
                            required
                        />
                    </div>

                    <div className="form-group">
                        <label>State *</label>
                        <input
                            type="text"
                            name="state"
                            value={form.address.state}
                            onChange={handleAddressChange}
                            required
                        />
                    </div>
                </div>

                <div className="form-row">
                    <div className="form-group">
                        <label>Pincode *</label>
                        <input
                            type="text"
                            name="pincode"
                            value={form.address.pincode}
                            onChange={handleAddressChange}
                            required
                            pattern="\d{6}"
                            placeholder="6-digit pincode"
                        />
                    </div>

                    <div className="form-group">
                        <label>Country *</label>
                        <input
                            type="text"
                            name="country"
                            value={form.address.country}
                            onChange={handleAddressChange}
                            required
                        />
                    </div>
                </div>

                <div className="form-actions">
                    <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={loading}
                    >
                        {loading ? "Saving..." : "Save & Continue →"}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default PersonalInfoStep;
