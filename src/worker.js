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
    const { sendGA4Event } = require('./services/google_ads');
    const { insertEvent } = require('./services/events');
    const { trackEvent } = require('./services/posthog');

    try {
        let profile = null;

        // -------------------------------------------------------------
        // BRANCH 1: FRONTEND EVENTS (Pixel)
        // -------------------------------------------------------------
        if (job.name === 'process_frontend_event') {
            const { id, clientId, timestamp, url, data } = job.data;
            const event_name = job.data.event_name || 'unknown_event';

            if (!clientId) {
                console.warn(`[WORKER] Missing clientId in frontend event. Skipping.`);
                return { status: 'skipped', reason: 'Missing clientId' };
            }

            // Extraction d'un email potentiel depuis le payload frontend (ex: checkout)
            const potentialEmail = data?.checkout?.email || data?.customer?.email || null;

            // Extraction du statut de consentement (s'il est envoyé par le pixel frontend)
            const consent_status = data?.consent_status || job.data?.consent_status || null;

            // Résolution d'identité (Création profil Anonyme ou Stitching avec l'email et Consentement)
            profile = await resolveIdentity({
                client_id: clientId,
                email: potentialEmail,
                consent_status: consent_status
            });

            // Sauvegarde de l'événement dans l'historique de l'utilisateur
            await insertEvent(profile.id, event_name, 'frontend', job.data);

            // POSTHOG: Analytics Tracking
            trackEvent(profile.id, event_name, {
                $current_url: url,
                frontend_client_id: clientId,
                ...data
            });

            // GA4 Measurement Protocol: Tracking de tous les événements frontend
            const eventMapping = {
                'page_viewed': 'page_view',
                'product_viewed': 'view_item',
                'product_added_to_cart': 'add_to_cart',
                'checkout_started': 'begin_checkout',
                'checkout_completed': 'purchase',
                'consent_updated': 'consent_updated' // Garde le même nom
            };
            const ga4EventName = eventMapping[event_name] || event_name;

            try {
                const ga4Params = {
                    page_location: url,
                };

                // Extraction pour les pages produits, paniers, etc. pour correspondre au Merchant Center
                if (data?.productVariant) {
                    const productVariant = data.productVariant;
                    const product = productVariant.product || {};

                    if (productVariant.price?.amount) {
                        ga4Params.value = parseFloat(productVariant.price.amount);
                        ga4Params.currency = productVariant.price.currencyCode || 'EUR';
                    }

                    // Construction de l'Identifiant exact pour Google Merchant Center
                    // Format Shopify Native App: shopify_FR_[Product_ID]_[Variant_ID]
                    const productId = product.id ? product.id.toString() : '';
                    const variantId = productVariant.id ? productVariant.id.toString() : '';

                    let mcItemId = productVariant.sku || variantId; // Fallback
                    if (productId && variantId) {
                        mcItemId = `shopify_FR_${productId}_${variantId}`;
                    }

                    ga4Params.items = [{
                        item_id: mcItemId,
                        item_name: product.title || product.untranslatedTitle || 'Unknown Product',
                        price: ga4Params.value,
                        quantity: 1 // Par défaut 1 pour detail/view
                    }];
                }

                await sendGA4Event(ga4EventName, ga4Params, profile);
                console.log(`[WORKER] GA4 MP Frontend Event '${ga4EventName}' dispatched.`);
            } catch (err) {
                console.error(`[WORKER] Failed to send frontend event to GA4:`, err.message);
            }

            console.log(`[WORKER] Frontend Event '${event_name}' processed successfully for profile ${profile.id}.`);
            return { status: 'success', eventId: id, profileId: profile.id };
        }

        // -------------------------------------------------------------
        // BRANCH 2: BACKEND EVENTS (Shopify Webhooks)
        // -------------------------------------------------------------
        else if (job.name === 'order_created') {
            // 1. Validate payload structure
            const { email, phone, total_price, currency, customer, line_items, processed_at } = job.data;
            const id = job.data.id || job.data.checkout_id || job.data.token || job.data.name || 'test_id_' + Date.now();

            if (!id) throw new Error('Missing Order ID in payload');

            // 2. Normalize Data for GA4
            const orderData = {
                orderId: id.toString(),
                amount: parseFloat(total_price),
                currency: currency,
                processedAt: processed_at || new Date().toISOString(),
                // Extraction des line_items pour le Measurement Protocol (Format Merchant Center)
                items: (line_items || []).map(item => {
                    const productId = item.product_id ? item.product_id.toString() : '';
                    const variantId = item.variant_id ? item.variant_id.toString() : '';

                    let mcItemId = item.sku || variantId; // Fallback
                    if (productId && variantId) {
                        mcItemId = `shopify_FR_${productId}_${variantId}`;
                    }

                    return {
                        item_id: mcItemId,
                        item_name: item.title || item.name,
                        price: parseFloat(item.price),
                        quantity: item.quantity
                    };
                })
            };

            const identityParams = {
                email: email || customer?.email,
                phone: phone || customer?.phone,
                first_name: customer?.first_name,
                last_name: customer?.last_name,
                shopify_customer_id: customer?.id
            };

            console.log(`[WORKER] Order ${orderData.orderId} normalized:`, orderData);

            // 3. Identity Resolution (Brick 3)
            try {
                profile = await resolveIdentity(identityParams);
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

                // 4. GA4 & Google Ads Measurement Protocol (Brick 4)
                const consentGranted = hasAdConsent(profile);
                console.log(`[GDPR] Consent status for profile ${profile.id}: ${consentGranted ? 'GRANTED' : 'DENIED'}`);

                try {
                    if (consentGranted) {
                        console.log(`[WORKER] ✅ Consent granted. Sending Full Conversion to GA4...`);
                    } else {
                        console.log(`[WORKER] ⚠️ Consent denied. Sending Consent Mode Ping to GA4...`);
                    }

                    // On envoie toujours à GA4. Si denied, GA4 (via le paramètre consent) 
                    // traitera ça comme un Ping Consent Mode v2 anonymisé.
                    const purchaseParams = {
                        currency: orderData.currency,
                        value: orderData.amount,
                        transaction_id: orderData.orderId,
                        items: orderData.items
                    };
                    const result = await sendGA4Event('purchase', purchaseParams, profile);
                    console.log(`[WORKER] GA4 MP Result:`, result);

                } catch (adsError) {
                    console.error(`[WORKER] Failed to send conversion to GA4: ${adsError.message}`);
                }
            } else {
                console.log(`[WORKER] No profile found for order ${orderData.orderId}. Skipping GA4.`);
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
