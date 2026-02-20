require('dotenv').config();
const express = require('express');
const validateShopifyHMAC = require('./middleware/hmac');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON bodies
// We need the raw body to verify the HMAC signature from Shopify
app.use(express.json({
    verify: (req, res, buf) => {
        req.rawBody = buf;
    }
}));

// Basic health check route
app.get('/', (req, res) => {
    res.send('Server-Side Tracking Infrastructure is Running');
});

// Webhook route for Shopify Orders
app.post('/webhooks/shopify/orders', validateShopifyHMAC, async (req, res) => {
    console.log('[WEBHOOK] Received /webhooks/shopify/orders ping');

    try {
        const { webhookQueue } = require('./queue/queue');
        const job = await webhookQueue.add('order_created', req.body);
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
