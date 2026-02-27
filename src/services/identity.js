const supabase = require('../db/supabase');

/**
 * Resolves, creates, or stitches a user profile based on Shopify customer data and frontend client_id.
 * @param {Object} customerData - Normalized customer data (email, phone, shopify_customer_id, first_name, last_name, client_id)
 * @returns {Promise<Object>} The resolved Supabase profile
 */
async function resolveIdentity(customerData) {
    const { email, phone, shopify_customer_id, first_name, last_name, client_id } = customerData;

    console.log(`[IDENTITY] Resolving identity for Email: ${email || 'N/A'}, ClientID: ${client_id || 'N/A'}, ShopifyID: ${shopify_customer_id || 'N/A'}`);

    try {
        let profile = null;

        // 1. Try to find by Email, Phone, or Shopify ID first (Strong Identifiers)
        if (email) {
            const { data } = await supabase.from('profiles').select('*').eq('email', email).single();
            if (data) profile = data;
        }
        if (!profile && shopify_customer_id) {
            const { data } = await supabase.from('profiles').select('*').eq('shopify_customer_id', shopify_customer_id).single();
            if (data) profile = data;
        }
        if (!profile && phone) {
            const { data } = await supabase.from('profiles').select('*').eq('phone', phone).single();
            if (data) profile = data;
        }

        // 2. STITCHING LOGIC
        if (profile) {
            console.log(`[IDENTITY] Found existing profile by strong identifier: ${profile.id}`);

            // If we have a newly provided client_id from the frontend, but the existing profile doesn't have it,
            // we stitch them together!
            if (client_id && profile.client_id !== client_id) {
                console.log(`[IDENTITY] Stitching ClientID ${client_id} to existing profile ${profile.id}`);
                const { data: updatedProfile, error } = await supabase
                    .from('profiles')
                    .update({ client_id, shopify_customer_id, first_name, last_name }) // Update missing info too
                    .eq('id', profile.id)
                    .select()
                    .single();
                if (!error) profile = updatedProfile;
            } else if (!profile.shopify_customer_id && shopify_customer_id) {
                // Or just update Shopify ID if missing
                await supabase.from('profiles').update({ shopify_customer_id, first_name, last_name }).eq('id', profile.id);
            }
            return profile;
        }

        // 3. Try to find by ClientID (Anonymous profile from previous visits)
        if (client_id) {
            const { data: byClientId } = await supabase.from('profiles').select('*').eq('client_id', client_id).single();
            if (byClientId) {
                console.log(`[IDENTITY] Found anonymous profile by ClientID: ${byClientId.id}`);
                // If we now have an email (e.g. they checked out), upgrade the anonymous profile to a full profile!
                if (email || phone || shopify_customer_id) {
                    console.log(`[IDENTITY] Upgrading anonymous profile ${byClientId.id} with strong identifiers!`);
                    const { data: updatedProfile, error } = await supabase
                        .from('profiles')
                        .update({ email, phone, shopify_customer_id, first_name, last_name })
                        .eq('id', byClientId.id)
                        .select()
                        .single();
                    if (!error) return updatedProfile;
                }
                return byClientId;
            }
        }

        // 4. Create new Profile if no match found at all
        console.log('[IDENTITY] No match found. Creating new profile...');
        const newProfile = {
            shopify_customer_id,
            email,
            phone,
            first_name,
            last_name,
            client_id
        };

        const { data: created, error: createError } = await supabase
            .from('profiles')
            .insert(newProfile)
            .select()
            .single();

        if (createError) {
            throw createError;
        }

        console.log(`[IDENTITY] Created new profile: ${created.id}`);
        return created;

    } catch (error) {
        console.error('[IDENTITY] Error resolving identity:', error.message);
        throw error;
    }
}

module.exports = { resolveIdentity };
