require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const validateShopifyHMAC = require('./middleware/hmac');

const app = express();
const PORT = process.env.PORT || 3000;


// Basic health check route
app.get('/', (req, res) => {
    res.send('Server-Side Tracking Infrastructure is Running');
});

// --- SSOT: Frontend Events Track Route ---
// CORS is enabled here to accept requests from the client's browser (Shopify domain)
// No HMAC validation is applied because events come from the client browser.
app.options('/api/track', cors()); // Enable pre-flight request for CORS
// Pour sendBeacon (qui envoie du text/plain) ou standard fetch (application/json)
app.post('/api/track', cors(), express.json(), express.text(), async (req, res) => {
    let eventData = req.body;

    // Si la requête vient de sendBeacon, le body est un string
    if (typeof eventData === 'string') {
        try {
            eventData = JSON.parse(eventData);
        } catch (e) {
            console.error('[FRONTEND] Failed to parse beacon text payload', e);
            eventData = {};
        }
    }

    const eventName = eventData.event_name || 'unknown_event';

    // Generate a fallback client ID if missing
    if (!eventData.clientId) {
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown_ip';
        const userAgent = req.get('User-Agent') || 'unknown_ua';
        eventData.clientId = crypto.createHash('sha256').update(`${ip}-${userAgent}`).digest('hex');
        console.log(`[FRONTEND] Generated fallback clientId: ${eventData.clientId}`);
    }

    console.log(`👁️ [FRONTEND] Événement reçu: ${eventName}`);

    try {
        const { webhookQueue } = require('./queue/queue');
        // Insert into BullMQ queue with a distinct job name, and memory management
        const job = await webhookQueue.add('process_frontend_event', eventData, {
            removeOnComplete: true, // Optimiser la RAM
            removeOnFail: { count: 100 } // Garder un historique limité pour le débugging
        });
        console.log(`[QUEUE] Frontend event '${eventName}' enqueued with ID: ${job.id}`);

        // Respond instantly with HTTP 200 OK to free the browser
        res.status(200).json({ status: 'success' });
    } catch (error) {
        console.error('[QUEUE] Error enqueueing frontend event:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// Webhook route for Shopify Orders
app.post('/webhooks/shopify/orders', express.raw({ type: 'application/json' }), validateShopifyHMAC, async (req, res) => {
    console.log('[WEBHOOK] Received /webhooks/shopify/orders ping');

    try {
        const { webhookQueue } = require('./queue/queue');
        // Parse the validated raw body into a JSON object before passing it to the queue
        const orderData = JSON.parse(req.body.toString('utf8'));

        // Use Shopify Order ID as jobId for Idempotence (prevent duplicates if Shopify retries)
        const shopifyId = orderData.id ? orderData.id.toString() : `fallback_${Date.now()}`;

        const job = await webhookQueue.add('order_created', orderData, {
            jobId: shopifyId, // Idempotence : empêche l'ajout de webhooks en double
            removeOnComplete: true,
            removeOnFail: { count: 100 }
        });
        console.log(`[QUEUE] Job enqueued with ID: ${job.id}`);

        // Return 200 OK instantly as required
        res.status(200).send('Webhook received and queued');
    } catch (error) {
        console.error('[QUEUE] Error enqueueing job:', error);
        // Even if queue fails, we should handle it gracefully. 
        // For now, let's return 500 so Shopify retries if our Redis is down, 
        // OR return 200 and log locally if we want to avoid backpressure.
        // PRD says "Message Queue with HTTP 200", implying we should return 200 if successful.
        // If Redis is down, returning 500 is safer to trigger Shopify retry.
        res.status(500).send('Internal Server Error');
    }
});

app.listen(PORT, () => {
    console.log(`[SERVER] Server is running on port ${PORT}`);
});
