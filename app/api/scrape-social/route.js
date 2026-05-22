import { createClient } from "@supabase/supabase-js"
import { createHash } from "crypto"
import { STORES } from "../../../lib/stores"

export const maxDuration = 60

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

const INSTAGRAM_APP_ID = "936619743392459"

function hashContent(text) {
    return createHash("md5").update(text).digest("hex")
}

function decodeHtmlEntities(text) {
    if (!text) return text
    return text
      .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
}

function getAccessToken() {
    const appId = process.env.FACEBOOK_APP_ID
    const appSecret = process.env.FACEBOOK_APP_SECRET
    if (!appId || !appSecret) return null
    return appId + "|" + appSecret
}

// Fetch recent posts from Instagram using internal web API
async function fetchInstagramPosts(username) {
    if (!username) return []
        try {
              const url = "https://i.instagram.com/api/v1/users/web_profile_info/?username=" + username
              const res = await fetch(url, {
                      headers: {
                                "x-ig-app-id": INSTAGRAM_APP_ID,
                                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                                "Accept": "*/*",
                                "Accept-Language": "en-US,en;q=0.9",
                                "Accept-Encoding": "gzip, deflate, br",
                      },
                      signal: AbortSignal.timeout(12000),
              })
              if (!res.ok) {
                      console.log("Instagram API " + res.status + " for @" + username)
                      return []
              }
              const data = await res.json()
              const user = data?.data?.user
              if (!user) return []

                    const posts = []
                          const edges = user.edge_owner_to_timeline_media?.edges || []
                                for (const edge of edges.slice(0, 5)) {
                                        const node = edge.node
                                        const caption = node.edge_media_to_caption?.edges?.[0]?.node?.text || ""
                                        if (!caption || caption.length < 10) continue
                                        const timestamp = node.taken_at_timestamp
                                        const date = timestamp ? new Date(timestamp * 1000).toISOString() : null
                                        posts.push({
                                                  text: decodeHtmlEntities(caption.substring(0, 500)),
                                                  url: "https://www.instagram.com/p/" + node.shortcode + "/",
                                                  images: node.display_url ? [node.display_url] : [],
                                                  source: "instagram",
                                                  date: date,
                                        })
                                }

      // If no posts with captions, fall back to bio
      if (posts.length === 0 && user.biography) {
              posts.push({
                        text: decodeHtmlEntities(user.full_name + ": " + user.biography),
                        url: "https://www.instagram.com/" + username + "/",
                        images: user.profile_pic_url_hd ? [user.profile_pic_url_hd] : [],
                        source: "instagram",
              })
      }

      return posts
        } catch (e) {
              console.log("Instagram fetch error for @" + username + ": " + e.message)
              return []
        }
}

// Fallback: scrape Instagram meta tags from public profile page
async function fetchInstagramFallback(username) {
    if (!username) return []
        try {
              const profileUrl = "https://www.instagram.com/" + username + "/"
              const res = await fetch(profileUrl, {
                      headers: {
                                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                                "Accept": "text/html",
                      },
                      signal: AbortSignal.timeout(8000),
                      redirect: "follow",
              })
              if (!res.ok) return []
                    const html = await res.text()
              const descMatch = html.match(/<meta\s+(?:name|property)="(?:description|og:description)"\s+content="([^"]*)"/)
              const imgMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]*)"/)
              if (descMatch && descMatch[1] && descMatch[1].length > 20) {
                      return [{
                                text: decodeHtmlEntities(descMatch[1]),
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

// Fetch recent posts from a Facebook Page via Graph API
async function fetchFacebookPosts(pageName, accessToken) {
    if (!pageName || !accessToken) return []
        try {
              const searchUrl = "https://graph.facebook.com/v19.0/" + pageName + "?fields=id,name,about,description&access_token=" + accessToken
              const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) })
              if (!searchRes.ok) return []
                    const pageData = await searchRes.json()
              if (!pageData.id) return []

                    // Try to fetch posts
                    const postsUrl = "https://graph.facebook.com/v19.0/" + pageData.id + "/posts?fields=message,created_time,full_picture,permalink_url&limit=5&access_token=" + accessToken
              const postsRes = await fetch(postsUrl, { signal: AbortSignal.timeout(10000) })
              if (postsRes.ok) {
                      const postsData = await postsRes.json()
                      const posts = []
                              for (const post of (postsData.data || [])) {
                                        if (!post.message || post.message.length < 15) continue
                                        posts.push({
                                                    text: decodeHtmlEntities(post.message.substring(0, 500)),
                                                    url: post.permalink_url || "https://www.facebook.com/" + pageName + "/",
                                                    images: post.full_picture ? [post.full_picture] : [],
                                                    source: "facebook",
                                        })
                              }
                      if (posts.length > 0) return posts.slice(0, 5)
              }

      // Fallback to page description
      if (pageData.description || pageData.about) {
              return [{
                        text: decodeHtmlEntities(pageData.name + ": " + (pageData.description || pageData.about)),
                        url: "https://www.facebook.com/" + pageName + "/",
                        images: [],
                        source: "facebook",
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

      const { data: dbStores } = await supabase.from("stores").select("*").eq("active", true)
          if (!dbStores?.length) {
                  return Response.json({ message: "Ingen butikker funnet", stores: 0, newContent: 0 }, { status: 404 })
          }

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

                                                // Instagram: try internal API first, fall back to meta scraping
                                                let igPosts = await fetchInstagramPosts(config.instagram)
                                    if (igPosts.length === 0 && config.instagram) {
                                                  igPosts = await fetchInstagramFallback(config.instagram)
                                    }

                                            // Facebook: use Graph API
                                            const fbPosts = accessToken ? await fetchFacebookPosts(config.facebook, accessToken) : []

                                                        return { store, posts: [...igPosts, ...fbPosts] }
                        })
                      )

            for (const { store, posts } of batchResults) {
                      for (const post of posts) {
                                  const hash = hashContent(post.text)
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
              const base = process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : "http://localhost:3000"
              fetch(base + "/api/analyze", { method: "POST" }).catch(() => {})
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
