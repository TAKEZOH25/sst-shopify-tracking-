const axios = require('axios'); // We might need to install axios
const { hashPII } = require('./gdpr');

const GOOGLE_ADS_API_VERSION = 'v15'; // Check for latest version
const GOOGLE_ADS_CUSTOMER_ID = process.env.GOOGLE_ADS_CUSTOMER_ID;
const GOOGLE_ADS_DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
// Note: Real Google Ads integration requires OAuth2 or Service Account flow.
// For simplicity in this brick, we'll structure the payload and log the request.

/**
 * Sends Enhanced Conversion to Google Ads.
 * @param {Object} orderData - Normalized order data
 * @param {Object} profile - Resolved user profile
 */
async function sendEnhancedConversion(orderData, profile) {
    console.log(`[GOOGLE ADS] Preparing Enhanced Conversion for Order ${orderData.orderId}`);

    // 1. Prepare User Identifiers with Hashing
    const userIdentifiers = [];

    if (profile.email) {
        userIdentifiers.push({
            user_identifier_source: 'FIRST_PARTY',
            hashed_email: hashPII(profile.email)
        });
    }

    if (profile.phone) {
        userIdentifiers.push({
            user_identifier_source: 'FIRST_PARTY',
            hashed_phone_number: hashPII(profile.phone)
        });
    }

    // 2. Construct Payload
    const conversionActionId = process.env.GOOGLE_ADS_CONVERSION_ACTION_ID; // From .env
    const body = {
        conversionAction: `customers/${GOOGLE_ADS_CUSTOMER_ID}/conversionActions/${conversionActionId}`,
        conversionDateTime: orderData.processedAt, // Format check needed: "yyyy-mm-dd hh:mm:ss+|-hh:mm"
        conversionValue: orderData.amount,
        currencyCode: orderData.currency,
        orderId: orderData.orderId,
        userIdentifiers: userIdentifiers
    };

    console.log('[GOOGLE ADS] Payload:', JSON.stringify(body, null, 2));

    // 3. Send Request (Mocked for now)
    // In a real scenario, we would use axios.post(...) to Google Ads API endpoint
    // https://googleads.googleapis.com/v15/customers/{customerId}:uploadClickConversions

    // Simulate API call
    if (process.env.DRY_RUN !== 'false') {
        console.log('[GOOGLE ADS] Dry run enabled. Skipping actual API call.');
        return { status: 'skipped', reason: 'dry_run' };
    }

    try {
        // await axios.post(...)
        console.log('[GOOGLE ADS] Mock API call successful.');
        return { status: 'success' };
    } catch (error) {
        console.error('[GOOGLE ADS] API Error:', error.message);
        throw error;
    }
}

module.exports = { sendEnhancedConversion };
