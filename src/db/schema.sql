-- Create profiles table to store unique user identity
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    shopify_customer_id BIGINT UNIQUE,
    email TEXT,
    -- Can be hashed if strict privacy required, but usually needed for Klaviyo/Audiences
    phone TEXT,
    first_name TEXT,
    last_name TEXT,
    consent_status JSONB DEFAULT '{"ad_storage": "denied", "analytics_storage": "denied"}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- Create index on email and phone for fast lookup during Identity Resolution
CREATE INDEX IF NOT EXISTS idx_profiles_email ON profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON profiles(phone);
CREATE INDEX IF NOT EXISTS idx_profiles_shopify_id ON profiles(shopify_customer_id);
-- Create events table to store raw or processed events
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES profiles(id),
    event_type TEXT NOT NULL,
    -- e.g., 'purchase', 'page_view', 'add_to_cart'
    payload JSONB,
    -- The full event data
    processed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- RLS Policies (Security)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
-- Only service_role should access these tables as this is a backend-only app
-- So we generally don't need public policies, but we should verify access.