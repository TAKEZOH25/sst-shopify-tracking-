const crypto = require('crypto');
const http = require('http');

const SECRET = 'test_secret_for_local_development';
const HOST = 'localhost';
const PORT = 3000;
const PATH = '/webhooks/shopify/orders';

function sendRequest(payload, secret, description) {
    const body = JSON.stringify(payload);
    const hmac = crypto.createHmac('sha256', secret)
        .update(body, 'utf8')
        .digest('base64');

    const options = {
        hostname: HOST,
        port: PORT,
        path: PATH,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Shopify-Hmac-Sha256': hmac,
            'Content-Length': Buffer.byteLength(body)
        }
    };

    const req = http.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
            console.log(`[${description}] Status: ${res.statusCode}, Body: ${data}`);
        });
    });

    req.on('error', (e) => {
        console.error(`[${description}] Error: ${e.message}`);
    });

    req.write(body);
    req.end();
}

// Test 1: Valid Signature
const mockShopifyOrder = {
    id: 9876543210,
    email: 'test@example.com',
    phone: '+33612345678',
    total_price: '59.99',
    currency: 'EUR',
    customer: {
        id: 1234567890,
        email: 'test@example.com',
        first_name: 'Jean',
        last_name: 'Dupont',
        phone: '+33612345678'
    }
};

sendRequest(mockShopifyOrder, SECRET, 'TEST 1: Valid Signature');

// Test 2: Invalid Signature (Wrong Secret)
sendRequest({ test: 'invalid_data' }, 'wrong_secret', 'TEST 2: Invalid Signature');

// Test 3: Missing Header
const optionsMissingHeader = {
    hostname: HOST,
    port: PORT,
    path: PATH,
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    }
};
const reqMissing = http.request(optionsMissingHeader, (res) => {
    console.log(`[TEST 3: Missing Header] Status: ${res.statusCode}`);
});
reqMissing.end(JSON.stringify({ test: 'missing_header' }));
