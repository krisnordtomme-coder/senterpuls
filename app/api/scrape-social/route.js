import { createClient } from "@supabase/supabase-js"
import { createHash } from "crypto"
import { STORES } from "../../../lib/stores"

export const maxDuration = 300

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

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

// Fetch Instagram posts for a batch of usernames via Apify
async function fetchInstagramBatchViaApify(usernames) {
    const token = process.env.APIFY_API_TOKEN
    if (!token || usernames.length === 0) return {}

    const directUrls = usernames.map(u => "https://www.instagram.com/" + u + "/")

    try {
        const res = await fetch(
            "https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=" + token,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    directUrls: directUrls,
                    resultsType: "posts",
                    resultsLimit: 5,
                    searchType: "user",
                }),
                signal: AbortSignal.timeout(45000),
            }
        )

        if (!res.ok) {
            const errText = await res.text()
            console.log("Apify error " + res.status + ": " + errText.substring(0, 200))
            return {}
        }

        const items = await res.json()
        const byUser = {}

        for (const item of items) {
            // Skip profile/metadata items - only process actual posts
            if (!item.shortCode) continue

            const ownerUsername = item.ownerUsername || ""
            if (!ownerUsername) continue
            if (!byUser[ownerUsername]) byUser[ownerUsername] = []
            if (byUser[ownerUsername].length >= 5) continue

            const caption = item.caption || ""
            if (caption.length < 10) continue

            // Skip profile bio descriptions
            if (/\d+\s*Followers.*\d+\s*Following/.test(caption)) continue

            byUser[ownerUsername].push({
                text: decodeHtmlEntities(caption.substring(0, 500)),
                url: item.url || "https://www.instagram.com/p/" + item.shortCode + "/",
                images: item.displayUrl ? [item.displayUrl] : [],
                source: "instagram",
                date: item.timestamp || null,
            })
        }

        return byUser
    } catch (e) {
        console.log("Apify batch error: " + e.message)
        return {}
    }
}

// Fetch Facebook posts via Graph API
async function fetchFacebookPosts(pageName, accessToken) {
    if (!pageName || !accessToken) return []

    try {
        const searchUrl = "https://graph.facebook.com/v19.0/" + pageName +
            "?fields=id,name,about,description&access_token=" + accessToken
        const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) })

        if (!searchRes.ok) return []
        const pageData = await searchRes.json()
        if (!pageData.id) return []

        const postsUrl = "https://graph.facebook.com/v19.0/" + pageData.id +
            "/posts?fields=message,created_time,full_picture,permalink_url&limit=5&access_token=" + accessToken
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

        const { data: dbStores } = await supabase
            .from("stores").select("*").eq("active", true)

        if (!dbStores?.length) {
            return Response.json({ message: "Ingen butikker funnet", stores: 0, newContent: 0 }, { status: 404 })
        }

        const storeConfig = {}
        for (const s of STORES) {
            storeConfig[s.name.toLowerCase()] = s
        }

        // Collect all Instagram usernames
        const igUsernames = []
        const usernameToStore = {}
        for (const store of dbStores) {
            const config = storeConfig[store.name.toLowerCase()]
            if (config?.instagram) {
                igUsernames.push(config.instagram)
                usernameToStore[config.instagram.toLowerCase()] = store
            }
        }

        let totalInserted = 0
        const errors = []
        const results = { instagram: 0, facebook: 0 }

        // Process Instagram in batches of 5 via Apify
        const BATCH_SIZE = 5
        for (let i = 0; i < igUsernames.length; i += BATCH_SIZE) {
            const batch = igUsernames.slice(i, i + BATCH_SIZE)
            console.log("Apify batch " + (Math.floor(i/BATCH_SIZE)+1) + ": " + batch.join(", "))

            const igPostsByUser = await fetchInstagramBatchViaApify(batch)
            console.log("  -> Got posts for " + Object.keys(igPostsByUser).length + " profiles")

            for (const [username, posts] of Object.entries(igPostsByUser)) {
                const store = usernameToStore[username.toLowerCase()]
                if (!store) continue

                for (const post of posts) {
                    const hash = hashContent(post.text)
                    const { data: existing } = await supabase
                        .from("content").select("id").eq("content_hash", hash).limit(1)
                    if (existing?.length > 0) continue

                    const { error } = await supabase.from("content").insert({
                        store_id: store.id,
                        source: "instagram",
                        original_text: post.text,
                        original_url: post.url,
                        image_urls: post.images?.filter(img => img?.startsWith("http")) || [],
                        content_hash: hash,
                    })

                    if (!error) {
                        totalInserted++
                        results.instagram++
                    } else {
                        errors.push(store.name + " (IG): " + error.message)
                    }
                }
            }
        }

        // Process Facebook in batches of 3
        for (let i = 0; i < dbStores.length; i += 3) {
            const batch = dbStores.slice(i, i + 3)
            const batchResults = await Promise.all(
                batch.map(async (store) => {
                    const config = storeConfig[store.name.toLowerCase()]
                    if (!config?.facebook || !accessToken) return { store, posts: [] }
                    const fbPosts = await fetchFacebookPosts(config.facebook, accessToken)
                    return { store, posts: fbPosts }
                })
            )

            for (const { store, posts } of batchResults) {
                for (const post of posts) {
                    const hash = hashContent(post.text)
                    const { data: existing } = await supabase
                        .from("content").select("id").eq("content_hash", hash).limit(1)
                    if (existing?.length > 0) continue

                    const { error } = await supabase.from("content").insert({
                        store_id: store.id,
                        source: "facebook",
                        original_text: post.text,
                        original_url: post.url,
                        image_urls: post.images?.filter(img => img?.startsWith("http")) || [],
                        content_hash: hash,
                    })

                    if (!error) {
                        totalInserted++
                        results.facebook++
                    } else {
                        errors.push(store.name + " (FB): " + error.message)
                    }
                }
            }
        }

        // Trigger AI analysis if new content found
        if (totalInserted > 0) {
            const base = process.env.VERCEL_URL
                ? "https://" + process.env.VERCEL_URL
                : "http://localhost:3000"
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
