const supabase = require('../db/supabase');

/**
 * Resolves or creates a user profile based on Shopify customer data.
 * @param {Object} customerData - Normalized customer data (email, phone, shopify_customer_id, first_name, last_name)
 * @returns {Promise<Object>} The resolved Supabase profile
 */
async function resolveIdentity(customerData) {
    const { email, phone, shopify_customer_id, first_name, last_name } = customerData;

    console.log(`[IDENTITY] Resolving identity for Shopify ID: ${shopify_customer_id}`);

    try {
        // 1. Try to find by Shopify Customer ID
        if (shopify_customer_id) {
            const { data: byId, error: errorId } = await supabase
                .from('profiles')
                .select('*')
                .eq('shopify_customer_id', shopify_customer_id)
                .single();

            if (byId) {
                console.log(`[IDENTITY] Found profile by Shopify ID: ${byId.id}`);
                return byId;
            }
        }

        // 2. Try to find by Email
        if (email) {
            const { data: byEmail, error: errorEmail } = await supabase
                .from('profiles')
                .select('*')
                .eq('email', email)
                .single();

            if (byEmail) {
                console.log(`[IDENTITY] Found profile by Email: ${byEmail.id}`);
                // Update Shopify ID if missing
                if (shopify_customer_id && !byEmail.shopify_customer_id) {
                    await supabase.from('profiles').update({ shopify_customer_id }).eq('id', byEmail.id);
                }
                return byEmail;
            }
        }

        // 3. Try to find by Phone
        if (phone) {
            const { data: byPhone, error: errorPhone } = await supabase
                .from('profiles')
                .select('*')
                .eq('phone', phone)
                .single();

            if (byPhone) {
                console.log(`[IDENTITY] Found profile by Phone: ${byPhone.id}`);
                // Update Shopify ID if missing
                if (shopify_customer_id && !byPhone.shopify_customer_id) {
                    await supabase.from('profiles').update({ shopify_customer_id }).eq('id', byPhone.id);
                }
                return byPhone;
            }
        }

        // 4. Create new Profile if no match found
        console.log('[IDENTITY] No match found. Creating new profile...');
        const newProfile = {
            shopify_customer_id,
            email,
            phone,
            first_name,
            last_name
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
        // Fallback: Return null or throw, depending on how strict we want the worker to be.
        // For now, allow processing to continue without profile, or retry.
        throw error;
    }
}

module.exports = { resolveIdentity };
