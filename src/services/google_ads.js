const axios = require('axios');
const { hashPII } = require('./gdpr');

// On utilise le GA4 Measurement Protocol
const GA4_API_URL = 'https://www.google-analytics.com/mp/collect';

/**
 * Envoie un événement standard au serveur GA4 via le Measurement Protocol.
 * 
 * @param {string} eventName - Nom de l'événement (ex: page_view, view_item, purchase)
 * @param {Object} eventParams - Les paramètres de l'événement (ex: items, value, currency)
 * @param {Object} profile - Le profil utilisateur (contenant le clientId et le consentement)
 */
async function sendGA4Event(eventName, eventParams, profile) {
    console.log(`[GA4 / GOOGLE ADS] Preparing Event '${eventName}'`);

    // Variables d'environnement nécessaires pour GA4 MP
    const measurementId = process.env.GA4_MEASUREMENT_ID; // ex: G-XXXXXXX
    const apiSecret = process.env.GA4_API_SECRET;         // Généré depuis l'admin GA4

    if (!measurementId || !apiSecret) {
        console.warn('[GA4 / GOOGLE ADS] Missing GA4_MEASUREMENT_ID or GA4_API_SECRET in environment. Skipping event.');
        return { status: 'skipped', reason: 'missing_credentials' };
    }

    // 1. Préparation des identifiants (Hachage RGPD pour Enhanced Conversions)
    const userData = {};
    if (profile.email) userData.sha256_email_address = hashPII(profile.email);
    if (profile.phone) userData.sha256_phone_number = hashPII(profile.phone);

    // 2. Préparation du Consentement
    const consent = {
        ad_storage: profile.consent_status?.ad_storage || 'denied',
        analytics_storage: profile.consent_status?.analytics_storage || 'denied',
        ad_user_data: profile.consent_status?.ad_user_data || 'denied',
        ad_personalization: profile.consent_status?.ad_personalization || 'denied'
    };

    // 3. Construction du Payload GA4
    const payload = {
        client_id: profile.client_id || 'anonymous_server_client',
        consent: consent,
        // On n'ajoute les données utilisateur que s'il y en a, pour maximiser l'Event Match Quality
        user_data: Object.keys(userData).length > 0 ? userData : undefined,
        events: [{
            name: eventName,
            params: eventParams
        }]
    };

    const url = `${GA4_API_URL}?measurement_id=${measurementId}&api_secret=${apiSecret}`;

    try {
        // Le Measurement Protocol ne retourne pas d'erreur de validation (toujours 204), 
        // d'où l'importance d'envoyer un setup propre.
        const response = await axios.post(url, payload, {
            headers: { 'Content-Type': 'application/json' }
        });

        console.log(`[GA4 / GOOGLE ADS] MP Call successful for '${eventName}' (Status: ${response.status})`);
        return { status: 'success' };
    } catch (error) {
        console.error(`[GA4 / GOOGLE ADS] API Error during '${eventName}':`, error.message);
        throw error;
    }
}

module.exports = { sendGA4Event };
