const { Queue } = require('bullmq');
const IORedis = require('ioredis');

// Parse REDIS_URL from .env or use default
const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null, // Required by BullMQ
});

connection.on('error', (err) => {
    console.error('[REDIS] Connection Error:', err);
});

connection.on('connect', () => {
    console.log('[REDIS] Connected successfully to Redis');
});

// Create the 'shopify-webhooks' queue
const webhookQueue = new Queue('shopify-webhooks', { connection });

module.exports = {
    webhookQueue,
    connection
};
