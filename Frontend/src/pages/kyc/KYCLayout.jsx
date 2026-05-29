// ============================================================
// KYCWizard.jsx — Multi-step KYC application form
//
// Step progression (mirrors backend currentStep field):
//   Step 1: personal_info     → PersonalInfoStep
//   Step 2: document_upload   → DocumentUploadStep
//   Step 3: face_verification → FaceVerificationStep
//   Step 4: Review / Submit
//
// The wizard reads application.currentStep from the backend
// to restore the user to their correct step on page refresh.
// ============================================================

import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import useKYC from "../../hooks/useKYC";
import PersonalInfoStep from "./PersonalInfo";
import DocumentUploadStep from "./DocumentUpload";
import FaceVerificationStep from "./FaceCapture";

// Step number mapping from backend string to UI index
const STEP_MAP = {
    personal_info: 0,
    document_upload: 1,
    face_verification: 2,
    review: 3,
    completed: 3,
};

const STEP_LABELS = [
    "Personal Info",
    "Documents",
    "Face Verification",
    "Submit",
];

const KYCWizard = () => {
    const navigate = useNavigate();
    const {
        application,
        loading,
        error,
        createApplication,
        loadMyApplication,
        submitApplication,
    } = useKYC();

    // Current wizard step (0-indexed)
    const [currentStep, setCurrentStep] = useState(0);
    const [submitted, setSubmitted] = useState(false);

    // On mount: try to load existing application or create a fresh one
    useEffect(() => {
        const init = async () => {
            try {
                // Try loading existing application first
                const existing = await loadMyApplication();
                if (existing?.currentStep) {
                    setCurrentStep(STEP_MAP[existing.currentStep] ?? 0);
                }

                // If already submitted or approved, show status page
                if (
                    existing?.status === "under_review" ||
                    existing?.status === "approved"
                ) {
                    setSubmitted(true);
                }
            } catch {
                // No existing application — create one
                try {
                    const newApp = await createApplication();
                    if (newApp) setCurrentStep(0);
                } catch {
                    // createApplication error handled by hook
                }
            }
        };
        init();
    }, []); // empty deps = runs once on mount

    // Called by each step component when it completes
    const handleStepComplete = (nextStep) => {
        setCurrentStep(nextStep);
    };

    // Final submission
    const handleSubmit = async () => {
        if (!application?._id) return;
        await submitApplication(application._id);
        setSubmitted(true);
    };

    // ── SUBMITTED STATE ───────────────────────────────────
    if (submitted) {
        return (
            <div className="page-container">
                <div className="success-card">
                    <div className="success-icon">✅</div>
                    <h2>Application Submitted!</h2>
                    <p>
                        Your application <strong>{application?.applicationNo}</strong> is
                        now under review. You'll be notified once it's processed.
                    </p>
                    <button
                        className="btn btn-primary"
                        onClick={() => navigate("/dashboard")}
                    >
                        Go to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    if (loading && !application) {
        return (
            <div className="page-container centered">
                <div className="spinner" />
                <p>Setting up your application...</p>
            </div>
        );
    }

    return (
        <div className="page-container">
            {/* Progress stepper at the top */}
            <div className="stepper">
                {STEP_LABELS.map((label, index) => (
                    <div
                        key={label}
                        className={`step ${index === currentStep ? "active" : ""} ${index < currentStep ? "completed" : ""
                            }`}
                    >
                        {/* Circle with step number or checkmark */}
                        <div className="step-circle">
                            {index < currentStep ? "✓" : index + 1}
                        </div>
                        <span className="step-label">{label}</span>
                    </div>
                ))}
            </div>

            {/* Error display */}
            {error && <div className="error-banner">{error}</div>}

            {/* ── Step 1: Personal Info ─── */}
            {currentStep === 0 && application && (
                <PersonalInfoStep
                    applicationId={application._id}
                    // Pre-fill if data already saved
                    initialData={application.personalInfo}
                    onComplete={() => handleStepComplete(1)}
                />
            )}

            {/* ── Step 2: Document Upload ─── */}
            {currentStep === 1 && application && (
                <DocumentUploadStep
                    applicationId={application._id}
                    onComplete={() => handleStepComplete(2)}
                />
            )}

            {/* ── Step 3: Face Verification ─── */}
            {currentStep === 2 && application && (
                <FaceVerificationStep
                    applicationId={application._id}
                    onComplete={() => handleStepComplete(3)}
                />
            )}

            {/* ── Step 4: Review & Submit ─── */}
            {currentStep === 3 && application && (
                <div className="step-card">
                    <h2>Review & Submit</h2>
                    <p>
                        All steps are complete. Review the information below and submit your
                        application for verification.
                    </p>

                    {/* Summary */}
                    <div className="summary-box">
                        <div className="summary-row">
                            <span>Application No:</span>
                            <strong>{application.applicationNo}</strong>
                        </div>
                        <div className="summary-row">
                            <span>Name:</span>
                            <strong>{application.personalInfo?.fullName}</strong>
                        </div>
                        <div className="summary-row">
                            <span>Status:</span>
                            <strong>{application.status}</strong>
                        </div>
                    </div>

                    <button
                        className="btn btn-primary"
                        onClick={handleSubmit}
                        disabled={loading}
                    >
                        {loading ? "Submitting..." : "Submit Application"}
                    </button>
                </div>
            )}
        </div>
    );
};

export default KYCWizard;
