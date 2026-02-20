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

    // ... (existing code)

    try {
        // 1. Validate payload structure
        const { id, email, phone, total_price, currency, customer } = job.data;

        if (!id) {
            throw new Error('Missing Order ID in payload');
        }

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
        let profile = null;
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
            // Continue processing without profile, or decide to fail job
        }

        // 4. GDPR & Google Ads (Brick 4)
        if (profile) {
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
            console.log(`[GDPR] No profile found, cannot determine consent. Skipping Google Ads.`);
        }

        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 500));

        console.log(`[WORKER] Order ${orderData.orderId} processed successfully.`);
        return { status: 'success', orderId: orderData.orderId };
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
