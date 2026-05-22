import { createClient } from "@supabase/supabase-js"
import { createHash } from "crypto"
import { STORES } from "../../../lib/stores"

export const maxDuration = 60

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

function hashContent(text) {
  return createHash("md5").update(text).digest("hex")
}

function getAccessToken() {
  const appId = process.env.FACEBOOK_APP_ID
  const appSecret = process.env.FACEBOOK_APP_SECRET
  if (!appId || !appSecret) return null
  return appId + "|" + appSecret
}

// Fetch recent posts from a Facebook Page via Graph API
async function fetchFacebookPosts(pageName, accessToken) {
  if (!pageName || !accessToken) return []
  try {
    // First resolve the page name to a page ID
    const searchUrl = `https://graph.facebook.com/v19.0/${pageName}?fields=id,name,about,description&access_token=${accessToken}`
    const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) })
    if (!searchRes.ok) return []
    const pageData = await searchRes.json()
    if (!pageData.id) return []

    // Then fetch recent posts from that page
    const postsUrl = `https://graph.facebook.com/v19.0/${pageData.id}/posts?fields=message,created_time,full_picture,permalink_url&limit=5&access_token=${accessToken}`
    const postsRes = await fetch(postsUrl, { signal: AbortSignal.timeout(10000) })
    if (!postsRes.ok) {
      // If posts endpoint fails, at least return the page description
      if (pageData.description || pageData.about) {
        return [{
          text: pageData.name + ": " + (pageData.description || pageData.about),
          url: `https://www.facebook.com/${pageName}/`,
          images: [],
          source: "facebook",
        }]
      }
      return []
    }
    const postsData = await postsRes.json()

    const posts = []
    for (const post of (postsData.data || [])) {
      if (!post.message || post.message.length < 15) continue
      posts.push({
        text: post.message.substring(0, 500),
        url: post.permalink_url || `https://www.facebook.com/${pageName}/`,
        images: post.full_picture ? [post.full_picture] : [],
        source: "facebook",
      })
    }
    return posts.slice(0, 5)
  } catch {
    return []
  }
}

// Fetch Instagram profile info and recent media via Facebook Graph API
// Note: This requires the Instagram account to be a Business/Creator account
// connected to a Facebook Page. For public profiles, we fall back to oEmbed.
async function fetchInstagramPosts(username, accessToken) {
  if (!username || !accessToken) return []
  try {
    // Try oEmbed endpoint for profile metadata
    const oembedUrl = `https://graph.facebook.com/v19.0/instagram_oembed?url=https://www.instagram.com/${username}/&access_token=${accessToken}`
    const oembedRes = await fetch(oembedUrl, { signal: AbortSignal.timeout(10000) })

    if (oembedRes.ok) {
      const data = await oembedRes.json()
      if (data.title || data.author_name) {
        return [{
          text: (data.author_name || username) + ": " + (data.title || "Instagram-profil"),
          url: `https://www.instagram.com/${username}/`,
          images: data.thumbnail_url ? [data.thumbnail_url] : [],
          source: "instagram",
        }]
      }
    }

    // Fallback: basic profile fetch via scraping meta tags
    const profileUrl = `https://www.instagram.com/${username}/`
    const profileRes = await fetch(profileUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html",
      },
      signal: AbortSignal.timeout(8000),
      redirect: "follow",
    })
    if (!profileRes.ok) return []
    const html = await profileRes.text()

    // Extract meta description which usually contains bio + follower info
    const descMatch = html.match(/<meta\s+(?:name|property)="(?:description|og:description)"\s+content="([^"]*)"/)
    const imgMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]*)"/)

    if (descMatch && descMatch[1] && descMatch[1].length > 20) {
      return [{
        text: descMatch[1],
        url: profileUrl,
        images: imgMatch ? [imgMatch[1]] : [],
        source: "instagram",
      }]
    }

    return []
  } catch {
    return []
  }
}

export async function POST() {
  try {
    const accessToken = getAccessToken()
    if (!accessToken) {
      return Response.json({
        error: "Facebook API-nøkler mangler. Legg til FACEBOOK_APP_ID og FACEBOOK_APP_SECRET i Vercel."
      }, { status: 500 })
    }

    // Get stores from DB
    const { data: dbStores } = await supabase.from("stores").select("*").eq("active", true)
    if (!dbStores?.length) {
      return Response.json({ message: "Ingen butikker funnet", stores: 0, newContent: 0 }, { status: 404 })
    }

    // Build lookup from STORES config (which has SoMe handles)
    const storeConfig = {}
    for (const s of STORES) {
      storeConfig[s.name.toLowerCase()] = s
    }

    let totalInserted = 0
    const errors = []
    const results = { instagram: 0, facebook: 0 }

    // Process stores in batches of 3
    for (let i = 0; i < dbStores.length; i += 3) {
      const batch = dbStores.slice(i, i + 3)

      const batchResults = await Promise.all(
        batch.map(async (store) => {
          const config = storeConfig[store.name.toLowerCase()]
          if (!config) return { store, posts: [] }

          const [fbPosts, igPosts] = await Promise.all([
            fetchFacebookPosts(config.facebook, accessToken),
            fetchInstagramPosts(config.instagram, accessToken),
          ])

          return { store, posts: [...fbPosts, ...igPosts] }
        })
      )

      for (const { store, posts } of batchResults) {
        for (const post of posts) {
          const hash = hashContent(post.text)

          // Check for duplicates
          const { data: existing } = await supabase
            .from("content")
            .select("id")
            .eq("content_hash", hash)
            .limit(1)

          if (existing?.length > 0) continue

          const { error } = await supabase.from("content").insert({
            store_id: store.id,
            source: post.source,
            original_text: post.text,
            original_url: post.url,
            image_urls: post.images?.filter(img => img?.startsWith("http")) || [],
            content_hash: hash,
          })

          if (!error) {
            totalInserted++
            results[post.source]++
          } else {
            errors.push(store.name + ": " + error.message)
          }
        }
      }
    }

    // Trigger AI analysis if new content found
    if (totalInserted > 0) {
      const base = process.env.VERCEL_URL
        ? "https://" + process.env.VERCEL_URL
        : "http://localhost:3000"
      await fetch(base + "/api/analyze", { method: "POST" }).catch(() => {})
    }

    return Response.json({
      message: "SoMe-scraping ferdig",
      stores: dbStores.length,
      newContent: totalInserted,
      breakdown: results,
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
    })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
