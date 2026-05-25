export const DB_NAME = "ekycDB";


export const USER_ROLES = {
    APPLICANT: 'applicant',
    ADMIN: 'admin',
    REVIEWER: 'reviewer',
    SUPERADMIN: 'superadmin',
};

export const USER_STATUS = {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
    SUSPENDED: 'suspended',
    PENDING: 'pending_verification',
};

export const KYC_STATUS = {
    DRAFT: 'draft',
    DOCUMENT_PENDING: 'document_pending',
    DOCUMENT_UPLOADED: 'document_uploaded',
    FACE_PENDING: 'face_pending',
    FACE_VERIFIED: 'face_verified',
    UNDER_REVIEW: 'under_review',
    APPROVED: 'approved',
    REJECTED: 'rejected',
    EXPIRED: 'expired',
};

export const KYC_STEPS = {
    PERSONAL_INFO: 'personal_info',
    DOCUMENT_UPLOAD: 'document_upload',
    FACE_VERIFICATION: 'face_verification',
    REVIEW: 'review',
    COMPLETED: 'completed',
};

export const DOCUMENT_TYPES = {
    AADHAAR: 'aadhaar',
    PAN: 'pan',
    PASSPORT: 'passport',
    VOTER_ID: 'voter_id',
    DRIVING_LICENSE: 'driving_license',
};

export const VERIFICATION_STATUS = {
    PENDING: 'pending',
    PROCESSING: 'processing',
    VERIFIED: 'verified',
    FAILED: 'failed',
    MANUAL_REVIEW: 'manual_review',
};

export const WEBHOOK_EVENTS = {
    SUBMITTED: 'kyc.submitted',
    DOCUMENT_VERIFIED: 'kyc.document_verified',
    FACE_VERIFIED: 'kyc.face_verified',
    APPROVED: 'kyc.approved',
    REJECTED: 'kyc.rejected',
    EXPIRED: 'kyc.expired',
    UNDER_REVIEW: 'kyc.under_review',
};