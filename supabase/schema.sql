-- SenterPuls database schema (idempotent / guarded)
-- Run this in the Supabase SQL Editor. Safe to run against an existing project
-- AND on a fresh one: every statement is guarded (IF NOT EXISTS / OR REPLACE /
-- DROP ... IF EXISTS), so re-running converges the schema rather than erroring.
--
-- NOTE: CREATE TABLE IF NOT EXISTS will NOT alter a table that already exists,
-- so each pre-existing table is followed by ALTER TABLE ... ADD COLUMN IF NOT
-- EXISTS to backfill any columns the running code expects. If your live tables
-- differ in TYPE or constraints (which this script cannot change in place),
-- reconcile with the information_schema / pg_proc queries and adjust by hand.
--
-- Data model (multi-tenant):
--   organizations -> centers -> stores / center_tenants
--   profiles <- memberships -> organizations   (role: eier|admin|redaktor|leser)
--
-- Content pipeline: scrape / scrape-social write `content`, analyze writes
-- `suggestions`. `center_tenants` rows that have a URL are synced into `stores`
-- by app/api/scrape/route.js before scraping.

-- ============================================================================
-- Extensions
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()

-- ============================================================================
-- Tables (+ additive column backfills for pre-existing tables)
-- ============================================================================

-- One row per auth user (auth.users.id). Populated on signup by the
-- handle_new_user() trigger below. Read by AuthProvider and the admin team view.
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS organizations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Join table between users and organizations. role drives isOwner/isAdmin.
CREATE TABLE IF NOT EXISTS memberships (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'redaktor' CHECK (role IN ('eier', 'admin', 'redaktor', 'leser')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

-- Pending team invitations (admin page). "Pending" = accepted_at IS NULL.
CREATE TABLE IF NOT EXISTS invitations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'redaktor' CHECK (role IN ('eier', 'admin', 'redaktor', 'leser')),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (now() + interval '7 days');

-- A shopping center. Marketing-profile columns (customer_group, positioning,
-- tone_of_voice) feed the per-center prompt in app/api/analyze/route.js.
CREATE TABLE IF NOT EXISTS centers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT,
  address TEXT,
  city TEXT,
  logo_url TEXT,
  active BOOLEAN DEFAULT true,
  customer_group TEXT,
  positioning TEXT,
  tone_of_voice TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE centers ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE centers ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE centers ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE centers ADD COLUMN IF NOT EXISTS logo_url TEXT;
ALTER TABLE centers ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;
ALTER TABLE centers ADD COLUMN IF NOT EXISTS customer_group TEXT;
ALTER TABLE centers ADD COLUMN IF NOT EXISTS positioning TEXT;
ALTER TABLE centers ADD COLUMN IF NOT EXISTS tone_of_voice TEXT;
ALTER TABLE centers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE centers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Editable list of tenant stores for a center (entered manually, via Excel
-- paste, or via the /api/scrape-tenants discovery helper). Rows with a URL are
-- synced into `stores` by the scrape pipeline.
CREATE TABLE IF NOT EXISTS center_tenants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  center_id UUID NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT,
  url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE center_tenants ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE center_tenants ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE center_tenants ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE center_tenants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS center_competitors (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  center_id UUID NOT NULL REFERENCES centers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE center_competitors ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE center_competitors ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE center_competitors ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Operational table the scrape -> analyze pipeline reads from. center_id /
-- organization_id are nullable for legacy single-tenant rows; the pipeline sets
-- them when syncing from center_tenants.
CREATE TABLE IF NOT EXISTS stores (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  center_id UUID REFERENCES centers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  category TEXT,
  instagram_handle TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
-- Columns added since the original single-tenant schema:
ALTER TABLE stores ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS center_id UUID REFERENCES centers(id) ON DELETE CASCADE;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS instagram_handle TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- Raw scraped items. content_hash (md5 of original_text) dedupes inserts.
-- source is one of 'website' | 'instagram' | 'facebook'.
CREATE TABLE IF NOT EXISTS content (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  original_text TEXT NOT NULL,
  original_url TEXT,
  image_urls TEXT[],
  posted_at TIMESTAMPTZ,
  scraped_at TIMESTAMPTZ DEFAULT now(),
  content_hash TEXT UNIQUE
);
-- posted_at added since the original schema (written by scrape-social):
ALTER TABLE content ADD COLUMN IF NOT EXISTS posted_at TIMESTAMPTZ;
ALTER TABLE content ADD COLUMN IF NOT EXISTS image_urls TEXT[];

-- Claude output per content item. suggested_text is keyed by channel
-- (instagram/facebook/website); channels mirrors its keys.
CREATE TABLE IF NOT EXISTS suggestions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  content_id UUID REFERENCES content(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  relevance_score INTEGER CHECK (relevance_score BETWEEN 1 AND 100),
  suggested_text JSONB,
  channels TEXT[],
  status TEXT DEFAULT 'new',  -- 'new' | 'approved' | 'published'
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS channels TEXT[];
ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'new';
ALTER TABLE suggestions ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- ============================================================================
-- Indexes
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_org ON memberships(organization_id);
CREATE INDEX IF NOT EXISTS idx_invitations_org ON invitations(organization_id);
CREATE INDEX IF NOT EXISTS idx_centers_org ON centers(organization_id);
CREATE INDEX IF NOT EXISTS idx_center_tenants_center ON center_tenants(center_id);
CREATE INDEX IF NOT EXISTS idx_center_competitors_center ON center_competitors(center_id);
CREATE INDEX IF NOT EXISTS idx_stores_center ON stores(center_id);
CREATE INDEX IF NOT EXISTS idx_stores_org ON stores(organization_id);
CREATE INDEX IF NOT EXISTS idx_content_store ON content(store_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_content ON suggestions(content_id);
CREATE INDEX IF NOT EXISTS idx_suggestions_store ON suggestions(store_id);

-- ============================================================================
-- Functions (CREATE OR REPLACE is idempotent)
-- ============================================================================

-- Create a profile row whenever a new auth user signs up. full_name comes from
-- the signUp options.data passed by AuthProvider.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Returns the current user's memberships with the organization nested as
-- `organizations` (id/name/slug). AuthProvider calls this via REST RPC
-- (supabaseDirectRpc) to avoid both the navigator.locks hang and RLS recursion
-- on memberships.
CREATE OR REPLACE FUNCTION public.get_my_memberships()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  result jsonb;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', m.id,
      'role', m.role,
      'organization_id', m.organization_id,
      'organizations', jsonb_build_object(
        'id', o.id,
        'name', o.name,
        'slug', o.slug
      )
    )
  )
  INTO result
  FROM memberships m
  JOIN organizations o ON o.id = m.organization_id
  WHERE m.user_id = v_user_id;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- Atomically create an organization and make the caller its owner ("eier").
-- Returns the new organization as { id, name, slug } (admin page sets it as
-- currentOrg).
CREATE OR REPLACE FUNCTION public.create_organization_with_owner(org_name TEXT, org_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_org organizations%ROWTYPE;
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO organizations (name, slug)
  VALUES (org_name, org_slug)
  RETURNING * INTO new_org;

  INSERT INTO memberships (user_id, organization_id, role)
  VALUES (v_user_id, new_org.id, 'eier');

  RETURN jsonb_build_object(
    'id', new_org.id,
    'name', new_org.name,
    'slug', new_org.slug
  );
END;
$$;

-- Helper functions used by the RLS policies below.

-- Org ids the current user is a member of.
CREATE OR REPLACE FUNCTION public.get_user_org_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT organization_id FROM memberships WHERE user_id = auth.uid()
$$;

-- True if the current user is an owner ("eier") or admin of the given org.
CREATE OR REPLACE FUNCTION public.is_org_admin(org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM memberships
    WHERE user_id = auth.uid()
      AND organization_id = org_id
      AND role = ANY (ARRAY['eier', 'admin'])
  )
$$;

GRANT EXECUTE ON FUNCTION public.get_my_memberships() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_organization_with_owner(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_org_ids() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_admin(UUID) TO anon, authenticated;

-- ============================================================================
-- Row-Level Security (ENABLE is idempotent; policies are dropped then created)
-- Policies below mirror the live database exactly.
-- ============================================================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE centers ENABLE ROW LEVEL SECURITY;
ALTER TABLE center_tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE center_competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE content ENABLE ROW LEVEL SECURITY;
ALTER TABLE suggestions ENABLE ROW LEVEL SECURITY;

-- Profiles: a user can only see and modify their own row. (There are two
-- equivalent SELECT policies live; both are kept to mirror the database.)
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
CREATE POLICY "Users can read own profile" ON profiles FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Organizations
DROP POLICY IF EXISTS "Anyone authenticated can create organizations" ON organizations;
CREATE POLICY "Anyone authenticated can create organizations" ON organizations FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "Members can view their organizations" ON organizations;
CREATE POLICY "Members can view their organizations" ON organizations FOR SELECT USING (id IN (SELECT get_user_org_ids()));
DROP POLICY IF EXISTS "Owners can update their organizations" ON organizations;
CREATE POLICY "Owners can update their organizations" ON organizations FOR UPDATE USING (is_org_admin(id));

-- Memberships
DROP POLICY IF EXISTS "Members can view memberships in their org" ON memberships;
CREATE POLICY "Members can view memberships in their org" ON memberships FOR SELECT USING (organization_id IN (SELECT get_user_org_ids()));
DROP POLICY IF EXISTS "Owners and admins can manage memberships" ON memberships;
CREATE POLICY "Owners and admins can manage memberships" ON memberships FOR ALL USING (is_org_admin(organization_id));
DROP POLICY IF EXISTS "Users can create own membership" ON memberships;
CREATE POLICY "Users can create own membership" ON memberships FOR INSERT WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "Users can read own memberships" ON memberships;
CREATE POLICY "Users can read own memberships" ON memberships FOR SELECT USING (user_id = auth.uid());

-- Invitations
DROP POLICY IF EXISTS "Admins can create invitations" ON invitations;
CREATE POLICY "Admins can create invitations" ON invitations FOR INSERT WITH CHECK (is_org_admin(organization_id));
DROP POLICY IF EXISTS "Admins can delete invitations" ON invitations;
CREATE POLICY "Admins can delete invitations" ON invitations FOR DELETE USING (is_org_admin(organization_id));
DROP POLICY IF EXISTS "Admins can view invitations" ON invitations;
CREATE POLICY "Admins can view invitations" ON invitations FOR SELECT USING (is_org_admin(organization_id));

-- Centers
DROP POLICY IF EXISTS "Admins can manage centers" ON centers;
CREATE POLICY "Admins can manage centers" ON centers FOR ALL USING (is_org_admin(organization_id));
DROP POLICY IF EXISTS "Members can view centers in their org" ON centers;
CREATE POLICY "Members can view centers in their org" ON centers FOR SELECT USING (organization_id IN (SELECT get_user_org_ids()));

-- Center tenants
DROP POLICY IF EXISTS "Admins can manage tenants" ON center_tenants;
CREATE POLICY "Admins can manage tenants" ON center_tenants FOR ALL USING (
  EXISTS (
    SELECT 1 FROM centers c
    JOIN memberships m ON m.organization_id = c.organization_id
    WHERE c.id = center_tenants.center_id
      AND m.user_id = auth.uid()
      AND m.role = ANY (ARRAY['eier', 'admin'])
  )
);
DROP POLICY IF EXISTS "Users can view tenants of centers in their org" ON center_tenants;
CREATE POLICY "Users can view tenants of centers in their org" ON center_tenants FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM centers c
    JOIN memberships m ON m.organization_id = c.organization_id
    WHERE c.id = center_tenants.center_id
      AND m.user_id = auth.uid()
  )
);

-- Center competitors
DROP POLICY IF EXISTS "Admins can manage competitors" ON center_competitors;
CREATE POLICY "Admins can manage competitors" ON center_competitors FOR ALL USING (
  EXISTS (
    SELECT 1 FROM centers c
    JOIN memberships m ON m.organization_id = c.organization_id
    WHERE c.id = center_competitors.center_id
      AND m.user_id = auth.uid()
      AND m.role = ANY (ARRAY['eier', 'admin'])
  )
);
DROP POLICY IF EXISTS "Users can view competitors of centers in their org" ON center_competitors;
CREATE POLICY "Users can view competitors of centers in their org" ON center_competitors FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM centers c
    JOIN memberships m ON m.organization_id = c.organization_id
    WHERE c.id = center_competitors.center_id
      AND m.user_id = auth.uid()
  )
);

-- Stores: scoped through the owning center's organization.
DROP POLICY IF EXISTS "Admins can manage stores" ON stores;
CREATE POLICY "Admins can manage stores" ON stores FOR ALL USING (
  center_id IN (SELECT centers.id FROM centers WHERE is_org_admin(centers.organization_id))
);
DROP POLICY IF EXISTS "Members can view stores" ON stores;
CREATE POLICY "Members can view stores" ON stores FOR SELECT USING (
  center_id IN (
    SELECT centers.id FROM centers
    WHERE centers.organization_id IN (SELECT get_user_org_ids())
  )
);

-- Content & suggestions: open (read/insert). analyze runs with the service role
-- which bypasses RLS; the dashboard reads with the user session.
DROP POLICY IF EXISTS "Allow read access" ON content;
CREATE POLICY "Allow read access" ON content FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow insert access" ON content;
CREATE POLICY "Allow insert access" ON content FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all access" ON suggestions;
CREATE POLICY "Allow all access" ON suggestions FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow read suggestions" ON suggestions;
CREATE POLICY "Allow read suggestions" ON suggestions FOR SELECT USING (true);

-- ============================================================================
-- Storage: bucket for re-hosted Instagram/Facebook post images
-- (app/api/scrape-social/route.js uploads here and serves the public URL).
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('content-images', 'content-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "content-images public read" ON storage.objects;
CREATE POLICY "content-images public read" ON storage.objects
  FOR SELECT USING (bucket_id = 'content-images');
DROP POLICY IF EXISTS "content-images upload" ON storage.objects;
CREATE POLICY "content-images upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'content-images');
DROP POLICY IF EXISTS "content-images update" ON storage.objects;
CREATE POLICY "content-images update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'content-images') WITH CHECK (bucket_id = 'content-images');
