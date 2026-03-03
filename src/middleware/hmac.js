const crypto = require('crypto');

const validateShopifyHMAC = (req, res, next) => {
  const hmacHeader = req.get('X-Shopify-Hmac-Sha256');
  // req.body is now a Buffer because of express.raw()
  const body = req.body;
  const secret = process.env.SHOPIFY_API_SECRET ? process.env.SHOPIFY_API_SECRET.trim() : null;

  if (!secret) {
    console.error('[SECURITY] SHOPIFY_API_SECRET is not set in environment variables.');
    return res.status(500).send('Server Configuration Error');
  }

  if (!hmacHeader || !body) {
    console.warn('[SECURITY] Missing HMAC header or request body.');
    return res.status(401).send('Unauthorized');
  }

  const generatedHash = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('base64');

  console.log(`[DEBUG] Secret length: ${secret.length}`);
  console.log(`[DEBUG] Raw body type: ${typeof body}, length: ${body.length}`);
  console.log(`[DEBUG] Expected Signature (Header): ${hmacHeader}`);
  console.log(`[DEBUG] Computed Signature: ${generatedHash}`);

  // Timing-safe comparison to prevent timing attacks
  try {
    const hmacBuffer = Buffer.from(hmacHeader, 'base64');
    const hashBuffer = Buffer.from(generatedHash, 'base64');

    // Ensure both buffers are the same length before timingSafeEqual
    // This is a subtle check: timingSafeEqual throws if lengths differ
    if (hmacBuffer.length !== hashBuffer.length || !crypto.timingSafeEqual(hmacBuffer, hashBuffer)) {
      console.warn(`[SECURITY] HMAC Mismatch. Received: ${hmacHeader}, Computed: ${generatedHash}`);
      return res.status(401).send('Unauthorized');
    }
  } catch (error) {
    console.warn(`[SECURITY] HMAC Validation Error: ${error.message}`);
    return res.status(401).send('Unauthorized');
  }

  console.log('[SECURITY] HMAC Verified Successfully.');
  next();
};

module.exports = validateShopifyHMAC;
