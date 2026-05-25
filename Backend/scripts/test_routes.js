import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.join(__dirname, '..', 'test_config.json');
const BASE_URL = 'http://localhost:8000/api/v1';

async function runTests() {
    console.log('🚀 Starting EKYC Route Tests...');

    if (!fs.existsSync(CONFIG_PATH)) {
        console.error('❌ Config file not found at', CONFIG_PATH);
        process.exit(1);
    }

    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    let accessToken = '';
    let applicationId = '';

    const headers = {
        'Content-Type': 'application/json'
    };

    // 1. Register
    console.log('\n--- Testing Register ---');
    try {
        const regRes = await fetch(`${BASE_URL}/users/register`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                name: config.testName,
                email: config.testEmail,
                password: config.testPassword,
                phone: config.testPhone
            })
        });
        const regData = await regRes.json();
        if (regRes.status === 201) {
            console.log('✅ Registration successful');
        } else if (regRes.status === 409) {
            console.log('ℹ️ User already registered (Skipping)');
        } else {
            console.log('❌ Registration failed:', regData.message);
        }
    } catch (err) {
        console.error('❌ Error during registration:', err.message);
    }

    // 2. Login
    console.log('\n--- Testing Login ---');
    try {
        const loginRes = await fetch(`${BASE_URL}/users/login`, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                email: config.testEmail,
                password: config.testPassword
            })
        });
        const loginData = await loginRes.json();
        if (loginRes.status === 200) {
            console.log('✅ Login successful');
            accessToken = loginData.data.accessToken;
            // Also update config with token if needed for future manual use
            config.accessToken = accessToken;
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
        } else {
            console.error('❌ Login failed:', loginData.message);
            return;
        }
    } catch (err) {
        console.error('❌ Error during login:', err.message);
        return;
    }

    const authHeaders = {
        ...headers,
        'Authorization': `Bearer ${accessToken}`
    };

    // 3. Get Me
    console.log('\n--- Testing Get Me ---');
    try {
        const meRes = await fetch(`${BASE_URL}/users/me`, {
            headers: authHeaders
        });
        const meData = await meRes.json();
        if (meRes.status === 200) {
            console.log('✅ Get Me successful:', meData.data.name);
        } else {
            console.error('❌ Get Me failed:', meData.message);
        }
    } catch (err) {
        console.error('❌ Error during Get Me:', err.message);
    }

    // 4. KYC - Create Application
    console.log('\n--- Testing KYC Create Application ---');
    try {
        const kycCreateRes = await fetch(`${BASE_URL}/kyc`, {
            method: 'POST',
            headers: authHeaders
        });
        const kycCreateData = await kycCreateRes.json();
        if (kycCreateRes.status === 201) {
            console.log('✅ KYC Application created:', kycCreateData.data.applicationNo);
            applicationId = kycCreateData.data._id;
        } else if (kycCreateRes.status === 409) {
            console.log('ℹ️ Active KYC application already exists');
            // Try to fetch existing
            const myAppRes = await fetch(`${BASE_URL}/kyc/my-application`, {
                headers: authHeaders
            });
            const myAppData = await myAppRes.json();
            if (myAppRes.status === 200) {
                applicationId = myAppData.data._id;
                console.log('ℹ️ Using existing application ID:', applicationId);
            }
        } else {
            console.error('❌ KYC Create failed:', kycCreateData.message);
        }
    } catch (err) {
        console.error('❌ Error during KYC Create:', err.message);
    }

    if (applicationId) {
        // 5. KYC - Save Personal Info
        console.log('\n--- Testing KYC Save Personal Info ---');
        try {
            const personalInfo = {
                fullName: config.testName,
                dateOfBirth: '1990-01-01',
                gender: 'male',
                nationality: 'Indian',
                address: {
                    line1: '123 Test Street',
                    city: 'Test City',
                    state: 'Test State',
                    pincode: '123456',
                    country: 'India'
                }
            };
            const kycSaveRes = await fetch(`${BASE_URL}/kyc/${applicationId}/personal-info`, {
                method: 'PUT',
                headers: authHeaders,
                body: JSON.stringify(personalInfo)
            });
            const kycSaveData = await kycSaveRes.json();
            if (kycSaveRes.status === 200) {
                console.log('✅ Personal Info saved');
            } else {
                console.warn('⚠️ Personal Info save returned:', kycSaveData.message);
            }
        } catch (err) {
            console.error('❌ Error during KYC Save:', err.message);
        }

        // 6. KYC - Get Status
        console.log('\n--- Testing KYC Get Status ---');
        try {
            const statusRes = await fetch(`${BASE_URL}/kyc/${applicationId}/status`, {
                headers: authHeaders
            });
            const statusData = await statusRes.json();
            if (statusRes.status === 200) {
                console.log('✅ KYC Status:', statusData.data.status);
            } else {
                console.error('❌ KYC Status check failed:', statusData.message);
            }
        } catch (err) {
            console.error('❌ Error during KYC Status check:', err.message);
        }

        // 7. KYC - Get History
        console.log('\n--- Testing KYC Get History ---');
        try {
            const historyRes = await fetch(`${BASE_URL}/kyc/${applicationId}/history`, {
                headers: authHeaders
            });
            const historyData = await historyRes.json();
            if (historyRes.status === 200) {
                console.log('✅ KYC History fetched (Count:', historyData.data.length, ')');
            } else {
                console.error('❌ KYC History fetch failed:', historyData.message);
            }
        } catch (err) {
            console.error('❌ Error during KYC History fetch:', err.message);
        }
    }

    console.log('\n🏁 Tests Completed.');
}

runTests();
