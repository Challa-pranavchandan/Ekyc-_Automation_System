# E-KYC Identity Verification System (Viewer)

## Overview
The **E-KYC (Electronic Know Your Customer)** project is a modern, secure, and automated identity verification platform. It streamlines the customer onboarding process by replacing traditional manual verification with a digital-first approach. By leveraging OCR (Optical Character Recognition) and biometric matching, the system ensures that user identities are verified accurately and efficiently.

## What is eKYC?
**Electronic Know Your Customer (eKYC)** is the digital process of verifying a customer's identity. It is a critical requirement for financial institutions, service providers, and platforms to prevent fraud, money laundering, and identity theft. Unlike traditional KYC, which requires physical documents and manual processing, eKYC uses digital data and automated tools to confirm a person's identity in real-time.

---

## Architecture: Why Microservices?
The system architecture is designed around **Microservice Principles**, ensuring that complex, high-latency tasks (like OCR and Biometric Match) are decoupled from the user-facing transactional logic.

### Chosen Architecture: Modular Service Design
We have implemented a **Modular Monolith** that is ready for horizontal scaling:
1.  **Identity Service (Auth)**: Manages secure user lifecycles, JWT issuing, and role-based access control (RBAC).
2.  **Document Engine (OCR)**: Leverages **Tesseract.js** to process legal documents. By isolating this, we can easily swap the engine for a cloud-native OCR service (like AWS Textract) in the future.
3.  **Biometric Service (FaceMatch)**: Handles facial data processing. Decoupling this allows for specialized security auditing on biometric data.
4.  **Verification Orchestrator (KYC)**: A state machine that manages the progression of an application from `Draft` to `Verified`.
5.  **Admin Operations (Audit)**: A dedicated management layer for human reviewers, providing high-level stats and manual override capabilities.
6.  **Notification Webhooks**: An event-driven bridge to notify third-party client systems of verification results.

### Why this approach was chosen:
*   **Performance Optimization**: Tasks like OCR are CPU-intensive. Modularization allows us to offload these to separate background workers if needed.
*   **Security Isolation**: Sensitive data (like ID photos) is handled by specific services, allowing for tighter ACLs (Access Control Lists).
*   **Seamless Integration**: The Webhook service enables easy integration into existing enterprise workflows without modifying the core logic.
*   **Future-Proofing**: We can migrate any single service (e.g., FaceMatch) to a specialized 3rd party API or a GPU-accelerated microservice without affecting other parts of the system.

---

## Tech Stack
- **Frontend**: React.js 19, Vite, Tailwind CSS, React Hot Toast.
- **Backend**: Node.js, Express.js (v5), Mongoose.
- **Database**: MongoDB (Atlas).
- **Processing**: Tesseract.js (OCR), Cloudinary (Image Processing/Storage).
- **Utilities**: JWT (Auth), Axios, Multer (File Handling), Dotenv.

---

## Scope of Project
The current scope includes:
- **Secured Onboarding**: User accounts with encrypted credentials and session management.
- **Automated Data Extraction**: OCR capabilities to pull text from uploaded IDs.
- **Biometric Matching**: Comparing user selfies against ID photos to ensure ownership.
- **Admin Review Queue**: A dedicated portal for admins to approve/reject/override applications.
- **Audit Logging**: Every action (status change, override) is recorded for compliance.
- **Cloud Integration**: Using **Cloudinary** for secure document storage and **MongoDB** for flexible data management.

---

## Future Improvements
- [ ] **Liveness Detection**: Integrate real-time video liveness checks to prevent "photo-of-a-photo" spoofing.
- [ ] **AI Fraud Detection**: Implement ML models to identify forged or tampered documents.
- [ ] **Global Document Support**: Expand OCR templates to support international passports and IDs.
- [ ] **Blockchain Integration**: Store verification hashes on a ledger for immutable identity proof.
- [ ] **Mobile App Implementation**: Native SDKs for mobile-first verification experiences.

---

## Setup & Research
For technical details on how to run the services, please refer to the `README.md` files in the [Backend](./Backend) and [Frontend](./Frontend) directories.
