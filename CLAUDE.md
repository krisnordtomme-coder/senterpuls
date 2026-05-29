# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

SenterPuls is a content scanner for Norwegian shopping centers ("kjøpesentre"). It scrapes tenant stores' websites and social media, runs each piece of content through Claude to score relevance and rewrite it in the center's voice, and presents publish-ready suggestions to center marketing staff. All UI text and AI-generated content is Norwegian (bokmål).

## Commands

```bash
npm run dev      # local dev server at http://localhost:3000
npm run build    # production build
npm start        # serve production build
```

There is no test suite, linter, or typecheck configured. The project is plain JavaScript (no TypeScript) on Next.js 14 App Router. The `@/*` import alias maps to the repo root (see `jsconfig.json`), but some files use relative imports (`../lib/...`) — both work. Deployment is Vercel (`vercel.json`).

## Data model & multi-tenancy

The hierarchy is **organizations → centers → stores/tenants**, with users joined to orgs via memberships:

- `profiles` — user, 1:1 with Supabase `auth.users`
- `organizations`, `memberships` (role is `"eier"` = owner, or `"admin"`)
- `centers` — a shopping center; holds marketing profile fields `customer_group`, `positioning`, `tone_of_voice`; belongs to an org
- `center_tenants` — stores entered/scraped for a center (name, category, url). This is the *editable source list*.
- `center_competitors`
- `stores` — the operational table the scrape→analyze pipeline reads from; rows have `center_id` and `organization_id`. `center_tenants` rows with URLs are synced into `stores` on demand (see pipeline below).
- `content` — raw scraped items (`source` is `website`/`instagram`/`facebook`, dedup via `content_hash` md5 of text)
- `suggestions` — Claude output per content item: `category`, `relevance_score`, `suggested_text` JSONB (keyed by channel), `status` (`new`/`approved`/`published`)

**`supabase/schema.sql` is stale** — it predates multi-tenancy and only defines `stores`/`content`/`suggestions` without `center_id`/`organization_id` or the org/center/profile tables. Do not treat it as the source of truth for the live schema; the code (especially the API routes and `app/center/[id]/page.js`) reflects the real columns.

Row-Level Security is enabled. The client fetches memberships through the `get_my_memberships` Postgres RPC (not a direct table select), because RLS recursion otherwise blocks it.

## The content pipeline

Three API routes under `app/api/` form the pipeline; the dashboard triggers them:

1. **`scrape/route.js`** — fetches each store's homepage + common campaign paths (`/kampanje`, `/tilbud`, `/salg`, …) with Cheerio, extracts blocks matching a Norwegian promo keyword regex plus JSON-LD `Product`/`Event` and OG meta. When given a `centerId`, it first **syncs `center_tenants` (those with URLs) into the `stores` table** via `syncTenantsToStores` before scraping.
2. **`scrape-social/route.js`** — Instagram via the Apify `instagram-scraper` actor (batched 5 usernames/call), Facebook via the Graph API. IG/FB handles come from the hardcoded `lib/stores.js` map (matched to DB stores by lowercased name). Post images are re-uploaded to the Supabase Storage bucket `content-images` for permanent URLs.
3. **`analyze/route.js`** — for each un-analyzed `content` row, calls Claude (`claude-sonnet-4-6`) with a center-specific Norwegian system prompt, parses the JSON reply, and inserts a `suggestion` if it clears the relevance threshold (`50` for website, `20` for social). Resolves the center name per content item via `stores.center_id → centers.name`.

`scrape` and `scrape-social` automatically fire a `POST /api/analyze` when they insert new content (fire-and-forget). All three use `maxDuration = 300`.

A fourth route, **`scrape-tenants/route.js`**, is a standalone *discovery* helper used by the center settings UI: given a center website URL it extracts a store/tenant list using a cascade of strategies (Next.js `__NEXT_DATA__`, JSON-LD, store-section selectors, list/heading heuristics) and handles legacy Latin-1/windows-1252 Norwegian encodings. It does not touch the DB — it returns candidates for the user to confirm.

### Editing the analysis behavior

`buildSystemPrompt(centerName)` in `analyze/route.js` encodes hard product rules, most importantly **physical-visit-only**: the center never promotes online shopping/e-commerce, so the prompt forbids any web-shop language and scores online-only content below 20. It also rewrites any other center/location mention to the current center's name. Keep these rules intact when changing the prompt.

## Auth & client patterns

- `components/AuthProvider.js` is the global auth context (`useAuth()`), exposing `user`, `profile`, `memberships`, `currentOrg`/`currentCenter` (with setters), and derived `isOwner`/`isAdmin`. Supabase auth (email/password, signup, magic link) is the login mechanism; OAuth/magic-link redirects land on `app/auth/callback/route.js`.
- `lib/supabase.js` overrides the auth `lock` with a no-op (`fn => fn()`) — this is a deliberate workaround for `navigator.locks` hangs in the Supabase JS client, not an accident. It also exports `supabaseDirectRpc`, a raw `fetch` fallback to the REST RPC endpoint (used for `get_my_memberships`) for the same hang reason. Preserve both when touching Supabase setup.
- Pages are client components (`"use client"`) that query Supabase directly; server-side privileged work (service-role key) happens only in the API routes.

## Environment variables

Required (set in `.env.local` / Vercel; never committed):

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — client + most routes
- `SUPABASE_SERVICE_ROLE_KEY` — used by `analyze` to bypass RLS (falls back to anon key)
- `ANTHROPIC_API_KEY` — Claude analysis
- `APIFY_API_TOKEN` — Instagram scraping
- `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET` — Facebook Graph (combined as the app access token)
- `VERCEL_URL` — set by Vercel; used to build the absolute URL for the internal `/api/analyze` trigger (falls back to `http://localhost:3000`)
