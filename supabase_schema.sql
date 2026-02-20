-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- Create the profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shopify_customer_id BIGINT UNIQUE,
    email TEXT UNIQUE,
    phone TEXT UNIQUE,
    first_name TEXT,
    last_name TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
-- Create indexes for faster lookups (since we search by these fields in identity.js)
CREATE INDEX IF NOT EXISTS idx_profiles_shopify_id ON public.profiles(shopify_customer_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles(phone);
-- Optional: Add Row Level Security (RLS) policies
-- Since we are using the Service Role Key for backend processing, RLS isn't strictly necessary,
-- but it's good practice to enable it and block public access.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
-- Block all public access (authenticated or anonymous) as the backend uses Service Role
CREATE POLICY "Block public access" ON public.profiles FOR ALL USING (false);