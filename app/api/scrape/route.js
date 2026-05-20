import { createClient } from "@supabase/supabase-js"
import * as cheerio from "cheerio"
import { createHash } from "crypto"

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

function hashContent(text) {
  return createHash("md5").update(text).digest("hex")
}

const CAMPAIGN_PATHS = ["/kampanje", "/kampanjer", "/tilbud", "/salg", "/aktuelt", "/nyheter"]

async function fetchPage(url, timeout = 8000) {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "nb-NO,nb;q=0.9,no;q=0.8",
      },
      signal: AbortSignal.timeout(timeout),
      redirect: "follow",
    })
    if (!res.ok) return null
    return await res.text()
  } catch {
    return null
  }
}

function extractContent(html, store) {
  const $ = cheerio.load(html)
  const blocks = []
  const metaDesc = $('meta[name="description"]').attr("content") || ""
  const ogTitle = $('meta[property="og:title"]').attr("content") || ""
  const ogDesc = $('meta[property="og:description"]').attr("content") || ""
  const metaText = [ogTitle, ogDesc || metaDesc].filter(t => t && t.length > 15).join(" - ")
  if (metaText && metaText.length > 30) {
    blocks.push({ text: metaText, url: store.url })
  }
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html())
      const items = Array.isArray(json) ? json : [json]
      for (const item of items) {
        if (item["@type"] === "Product" && item.offers) {
          const text = [item.name, item.description, item.offers?.price ? "Pris: " + item.offers.price + " kr" : ""].filter(Boolean).join(" - ")
          if (text.length > 30) blocks.push({ text: text.substring(0, 400), url: store.url })
        }
        if (item["@type"] === "Event") {
          const text = [item.name, item.description, item.startDate].filter(Boolean).join(" - ")
          if (text.length > 20) blocks.push({ text: text.substring(0, 400), url: store.url })
        }
      }
    } catch {}
  })
  $("script, style, nav, footer, iframe, noscript, svg, form").remove()
  const rx = /(salg|tilbud|rabatt|kampanje|spar |prosent|% |gratis|nyhet|ny |nye |lansering|event|arrangement|sesong|sommer|vinter|jul|black friday|medlem|eksklusiv|begrenset|superpris|kupp|deal)/i
  $("h1, h2, h3, h4, p, li, a").each((_, el) => {
    const text = $(el).text().trim().replace(/\s+/g, " ")
    if (text.length > 25 && text.length < 500 && rx.test(text)) {
      blocks.push({ text, url: $(el).attr("href") || store.url })
    }
  })
  $("h1, h2").each((_, el) => {
    const text = $(el).text().trim().replace(/\s+/g, " ")
    if (text.length > 15 && text.length < 200) {
      blocks.push({ text: "[Hovedbudskap] " + text, url: store.url })
    }
  })
  return blocks
}

async function scrapeStore(store) {
  const results = []
  const html = await fetchPage(store.url)
  if (html) results.push(...extractContent(html, store))
  const baseUrl = store.url.replace(/\/+$/, "")
  for (const path of CAMPAIGN_PATHS) {
    if (results.length >= 5) break
    const subHtml = await fetchPage(baseUrl + path, 5000)
    if (subHtml && subHtml.length > 1000) results.push(...extractContent(subHtml, store))
  }
  const seen = new Set()
  return results.filter(b => {
    const key = b.text.substring(0, 60).toLowerCase()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).slice(0, 5)
}

export async function POST() {
  try {
    const { data: stores } = await supabase.from("stores").select("*").eq("active", true)
    if (!stores?.length) return Response.json({ message: "Ingen butikker funnet", stores: 0, newContent: 0 }, { status: 404 })
    let totalInserted = 0
    const errors = []
    for (let i = 0; i < stores.length; i += 3) {
      const batch = stores.slice(i, i + 3)
      const results = await Promise.all(batch.map(s => scrapeStore(s)))
      for (let j = 0; j < batch.length; j++) {
        const store = batch[j]
        for (const block of results[j]) {
          const hash = hashContent(block.text)
          const { data: existing } = await supabase.from("content").select("id").eq("content_hash", hash).limit(1)
          if (existing?.length > 0) continue
          const { error } = await supabase.from("content").insert({
            store_id: store.id, source: "website", original_text: block.text,
            original_url: block.url?.startsWith("http") ? block.url : store.url, content_hash: hash,
          })
          if (!error) totalInserted++
          else errors.push(store.name + ": " + error.message)
        }
      }
    }
    if (totalInserted > 0) {
      const base = process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : "http://localhost:3000"
      await fetch(base + "/api/analyze", { method: "POST" }).catch(() => {})
    }
    return Response.json({ message: "Scraping ferdig", stores: stores.length, newContent: totalInserted, errors: errors.length > 0 ? errors.slice(0, 5) : undefined })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
