-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- ----------------------------------------------------------------------------------
-- 1. PROFILES TABLE (Updated for Identity Stitching)
-- ----------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    shopify_customer_id BIGINT UNIQUE,
    email TEXT UNIQUE,
    phone TEXT UNIQUE,
    first_name TEXT,
    last_name TEXT,
    client_id TEXT UNIQUE,
    -- NOUVEAU: Identifiant unique du visiteur Frontend (Pixel)
    consent_status JSONB,
    -- NOUVEAU: Pour la gestion RGPD ultérieure
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
-- Si la table existait déjà sans client_id, exécutez ces deux lignes séparément (décommentez-les):
-- ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS client_id TEXT UNIQUE;
-- ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS consent_status JSONB;
-- Create indexes for faster lookups (since we search by these fields in identity.js)
CREATE INDEX IF NOT EXISTS idx_profiles_shopify_id ON public.profiles(shopify_customer_id);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_phone ON public.profiles(phone);
CREATE INDEX IF NOT EXISTS idx_profiles_client_id ON public.profiles(client_id);
-- ----------------------------------------------------------------------------------
-- 2. EVENTS TABLE (New Table for historical tracking)
-- ----------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    -- Lien fort avec le profil
    event_name TEXT NOT NULL,
    -- Ex: 'page_viewed', 'order_created'
    event_source TEXT NOT NULL,
    -- 'frontend' (Pixel) ou 'backend' (Webhook)
    payload JSONB,
    -- Les détails (URL, produits, prix, etc.)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);
-- Index pour requêter rapidement chronologiquement l'historique d'un utilisateur
CREATE INDEX IF NOT EXISTS idx_events_profile_id ON public.events(profile_id);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON public.events(created_at DESC);
-- ----------------------------------------------------------------------------------
-- 3. ROW LEVEL SECURITY (RLS)
-- ----------------------------------------------------------------------------------
-- Since we are using the Service Role Key for backend processing, RLS isn't strictly necessary,
-- but it's good practice to enable it and block public access.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Block public access" ON public.profiles FOR ALL USING (false);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Block public access" ON public.events FOR ALL USING (false);