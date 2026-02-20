const crypto = require('crypto');

/**
 * Normalizes and hashes PII (Personally Identifiable Information) using SHA-256.
 * Google Ads requires:
 * - Email: lowercase, remove whitespace, SHA-256
 * - Phone: E.164 format, SHA-256
 * @param {string} data - The data to hash
 * @returns {string} The SHA-256 hash or null if data is empty
 */
function hashPII(data) {
    if (!data) return null;
    const normalized = data.trim().toLowerCase();
    return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Checks if the user has granted consent for ad storage.
 * @param {Object} profile - The user profile containing consent status
 * @returns {boolean} True if consent is granted, false otherwise.
 */
function hasAdConsent(profile) {
    if (!profile || !profile.consent_status) {
        return false; // Default to blocked if no consent info found
    }

    // Check for 'ad_storage' or 'ad_user_data' granted
    // Structure expected: { "ad_storage": "granted", ... }
    return profile.consent_status.ad_storage === 'granted' ||
        profile.consent_status.ad_user_data === 'granted';
}

module.exports = {
    hashPII,
    hasAdConsent
};
