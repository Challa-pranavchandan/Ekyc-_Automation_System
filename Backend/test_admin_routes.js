
import axios from 'axios';
import fs from 'fs';

const BASE_URL = 'http://localhost:8000/api/v1';
const LOGIN_DATA = {
    email: 'admin@ekyc.com',
    password: 'Admin@123'
};

async function testAdminRoutes() {
    const results = [];
    let accessToken = '';

    try {
        console.log('Logging in...');
        const loginRes = await axios.post(`${BASE_URL}/users/login`, LOGIN_DATA);
        accessToken = loginRes.data.data.accessToken;
        console.log('Login successful.');
    } catch (err) {
        console.error('Login failed:', err.response?.data || err.message);
        return;
    }

    const client = axios.create({
        baseURL: `${BASE_URL}/admin`,
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });

    const routesToTest = [
        { method: 'GET', url: '/stats', name: 'Dashboard Stats', description: 'Fetch overview statistics for the admin dashboard' },
        { method: 'GET', url: '/review-queue', name: 'Review Queue', description: 'List applications waiting for review' },
        { method: 'GET', url: '/users', name: 'All Users', description: 'List all registered users' },
        { method: 'GET', url: '/audit-logs', name: 'Audit Logs', description: 'Fetch system audit trails' }
    ];

    for (const route of routesToTest) {
        console.log(`Testing ${route.name}...`);
        try {
            const start = Date.now();
            const res = await client({ method: route.method, url: route.url });
            const duration = Date.now() - start;
            results.push({
                ...route,
                status: 'Success',
                code: res.status,
                duration: `${duration}ms`,
                data: res.data.success ? 'Valid Response' : 'Error in Response'
            });
        } catch (err) {
            results.push({
                ...route,
                status: 'Failed',
                code: err.response?.status || 'N/A',
                error: err.response?.data?.message || err.message
            });
        }
    }

    // Application detail test (need a real ID, but we can check if it fails with 404 or something else)
    console.log('Testing Application Detail (Expect 404/Null)...');
    try {
        const res = await client.get('/applications/6654a9d7b41e8c0012345678');
        results.push({
            method: 'GET',
            url: '/applications/:id',
            name: 'Application Detail',
            description: 'Get full details of a specific KYC application',
            status: 'Success',
            code: res.status
        });
    } catch (err) {
        results.push({
            method: 'GET',
            url: '/applications/:id',
            name: 'Application Detail',
            description: 'Get full details of a specific KYC application',
            status: err.response?.status === 404 ? 'Success (Not Found handled)' : 'Failed',
            code: err.response?.status || 'N/A',
            error: err.response?.data?.message || err.message
        });
    }

    // Generate MD file
    let mdContent = '# Admin Routes Test Results\n\n';
    mdContent += `Generated at: ${new Date().toLocaleString()}\n\n`;
    mdContent += '| Route Name | Method | URL | Description | Status | Code | Note |\n';
    mdContent += '| --- | --- | --- | --- | --- | --- | --- |\n';

    for (const r of results) {
        mdContent += `| ${r.name} | ${r.method} | \`${r.url}\` | ${r.description} | ${r.status} | ${r.code} | ${r.error || r.duration || ''} |\n`;
    }

    // Add summaries of what each route does
    mdContent += '\n## Route Details\n\n';
    mdContent += '### 1. Dashboard Stats (`GET /api/v1/admin/stats`)\n';
    mdContent += '- **Purpose**: Provides high-level metrics for the admin dashboard.\n';
    mdContent += '- **Data**: Total applications, pending reviews, approval rate, user count, and submission trends over the last 7 days.\n';
    mdContent += '- **Permission**: Admin, Reviewer, Superadmin.\n\n';

    mdContent += '### 2. Review Queue (`GET /api/v1/admin/review-queue`)\n';
    mdContent += '- **Purpose**: Lists KYC applications that require manual review.\n';
    mdContent += '- **Features**: Supports pagination, sorting (FIFO by default), and status filtering.\n';
    mdContent += '- **Permission**: Admin, Reviewer, Superadmin.\n\n';

    mdContent += '### 3. Application Detail (`GET /api/v1/admin/applications/:id`)\n';
    mdContent += '- **Purpose**: Retrieves the full dataset for a single application, including uploaded documents, face verification results, and audit history.\n';
    mdContent += '- **Permission**: Admin, Reviewer, Superadmin.\n\n';

    mdContent += '### 4. Approve/Reject (`POST /api/v1/admin/applications/:id/approve` or `/reject`)\n';
    mdContent += '- **Purpose**: Finalize a KYC application review.\n';
    mdContent += '- **Action**: Updates application status, sets the reviewer ID, and logs the action in the audit trail.\n';
    mdContent += '- **Permission**: Admin, Superadmin (Reviewers are read-only).\n\n';

    mdContent += '### 5. Manual Override (`POST /api/v1/admin/applications/:id/override`)\n';
    mdContent += '- **Purpose**: Force a status change on any application regardless of its current state.\n';
    mdContent += '- **Permission**: Superadmin ONLY.\n\n';

    mdContent += '### 6. User Management (`GET /users` and `PATCH /users/:id/status`)\n';
    mdContent += '- **Purpose**: List all users and enable/disable/suspend accounts.\n';
    mdContent += '- **Permission**: Admin, Superadmin.\n\n';

    mdContent += '### 7. Audit Logs (`GET /api/v1/admin/audit-logs`)\n';
    mdContent += '- **Purpose**: System-wide activity tracking (who did what, when, and from where).\n';
    mdContent += '- **Permission**: Admin, Reviewer, Superadmin.\n\n';

    fs.writeFileSync('Admin_Route_Test_Results.md', mdContent);
    console.log('Results written to Admin_Route_Test_Results.md');
}

testAdminRoutes();
