import { createClient } from "@supabase/supabase-js"
import { createHash } from "crypto"
import { syncTenantsToStores } from "../../../lib/syncTenants"

export const maxDuration = 300

// Service role bypasses RLS so this server route can read/write stores & content.
const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL

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

// Upload image to Supabase Storage and return permanent URL
async function uploadImageToStorage(imageUrl, storeId, postId) {
    try {
        const res = await fetch(imageUrl, { signal: AbortSignal.timeout(8000) })
        if (!res.ok) return null
        const contentType = res.headers.get("content-type") || "image/jpeg"
        const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg"
        const buffer = await res.arrayBuffer()
        if (buffer.byteLength < 1000 || buffer.byteLength > 5000000) return null
        const fileName = storeId + "/" + postId + "." + ext
        const { error } = await supabase.storage
            .from("content-images")
            .upload(fileName, buffer, { contentType, upsert: true })
        if (error) {
            console.log("Storage upload error: " + error.message)
            return null
        }
        return SUPABASE_URL + "/storage/v1/object/public/content-images/" + fileName
    } catch (e) {
        console.log("Image download error: " + e.message)
        return null
    }
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
        const searchUrl = "https://graph.facebook.com/v19.0/" + pageName + "?fields=id,name,about,description&access_token=" + accessToken
        const searchRes = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) })
        if (!searchRes.ok) return []
        const pageData = await searchRes.json()
        if (!pageData.id) return []

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
                    date: post.created_time || null,
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

export async function POST(request) {
    try {
        const accessToken = getAccessToken()

        let centerId = null
        try {
            const body = await request.json()
            centerId = body?.centerId || null
        } catch {
            // No body — scan all active stores (legacy behavior).
        }

        // Ensure stores exist (with social handles) for the center's tenants,
        // then read them. Without a centerId, fall back to all active stores.
        let dbStores = []
        if (centerId) {
            await syncTenantsToStores(centerId, supabase)
            const { data } = await supabase
                .from("stores").select("*").eq("center_id", centerId).eq("active", true)
            dbStores = data || []
        } else {
            const { data } = await supabase
                .from("stores").select("*").eq("active", true)
            dbStores = data || []
        }

        if (!dbStores.length) {
            return Response.json({ message: "Ingen butikker funnet", stores: 0, newContent: 0 }, { status: 404 })
        }

        // Collect Instagram usernames from each store's stored handle.
        const igUsernames = []
        const usernameToStore = {}
        for (const store of dbStores) {
            if (store.instagram_handle) {
                igUsernames.push(store.instagram_handle)
                usernameToStore[store.instagram_handle.toLowerCase()] = store
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
            console.log(" -> Got posts for " + Object.keys(igPostsByUser).length + " profiles")

            for (const [username, posts] of Object.entries(igPostsByUser)) {
                const store = usernameToStore[username.toLowerCase()]
                if (!store) continue

                for (const post of posts) {
                    const hash = hashContent(post.text)
                    const { data: existing } = await supabase
                        .from("content").select("id").eq("content_hash", hash).limit(1)
                    if (existing?.length > 0) continue

                    // Upload image to permanent storage
                    let imageUrls = post.images?.filter(img => img?.startsWith("http")) || []
                    if (imageUrls.length > 0) {
                        const postId = hash.substring(0, 12)
                        const permanentUrl = await uploadImageToStorage(imageUrls[0], store.id, postId)
                        if (permanentUrl) {
                            imageUrls = [permanentUrl]
                        }
                    }

                    const { error } = await supabase.from("content").insert({
                        store_id: store.id,
                        source: "instagram",
                        original_text: post.text,
                        original_url: post.url,
                        image_urls: imageUrls,
                        content_hash: hash,
                        posted_at: post.date || null,
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
                    if (!store.facebook_page || !accessToken) return { store, posts: [] }
                    const fbPosts = await fetchFacebookPosts(store.facebook_page, accessToken)
                    return { store, posts: fbPosts }
                })
            )

            for (const { store, posts } of batchResults) {
                for (const post of posts) {
                    const hash = hashContent(post.text)
                    const { data: existing } = await supabase
                        .from("content").select("id").eq("content_hash", hash).limit(1)
                    if (existing?.length > 0) continue

                    // Upload Facebook images to permanent storage too
                    let imageUrls = post.images?.filter(img => img?.startsWith("http")) || []
                    if (imageUrls.length > 0) {
                        const postId = hash.substring(0, 12)
                        const permanentUrl = await uploadImageToStorage(imageUrls[0], store.id, postId)
                        if (permanentUrl) {
                            imageUrls = [permanentUrl]
                        }
                    }

                    const { error } = await supabase.from("content").insert({
                        store_id: store.id,
                        source: "facebook",
                        original_text: post.text,
                        original_url: post.url,
                        image_urls: imageUrls,
                        content_hash: hash,
                        posted_at: post.date || null,
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
            const base = process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : "http://localhost:3000"
            fetch(base + "/api/analyze", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ centerId })
            }).catch(() => {})
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
