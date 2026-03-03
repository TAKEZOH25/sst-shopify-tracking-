const supabase = require('../db/supabase');

/**
 * Resolves, creates, or stitches a user profile based on Shopify customer data and frontend client_id.
 * @param {Object} customerData - Normalized customer data (email, phone, shopify_customer_id, first_name, last_name, client_id)
 * @returns {Promise<Object>} The resolved Supabase profile
 */
async function resolveIdentity(customerData) {
    const { email, phone, shopify_customer_id, first_name, last_name, client_id, consent_status } = customerData;

    console.log(`[IDENTITY] Resolving identity for Email: ${email || 'N/A'}, ClientID: ${client_id || 'N/A'}, ShopifyID: ${shopify_customer_id || 'N/A'}, Consent: ${JSON.stringify(consent_status) || 'N/A'}`);

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
                const updatePayload = { client_id, shopify_customer_id, first_name, last_name };
                if (consent_status) updatePayload.consent_status = consent_status;

                const { data: updatedProfile, error } = await supabase
                    .from('profiles')
                    .update(updatePayload) // Update missing info too
                    .eq('id', profile.id)
                    .select()
                    .single();
                if (!error) profile = updatedProfile;
            } else {
                // Update Shopify ID or Consent Status if missing or changed
                const updatePayload = {};
                if (!profile.shopify_customer_id && shopify_customer_id) updatePayload.shopify_customer_id = shopify_customer_id;
                if (!profile.first_name && first_name) updatePayload.first_name = first_name;
                if (!profile.last_name && last_name) updatePayload.last_name = last_name;

                // If we get a new consent status, update it
                if (consent_status && JSON.stringify(profile.consent_status) !== JSON.stringify(consent_status)) {
                    updatePayload.consent_status = consent_status;
                }

                if (Object.keys(updatePayload).length > 0) {
                    await supabase.from('profiles').update(updatePayload).eq('id', profile.id);
                }
            }
            return profile;
        }

        // 3. Try to find by ClientID (Anonymous profile from previous visits)
        if (client_id) {
            const { data: byClientId } = await supabase.from('profiles').select('*').eq('client_id', client_id).single();
            if (byClientId) {
                console.log(`[IDENTITY] Found anonymous profile by ClientID: ${byClientId.id}`);
                // If we now have an email (e.g. they checked out) or a new consent status, update the anonymous profile
                const updatePayload = {};
                if (email && !byClientId.email) updatePayload.email = email;
                if (phone && !byClientId.phone) updatePayload.phone = phone;
                if (shopify_customer_id && !byClientId.shopify_customer_id) updatePayload.shopify_customer_id = shopify_customer_id;
                if (first_name && !byClientId.first_name) updatePayload.first_name = first_name;
                if (last_name && !byClientId.last_name) updatePayload.last_name = last_name;
                if (consent_status && JSON.stringify(byClientId.consent_status) !== JSON.stringify(consent_status)) updatePayload.consent_status = consent_status;

                if (Object.keys(updatePayload).length > 0) {
                    console.log(`[IDENTITY] Upgrading anonymous profile ${byClientId.id} with new data!`);
                    const { data: updatedProfile, error } = await supabase
                        .from('profiles')
                        .update(updatePayload)
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
            client_id,
            consent_status
        };

        const { data: created, error: createError } = await supabase
            .from('profiles')
            .insert(newProfile)
            .select()
            .single();

        if (createError) {
            // Handle Race Condition: If another concurrent process just inserted this client_id
            if (createError.code === '23505' && client_id) {
                console.warn(`[IDENTITY] Race condition caught: Profile for ${client_id} was just created by another thread.`);
                const { data: retryData } = await supabase.from('profiles').select('*').eq('client_id', client_id).single();
                if (retryData) return retryData;
            }
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
