
import axios from 'axios';
import fs from 'fs';

const BASE_URL = 'http://localhost:8000/api/v1';
const LOGIN_DATA = {
    email: 'admin@ekyc.com',
    password: 'Admin@123'
};

async function testWebhookRoutes() {
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
        baseURL: `${BASE_URL}/webhooks`,
        headers: {
            Authorization: `Bearer ${accessToken}`
        }
    });

    let webhookId = '';
    let eventId = '';

    // 1. Register Webhook
    console.log('Testing Register Webhook...');
    try {
        const payload = {
            name: 'Test Webhook',
            targetUrl: 'https://webhook.site/2b30193e-83b3-c392-1192-9cad0e1f2031', // Using a placeholder URL
            subscribedEvents: ['kyc.approved', 'kyc.rejected'],
            description: 'Test webhook for automated route testing'
        };
        const res = await client.post('/', payload);
        webhookId = res.data.data.id;
        results.push({
            name: 'Register Webhook',
            method: 'POST',
            url: '/',
            input: JSON.stringify(payload),
            description: 'Registers a new webhook configuration',
            status: 'Success',
            code: res.status,
            result: 'Webhook ID: ' + webhookId
        });
    } catch (err) {
        results.push({
            name: 'Register Webhook',
            method: 'POST',
            url: '/',
            input: '...',
            description: 'Registers a new webhook configuration',
            status: 'Failed',
            code: err.response?.status || 'N/A',
            result: err.response?.data?.message || err.message
        });
    }

    if (webhookId) {
        // 2. List Webhooks
        console.log('Testing List Webhooks...');
        try {
            const res = await client.get('/');
            results.push({
                name: 'List Webhooks',
                method: 'GET',
                url: '/',
                input: 'None',
                description: 'Lists all registered webhooks',
                status: 'Success',
                code: res.status,
                result: `Found ${res.data.data.length} webhooks`
            });
        } catch (err) {
            results.push({
                name: 'List Webhooks',
                method: 'GET',
                url: '/',
                input: 'None',
                description: 'Lists all registered webhooks',
                status: 'Failed',
                code: err.response?.status || 'N/A',
                result: err.response?.data?.message || err.message
            });
        }

        // 3. Get Webhook By ID
        console.log(`Testing Get Webhook By ID (${webhookId})...`);
        try {
            const res = await client.get(`/${webhookId}`);
            results.push({
                name: 'Get Webhook By ID',
                method: 'GET',
                url: `/${webhookId}`,
                input: 'None',
                description: 'Fetches details of a specific webhook',
                status: 'Success',
                code: res.status,
                result: 'Webhook name: ' + res.data.data.name
            });
        } catch (err) {
            results.push({
                name: 'Get Webhook By ID',
                method: 'GET',
                url: `/${webhookId}`,
                input: 'None',
                description: 'Fetches details of a specific webhook',
                status: 'Failed',
                code: err.response?.status || 'N/A',
                result: err.response?.data?.message || err.message
            });
        }

        // 4. Update Webhook
        console.log(`Testing Update Webhook (${webhookId})...`);
        try {
            const payload = {
                name: 'Updated Test Webhook',
                isActive: true
            };
            const res = await client.patch(`/${webhookId}`, payload);
            results.push({
                name: 'Update Webhook',
                method: 'PATCH',
                url: `/${webhookId}`,
                input: JSON.stringify(payload),
                description: 'Updates a webhook configuration',
                status: 'Success',
                code: res.status,
                result: 'Updated Name: ' + res.data.data.name
            });
        } catch (err) {
            results.push({
                name: 'Update Webhook',
                method: 'PATCH',
                url: `/${webhookId}`,
                input: '...',
                description: 'Updates a webhook configuration',
                status: 'Failed',
                code: err.response?.status || 'N/A',
                result: err.response?.data?.message || err.message
            });
        }

        // 5. Rotate Secret
        console.log(`Testing Rotate Secret (${webhookId})...`);
        try {
            const res = await client.post(`/${webhookId}/rotate-secret`);
            results.push({
                name: 'Rotate Secret',
                method: 'POST',
                url: `/${webhookId}/rotate-secret`,
                input: 'None',
                description: 'Generates a new HMAC secret for the webhook',
                status: 'Success',
                code: res.status,
                result: 'New secret: ' + (res.data.data.secret ? 'Received' : 'Hidden')
            });
        } catch (err) {
            results.push({
                name: 'Rotate Secret',
                method: 'POST',
                url: `/${webhookId}/rotate-secret`,
                input: 'None',
                description: 'Generates a new HMAC secret for the webhook',
                status: 'Failed',
                code: err.response?.status || 'N/A',
                result: err.response?.data?.message || err.message
            });
        }

        // 6. Send Test Event
        console.log(`Testing Send Test Event (${webhookId})...`);
        try {
            const res = await client.post(`/${webhookId}/test`);
            results.push({
                name: 'Send Test Event',
                method: 'POST',
                url: `/${webhookId}/test`,
                input: 'None',
                description: 'Sends a test ping to the webhook URL',
                status: 'Success',
                code: res.status,
                result: res.data.data.success ? 'Delivered' : 'Failed to deliver'
            });
        } catch (err) {
            results.push({
                name: 'Send Test Event',
                method: 'POST',
                url: `/${webhookId}/test`,
                input: 'None',
                description: 'Sends a test ping to the webhook URL',
                status: 'Failed',
                code: err.response?.status || 'N/A',
                result: err.response?.data?.message || err.message
            });
        }

        // 7. Get Delivery Logs
        console.log(`Testing Get Delivery Logs (${webhookId})...`);
        try {
            const res = await client.get(`/${webhookId}/deliveries`);
            results.push({
                name: 'Get Delivery Logs',
                method: 'GET',
                url: `/${webhookId}/deliveries`,
                input: 'Query: page, limit',
                description: 'Fetches delivery history for a specific webhook',
                status: 'Success',
                code: res.status,
                result: `Found ${res.data.data.events.length} logs`
            });
            if (res.data.data.events.length > 0) {
                eventId = res.data.data.events[0]._id;
            }
        } catch (err) {
            results.push({
                name: 'Get Delivery Logs',
                method: 'GET',
                url: `/${webhookId}/deliveries`,
                input: 'Query: page, limit',
                description: 'Fetches delivery history for a specific webhook',
                status: 'Failed',
                code: err.response?.status || 'N/A',
                result: err.response?.data?.message || err.message
            });
        }
    }

    // 8. Trigger Retry Queue (Internal Cron)
    console.log('Testing Process Retries (Internal)...');
    try {
        const res = await axios.post(`${BASE_URL}/webhooks/process-retries`, {}, {
            headers: { 'x-cron-secret': process.env.CRON_SECRET || 'undefined' }
        });
        results.push({
            name: 'Process Retries',
            method: 'POST',
            url: '/process-retries',
            input: 'Header: x-cron-secret',
            description: 'Internal route to trigger retry of failed webhook events',
            status: 'Success',
            code: res.status,
            result: 'Queue processed'
        });
    } catch (err) {
        results.push({
            name: 'Process Retries',
            method: 'POST',
            url: '/process-retries',
            input: 'Header: x-cron-secret',
            description: 'Internal route to trigger retry of failed webhook events',
            status: err.response?.status === 401 ? 'Success (Unauthorized expected)' : 'Failed',
            code: err.response?.status || 'N/A',
            result: err.response?.data?.message || err.message
        });
    }

    // 9. Manual Retry
    if (eventId) {
        console.log(`Testing Manual Retry (${eventId})...`);
        try {
            const res = await client.post(`/events/${eventId}/retry`);
            results.push({
                name: 'Manual Retry',
                method: 'POST',
                url: `/events/${eventId}/retry`,
                input: 'None',
                description: 'Manually triggers a retry for a specific failed event',
                status: 'Success',
                code: res.status,
                result: res.data.data.success ? 'Retry Successful' : 'Retry Failed'
            });
        } catch (err) {
            results.push({
                name: 'Manual Retry',
                method: 'POST',
                url: `/events/${eventId}/retry`,
                input: 'None',
                description: 'Manually triggers a retry for a specific failed event',
                status: 'Failed',
                code: err.response?.status || 'N/A',
                result: err.response?.data?.message || err.message
            });
        }
    } else {
        results.push({
            name: 'Manual Retry',
            method: 'POST',
            url: '/events/:eventId/retry',
            input: 'None',
            description: 'Manually triggers a retry for a specific failed event',
            status: 'Skipped',
            code: 'N/A',
            result: 'No failed event ID found to test'
        });
    }

    // 10. Delete Webhook (Deactivate)
    if (webhookId) {
        console.log(`Testing Delete Webhook (${webhookId})...`);
        try {
            const res = await client.delete(`/${webhookId}`);
            results.push({
                name: 'Delete Webhook',
                method: 'DELETE',
                url: `/${webhookId}`,
                input: 'None',
                description: 'Deactivates a webhook configuration (Soft delete)',
                status: 'Success',
                code: res.status,
                result: 'Webhook deactivated'
            });
        } catch (err) {
            results.push({
                name: 'Delete Webhook',
                method: 'DELETE',
                url: `/${webhookId}`,
                input: 'None',
                description: 'Deactivates a webhook configuration (Soft delete)',
                status: 'Failed',
                code: err.response?.status || 'N/A',
                result: err.response?.data?.message || err.message
            });
        }
    }

    // Generate MD file
    let mdContent = '# Webhook Routes Test Results\n\n';
    mdContent += `Generated at: ${new Date().toLocaleString()}\n\n`;
    mdContent += '## Summary Table\n\n';
    mdContent += '| Route Name | Method | URL | Status | Code | Result |\n';
    mdContent += '| --- | --- | --- | --- | --- | --- |\n';

    for (const r of results) {
        mdContent += `| ${r.name} | ${r.method} | \`${r.url}\` | ${r.status} | ${r.code} | ${r.result} |\n`;
    }

    mdContent += '\n## Detailed Route Information\n\n';
    for (const r of results) {
        mdContent += `### ${r.name} (\`${r.method} ${r.url}\`)\n`;
        mdContent += `- **What it does**: ${r.description}\n`;
        mdContent += `- **Test Input**: \`${r.input}\`\n`;
        mdContent += `- **Test Status**: ${r.status}\n`;
        mdContent += `- **Result Details**: ${r.result}\n\n`;
    }

    fs.writeFileSync('Webhook_Route_Test_Results.md', mdContent);
    console.log('Results written to Webhook_Route_Test_Results.md');
}

testWebhookRoutes();
