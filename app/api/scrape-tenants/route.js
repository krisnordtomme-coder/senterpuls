import { NextResponse } from "next/server"

// Common noise words to filter out from scraped results
const NOISE = new Set([
  "hjem", "home", "om oss", "about", "kontakt", "contact", "butikker", "stores",
  "kart", "map", "parkering", "parking", "apningstider", "opening hours",
  "nyheter", "news", "events", "tilbud", "offers", "gavekort", "gift card",
  "personvern", "privacy", "cookies", "meny", "menu", "logg inn", "login",
  "sok", "search", "les mer", "read more", "se alle", "view all", "finn oss",
  "facebook", "instagram", "twitter", "linkedin", "youtube", "tiktok",
  "alle butikker", "alle", "vis alle", "tilbake", "back", "forside",
])

function cleanName(name) {
  return name.replace(/\s+/g, " ").replace(/[\n\r\t]/g, "").trim()
}

function isValidStoreName(name) {
  if (!name || name.length < 2 || name.length > 80) return false
  if (NOISE.has(name.toLowerCase())) return false
  // Skip if it looks like a sentence (too many words)
  if (name.split(" ").length > 6) return false
  // Skip if it's a URL
  if (name.startsWith("http") || name.includes("www.")) return false
  // Skip if mostly numbers
  if (/^[\d\s.,-]+$/.test(name)) return false
  // Skip common nav items
  if (/^(\d+|copyright|\u00a9|tel|tlf|epost|email)/i.test(name)) return false
  return true
}

export async function POST(request) {
  try {
    const { url } = await request.json()
    if (!url) {
      return NextResponse.json({ error: "URL er p\u00e5krevd" }, { status: 400 })
    }

    // Validate URL
    let parsedUrl
    try {
      parsedUrl = new URL(url.startsWith("http") ? url : "https://" + url)
    } catch {
      return NextResponse.json({ error: "Ugyldig URL" }, { status: 400 })
    }

    // Fetch the page
    const res = await fetch(parsedUrl.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SenterPuls/1.0; +https://senterpuls.no)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "nb-NO,nb;q=0.9,no;q=0.8,nn;q=0.7,en;q=0.5",
      },
      signal: AbortSignal.timeout(15000),
    })

    if (!res.ok) {
      return NextResponse.json({ error: `Kunne ikke hente siden (HTTP ${res.status})` }, { status: 400 })
    }

    const html = await res.text()

    // Strategy 1: Look for structured store listings
    // Common patterns: links in store lists, card components, directory items
    const names = new Set()

    // Extract from common store listing patterns
    // Pattern: <a ...>Store Name</a> within list/card structures
    const linkPattern = /<a[^>]*>([^<]{2,60})<\/a>/gi
    let match
    while ((match = linkPattern.exec(html)) !== null) {
      const name = cleanName(match[1])
      if (isValidStoreName(name)) names.add(name)
    }

    // Pattern: <h2>, <h3>, <h4> headings that might be store names
    const headingPattern = /<h[2-4][^>]*>([^<]{2,60})<\/h[2-4]>/gi
    while ((match = headingPattern.exec(html)) !== null) {
      const name = cleanName(match[1])
      if (isValidStoreName(name)) names.add(name)
    }

    // Pattern: data attributes or aria labels with store names
    const dataPattern = /(?:data-name|data-store|data-title|aria-label)="([^"]{2,60})"/gi
    while ((match = dataPattern.exec(html)) !== null) {
      const name = cleanName(match[1])
      if (isValidStoreName(name)) names.add(name)
    }

    // Pattern: JSON-LD structured data
    const jsonLdPattern = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
    while ((match = jsonLdPattern.exec(html)) !== null) {
      try {
        const data = JSON.parse(match[1])
        const items = Array.isArray(data) ? data : [data]
        for (const item of items) {
          if (item.name && isValidStoreName(cleanName(item.name))) {
            names.add(cleanName(item.name))
          }
          if (item.itemListElement) {
            for (const el of item.itemListElement) {
              if (el.name && isValidStoreName(cleanName(el.name))) {
                names.add(cleanName(el.name))
              }
              if (el.item?.name && isValidStoreName(cleanName(el.item.name))) {
                names.add(cleanName(el.item.name))
              }
            }
          }
        }
      } catch {}
    }

    // Sort alphabetically
    const tenants = [...names].sort((a, b) => a.localeCompare(b, "nb")).map(name => ({ name }))

    return NextResponse.json({
      success: true,
      url: parsedUrl.toString(),
      count: tenants.length,
      tenants,
      disclaimer: "Denne listen er automatisk hentet og kan inneholde feil. Vennligst kontroller og komplett\u00e9r listen manuelt."
    })

  } catch (error) {
    return NextResponse.json(
      { error: `Feil ved henting: ${error.message}` },
      { status: 500 }
    )
  }
}
