import { createClient } from "@supabase/supabase-js"
import * as cheerio from "cheerio"
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

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

// Scrape Instagram profile page for meta/og data
async function scrapeInstagram(username) {
  if (!username) return []
  const url = `https://www.instagram.com/${username}/`
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "text/html", "Accept-Language": "nb-NO,nb;q=0.9" },
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    })
    if (!res.ok) return []
    const html = await res.text()
    const $ = cheerio.load(html)
    const posts = []

    // Extract profile meta data
    const ogTitle = $('meta[property="og:title"]').attr("content") || ""
    const ogDesc = $('meta[property="og:description"]').attr("content") || ""
    const ogImage = $('meta[property="og:image"]').attr("content") || ""

    if (ogDesc && ogDesc.length > 20) {
      posts.push({
        text: ogTitle ? `${ogTitle}: ${ogDesc}` : ogDesc,
        url: url,
        images: ogImage ? [ogImage] : [],
        source: "instagram",
      })
    }

    // Try to extract JSON-LD or shared data
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const json = JSON.parse($(el).html())
        if (json.description && json.description.length > 20) {
          posts.push({
            text: json.description,
            url: url,
            images: json.image ? [json.image] : [],
            source: "instagram",
          })
        }
      } catch {}
    })

    // Extract from meta description which often contains follower count and bio
    const metaDesc = $('meta[name="description"]').attr("content") || ""
    if (metaDesc && metaDesc.length > 30 && !posts.some(p => p.text === metaDesc)) {
      posts.push({
        text: metaDesc,
        url: url,
        images: ogImage ? [ogImage] : [],
        source: "instagram",
      })
    }

    return posts.slice(0, 3)
  } catch {
    return []
  }
}

// Scrape Facebook page for public content
async function scrapeFacebook(pageName) {
  if (!pageName) return []
  const url = `https://www.facebook.com/${pageName}/`
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "nb-NO,nb;q=0.9",
      },
      signal: AbortSignal.timeout(10000),
      redirect: "follow",
    })
    if (!res.ok) return []
    const html = await res.text()
    const $ = cheerio.load(html)
    const posts = []

    // Extract OG meta data from Facebook page
    const ogTitle = $('meta[property="og:title"]').attr("content") || ""
    const ogDesc = $('meta[property="og:description"]').attr("content") || ""
    const ogImage = $('meta[property="og:image"]').attr("content") || ""

    if (ogDesc && ogDesc.length > 20) {
      posts.push({
        text: ogTitle ? `${ogTitle} - ${ogDesc}` : ogDesc,
        url: url,
        images: ogImage ? [ogImage] : [],
        source: "facebook",
      })
    }

    // Extract any visible text content about campaigns/events
    const rx = /(salg|tilbud|rabatt|kampanje|spar |% |gratis|nyhet|lansering|event|arrangement|sesong|apen|\\u00e5pn)/i
    $("div[data-ad-preview], div[role=\"article\"], div.userContent, div[data-testid]").each((_, el) => {
      const text = $(el).text().trim().replace(/\\s+/g, " ")
      if (text.length > 30 && text.length < 500 && rx.test(text)) {
        posts.push({
          text: text.substring(0, 400),
          url: url,
          images: ogImage ? [ogImage] : [],
          source: "facebook",
        })
      }
    })

    return posts.slice(0, 3)
  } catch {
    return []
  }
}

export async function POST() {
  try {
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

          const [igPosts, fbPosts] = await Promise.all([
            scrapeInstagram(config.instagram),
            scrapeFacebook(config.facebook),
          ])

          return { store, posts: [...igPosts, ...fbPosts] }
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
