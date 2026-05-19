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

async function scrapeStore(store) {
  try {
    const res = await fetch(store.url, {
      headers: { "User-Agent": "SenterPuls/1.0 (innholdsscanner)" },
      signal: AbortSignal.timeout(10000),
    })
    if (!res.ok) return []
    const html = await res.text()
    const $ = cheerio.load(html)
    $("script, style, nav, footer, header, iframe, noscript").remove()
    const blocks = []
    $("h1, h2, h3, p, li, span, div, a").each((_, el) => {
      const text = $(el).text().trim()
      if (text.length > 30 && text.length < 500) {
        const isCampaign = /(salg|tilbud|rabatt|kampanje|spar |%|gratis|nyhet|ny |nye |lansering|event|arrangement|åpningstid|sesong|sommer|vinter|vår|høst|jul|påske|black friday|member|medlem)/i.test(text)
        if (isCampaign) {
          blocks.push({ text, url: $(el).attr("href") || store.url })
        }
      }
    })
    const seen = new Set()
    const unique = blocks.filter(b => {
      const key = b.text.substring(0, 50)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    return unique.slice(0, 5)
  } catch (e) {
    console.error("Scrape failed for " + store.name + ":", e.message)
    return []
  }
}

export async function POST() {
  try {
    const { data: stores } = await supabase.from("stores").select("*").eq("active", true)
    if (!stores?.length) return Response.json({ message: "No stores found" }, { status: 404 })
    let totalInserted = 0
    for (let i = 0; i < stores.length; i += 5) {
      const batch = stores.slice(i, i + 5)
      const results = await Promise.all(batch.map(s => scrapeStore(s)))
      for (let j = 0; j < batch.length; j++) {
        const store = batch[j]
        const blocks = results[j]
        for (const block of blocks) {
          const hash = hashContent(block.text)
          const { error } = await supabase.from("content").insert({
            store_id: store.id, source: "website", original_text: block.text,
            original_url: block.url?.startsWith("http") ? block.url : store.url,
            content_hash: hash,
          })
          if (!error) totalInserted++
        }
      }
    }
    if (totalInserted > 0) {
      const base = process.env.VERCEL_URL ? "https://" + process.env.VERCEL_URL : "http://localhost:3000"
      await fetch(base + "/api/analyze", { method: "POST" }).catch(() => {})
    }
    return Response.json({ message: "Scraping ferdig", stores: stores.length, newContent: totalInserted })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}