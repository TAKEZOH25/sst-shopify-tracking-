const supabase = require('../db/supabase');

/**
 * Inserts a new event into the `events` table linked to a specific profile
 * @param {string} profileId - The UUID of the user profile in Supabase
 * @param {string} eventName - The name of the event (e.g., 'page_viewed', 'order_created')
 * @param {string} source - Where the event came from ('frontend' or 'backend')
 * @param {Object} payload - The full JSON payload containing event details
 * @returns {Promise<Object>} The inserted event record
 */
async function insertEvent(profileId, eventName, source, payload) {
    console.log(`[EVENTS] Inserting '${eventName}' from ${source} for profile ${profileId}`);

    try {
        const { data: event, error } = await supabase
            .from('events')
            .insert({
                profile_id: profileId,
                event_name: eventName,
                event_source: source,
                payload: payload
            })
            .select()
            .single();

        if (error) {
            throw error;
        }

        console.log(`[EVENTS] Successfully inserted event: ${event.id}`);
        return event;
    } catch (error) {
        console.error(`[EVENTS] Failed to insert event:`, error.message);
        throw error; // Re-throw to allow caller to handle (or fail job)
    }
}

module.exports = { insertEvent };
