/**
 * Shopify Web Pixel - GDPR Consent Integration
 * 
 * Ce script est à ajouter dans les paramètres de Shopify:
 * Settings -> Customer events -> Add custom pixel
 * 
 * Il s'abonne aux événements Shopify et capture le consentement de l'utilisateur
 * via l'API de confidentialité de Shopify Customer Privacy (Environnement Web Pixel Sandbox).
 */

// L'URL de votre serveur de tracking SST configuré via Nginx Proxy Manager
const SST_ENDPOINT = 'https://sst.art-virtuoso.com/api/track';

// Générer ou récupérer un Client ID (identifiant cookie 1st party)
function getOrCreateClientId() {
    let clientId = document.cookie.replace(/(?:(?:^|.*;\s*)sst_client_id\s*\=\s*([^;]*).*$)|^.*$/, "$1");
    if (!clientId) {
        clientId = 'sst_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
        const date = new Date();
        date.setTime(date.getTime() + (365 * 24 * 60 * 60 * 1000)); // 1 an
        document.cookie = `sst_client_id=${clientId};expires=${date.toUTCString()};path=/;SameSite=Lax`;
    }
    return clientId;
}

// -------------------------------------------------------------
// GESTION DU CONSENTEMENT (NATIVE SHOPIFY WEB PIXEL API)
// -------------------------------------------------------------

// On récupère le consentement tel qu'il est au moment exact où la page charge
let currentConsent = null;
if (typeof api !== 'undefined' && api.init && api.init.customerPrivacy) {
    currentConsent = api.init.customerPrivacy;
} else if (typeof init !== 'undefined' && init.customerPrivacy) {
    currentConsent = init.customerPrivacy;
}

// S'abonner activement si l'utilisateur change ses préférences en direct (clic sur la bannière)
if (typeof api !== 'undefined' && api.customerPrivacy && typeof api.customerPrivacy.subscribe === 'function') {
    api.customerPrivacy.subscribe("visitorConsentCollected", (event) => {
        if (event && event.customerPrivacy) {
            currentConsent = event.customerPrivacy;
            sendEventToSST('consent_updated', { preferences: currentConsent });
        }
    });
} else if (typeof analytics !== 'undefined' && analytics.subscribe) {
    // Fallback incertain pour les vieux environnements
    analytics.subscribe("visitorConsentCollected", (event) => {
        if (event && event.customerPrivacy) {
            currentConsent = event.customerPrivacy;
            sendEventToSST('consent_updated', { preferences: currentConsent });
        }
    });
}

// Convertisseur pour le format Google / Supabase
function getShopifyConsentStatus() {
    if (!currentConsent) return null;

    // Dans l'environnement Web Pixel, les valeurs sont des attributs booléens directs
    return {
        ad_storage: currentConsent.marketingAllowed === true ? 'granted' : 'denied',
        analytics_storage: currentConsent.analyticsProcessingAllowed === true ? 'granted' : 'denied',
        personalization_storage: currentConsent.preferencesProcessingAllowed === true ? 'granted' : 'denied',
        ad_user_data: currentConsent.marketingAllowed === true ? 'granted' : 'denied',
        ad_personalization: currentConsent.marketingAllowed === true ? 'granted' : 'denied'
    };
}

// -------------------------------------------------------------
// ENVOI AU SERVEUR HOSTINGER
// -------------------------------------------------------------

function sendEventToSST(eventName, eventData) {
    const clientId = getOrCreateClientId();
    const consentStatus = getShopifyConsentStatus();

    const payload = {
        event_name: eventName,
        clientId: clientId,
        url: window.location.href || (typeof init !== 'undefined' && init.context && init.context.document ? init.context.document.location.href : ''),
        timestamp: new Date().toISOString(),
        consent_status: consentStatus, // L'étiquette magique pour le backend
        ...eventData
    };

    // Utilisation de sendBeacon pour ne pas ralentir la navigation
    if (navigator.sendBeacon) {
        navigator.sendBeacon(SST_ENDPOINT, JSON.stringify(payload));
    } else {
        fetch(SST_ENDPOINT, {
            method: 'POST',
            body: JSON.stringify(payload),
            headers: { 'Content-Type': 'application/json' },
            keepalive: true
        }).catch(err => console.error("SST Tracking failed:", err));
    }
}

// --- ÉCOUTE DES ÉVÉNEMENTS SHOPIFY (Web Pixel Standard) ---

analytics.subscribe("page_viewed", (event) => {
    sendEventToSST('page_viewed', { data: event.data });
});

analytics.subscribe("product_viewed", (event) => {
    sendEventToSST('product_viewed', { data: event.data });
});

analytics.subscribe("product_added_to_cart", (event) => {
    sendEventToSST('product_added_to_cart', { data: event.data });
});

analytics.subscribe("checkout_started", (event) => {
    sendEventToSST('checkout_started', { data: event.data });
});

analytics.subscribe("checkout_completed", (event) => {
    sendEventToSST('checkout_completed', { data: event.data });
});
