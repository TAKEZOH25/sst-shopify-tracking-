const { PostHog } = require('posthog-node');

let posthogClient = null;

function getPostHogClient() {
    if (posthogClient) return posthogClient;

    const apiKey = process.env.POSTHOG_API_KEY;
    const host = process.env.POSTHOG_HOST || 'https://eu.i.posthog.com';

    if (!apiKey) {
        console.warn('[POSTHOG] Warning: POSTHOG_API_KEY environment variable is missing. PostHog tracking is disabled.');
        return null; // Return null if not configured
    }

    try {
        posthogClient = new PostHog(apiKey, {
            host: host,
            // Flush events immediately for our worker setup, 
            // or let it buffer if you prefer performance over immediate visibility
            flushAt: 1,
            flushInterval: 0
        });
        console.log('[POSTHOG] Client initialized successfully.');
    } catch (error) {
        console.error('[POSTHOG] Error initializing client:', error);
    }

    return posthogClient;
}

/**
 * Tracks an event in PostHog.
 * 
 * @param {string} distinctId - The unique user ID (e.g., Supabase profile.id)
 * @param {string} eventName - The name of the event (e.g., 'page_viewed', 'order_created')
 * @param {Object} properties - Additional properties to attach to the event
 */
function trackEvent(distinctId, eventName, properties = {}) {
    if (!distinctId) {
        console.warn(`[POSTHOG] Cannot track '${eventName}': Missing distinctId.`);
        return;
    }

    const client = getPostHogClient();

    if (client) {
        try {
            client.capture({
                distinctId: distinctId,
                event: eventName,
                properties: {
                    ...properties,
                    $source: 'sst-worker', // Identifies that this came from our tracking server
                }
            });
            console.log(`[POSTHOG] Event '${eventName}' tracked for user ${distinctId}`);
        } catch (error) {
            console.error(`[POSTHOG] Failed to capture event '${eventName}':`, error);
        }
    }
}

/**
 * Gracefully shuts down the PostHog client, ensuring all pending events are flushed.
 */
async function flushPostHog() {
    if (posthogClient) {
        try {
            await posthogClient.shutdown();
            console.log('[POSTHOG] All events flushed successfully.');
        } catch (error) {
            console.error('[POSTHOG] Error flushing events during shutdown:', error);
        }
    }
}

module.exports = {
    trackEvent,
    flushPostHog
};
