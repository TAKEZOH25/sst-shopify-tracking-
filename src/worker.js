const { Worker } = require('bullmq');
const IORedis = require('ioredis');

// Parse REDIS_URL from .env or use default
const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null, // Required by BullMQ
});

console.log('[WORKER] Starting Worker...');

const worker = new Worker('shopify-webhooks', async (job) => {
    console.log(`[WORKER] Processing job ${job.id} of type ${job.name}`);
    console.log(`[WORKER] Job Data:`, JSON.stringify(job.data, null, 2));

    const { resolveIdentity } = require('./services/identity');
    const { hasAdConsent } = require('./services/gdpr');
    const { sendEnhancedConversion } = require('./services/google_ads');
    const { insertEvent } = require('./services/events');
    const { trackEvent } = require('./services/posthog');

    try {
        let profile = null;

        // -------------------------------------------------------------
        // BRANCH 1: FRONTEND EVENTS (Pixel)
        // -------------------------------------------------------------
        if (job.name === 'process_frontend_event') {
            const { event_name, id, clientId, timestamp, url, data } = job.data;

            if (!clientId) {
                console.warn(`[WORKER] Missing clientId in frontend event. Skipping.`);
                return { status: 'skipped', reason: 'Missing clientId' };
            }

            // Extraction d'un email potentiel depuis le payload frontend (ex: checkout)
            const potentialEmail = data?.checkout?.email || data?.customer?.email || null;

            // Résolution d'identité (Création profil Anonyme ou Stitching avec l'email)
            profile = await resolveIdentity({
                client_id: clientId,
                email: potentialEmail,
            });

            // Sauvegarde de l'événement dans l'historique de l'utilisateur
            await insertEvent(profile.id, event_name, 'frontend', job.data);

            // POSTHOG: Analytics Tracking
            trackEvent(profile.id, event_name, {
                $current_url: url,
                frontend_client_id: clientId,
                ...data
            });

            console.log(`[WORKER] Frontend Event '${event_name}' processed successfully for profile ${profile.id}.`);
            return { status: 'success', eventId: id, profileId: profile.id };
        }

        // -------------------------------------------------------------
        // BRANCH 2: BACKEND EVENTS (Shopify Webhooks)
        // -------------------------------------------------------------
        else if (job.name === 'order_created') {
            // 1. Validate payload structure
            const { email, phone, total_price, currency, customer } = job.data;
            const id = job.data.id || job.data.checkout_id || job.data.token || job.data.name || 'test_id_' + Date.now();

            if (!id) throw new Error('Missing Order ID in payload');

            // 2. Normalize Data
            const orderData = {
                orderId: id,
                customerEmail: email || customer?.email,
                customerPhone: phone || customer?.phone,
                firstName: customer?.first_name,
                lastName: customer?.last_name,
                shopifyCustomerId: customer?.id,
                amount: total_price,
                currency: currency,
                processedAt: new Date().toISOString()
            };

            console.log(`[WORKER] Order ${orderData.orderId} normalized:`, orderData);

            // 3. Identity Resolution (Brick 3)
            try {
                profile = await resolveIdentity({
                    email: orderData.customerEmail,
                    phone: orderData.customerPhone,
                    first_name: orderData.firstName,
                    last_name: orderData.lastName,
                    shopify_customer_id: orderData.shopifyCustomerId
                });
            } catch (idError) {
                console.warn(`[WORKER] Identity resolution failed for order ${orderData.orderId}:`, idError.message);
            }

            if (profile) {
                // Sauvegarde de l'événement d'achat backend dans l'historique
                await insertEvent(profile.id, 'order_created', 'backend', job.data);

                // POSTHOG: Track successful order
                trackEvent(profile.id, 'order_created', {
                    revenue: orderData.amount,
                    currency: orderData.currency,
                    order_id: orderData.orderId
                });

                // 4. GDPR & Google Ads (Brick 4) - Temporarily bypassed to focus on Analytics
                const consentGranted = hasAdConsent(profile);
                console.log(`[GDPR] Consent status for profile ${profile.id}: ${consentGranted ? 'GRANTED' : 'DENIED'}`);

                if (consentGranted) {
                    try {
                        await sendEnhancedConversion(orderData, profile);
                        console.log(`[GOOGLE ADS] Enhanced Conversion sent for order ${orderData.orderId}`);
                    } catch (adsError) {
                        console.error(`[GOOGLE ADS] Failed to send conversion: ${adsError.message}`);
                    }
                } else {
                    console.log(`[GDPR] Skipping Google Ads due to lack of consent.`);
                }
            } else {
                console.log(`[WORKER] No profile found, cannot determine consent. Skipping Google Ads.`);
            }

            console.log(`[WORKER] Order ${orderData.orderId} processed successfully.`);
            return { status: 'success', orderId: orderData.orderId };
        }
        else {
            throw new Error(`Unknown job name: ${job.name}`);
        }

    } catch (error) {
        console.error(`[WORKER] Job ${job.id} failed:`, error);
        throw error; // BullMQ will retry based on configuration
    }
}, {
    connection,
    concurrency: 5 // Process 5 jobs in parallel
});

worker.on('completed', (job) => {
    console.log(`[WORKER] Job ${job.id} has completed!`);
});

worker.on('failed', (job, err) => {
    console.error(`[WORKER] Job ${job.id} has failed with ${err.message}`);
});

console.log('[WORKER] Worker is ready and listening for jobs.');
