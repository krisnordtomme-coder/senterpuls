import { NextResponse } from "next/server"

// Common Norwegian navigation/menu items to filter out
const NAV_BLACKLIST = new Set([
  "hjem", "home", "forside", "startside",
  "om oss", "om senteret", "om", "about", "about us",
  "kontakt", "kontakt oss", "contact", "contact us",
  "butikker", "shops", "stores", "alle butikker", "våre butikker", "butikkoversikt",
  "restauranter", "spisesteder", "mat og drikke", "food & drink",
  "åpningstider", "opening hours", "åpent",
  "nyheter", "news", "aktuelt", "kampanjer", "tilbud", "events",
  "parkering", "parking", "kart", "map", "finn oss", "find us", "veibeskrivelse",
  "gavekort", "gift card", "giftcard",
  "jobb", "jobb hos oss", "ledige stillinger", "karriere", "career", "jobs",
  "personvern", "privacy", "cookies", "informasjonskapsler", "cookiepolicy",
  "meny", "menu", "søk", "search", "logg inn", "login", "log in", "min side",
  "tjenester", "services", "kundesenter", "customer service",
  "utleie", "leie", "ledig lokale",
  "tilgjengelighet", "accessibility",
  "bli kunde", "nyhetsbrev", "newsletter", "abonner",
  "vilkår", "terms", "betingelser",
  "facebook", "instagram", "twitter", "linkedin", "youtube", "tiktok", "snapchat",
  "les mer", "read more", "se mer", "see more", "vis alle", "show all", "se alle",
  "tilbake", "back", "lukk", "close", "ok",
  "english", "norsk", "språk",
  "senterleder", "administrasjon", "driftsmelding",
  "bærekraft", "miljø", "sustainability",
  "faq", "spørsmål og svar", "ofte stilte spørsmål"
])

// Patterns that indicate navigation/non-store content
const NAV_PATTERNS = [
  /^#/,                           // Anchor links
  /^javascript:/i,                // JS links
  /^mailto:/i,                    // Email links
  /^tel:/i,                       // Phone links
  /\.(pdf|jpg|jpeg|png|gif|svg|ico|css|js)$/i,  // File links
  /\/(login|signin|signup|auth|admin|dashboard|cart|checkout|search|tag|category|page\/\d)/i,
  /(facebook|instagram|twitter|linkedin|youtube|tiktok|snapchat|pinterest)\.(com|no)/i,
  /cookie|gdpr|privacy|personvern/i,
]

// Patterns that indicate a store/tenant listing page section
const STORE_SECTION_SELECTORS = [
  // Common class/id patterns for store listings
  /(?:store|shop|tenant|butikk|leietaker|brand)s?[-_]?(?:list|grid|container|wrapper|directory|overview|section)/i,
  /(?:list|grid|container|wrapper|directory|overview|section)[-_]?(?:store|shop|tenant|butikk|leietaker|brand)s?/i,
  /all[-_]?(?:store|shop|tenant|butikk)s?/i,
]

function normalizeText(text) {
  if (!text) return ""
  // Decode common HTML entities including Norwegian chars
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&aring;/gi, "å")
    .replace(/&Aring;/gi, "Å")
    .replace(/&aelig;/gi, "æ")
    .replace(/&AElig;/gi, "Æ")
    .replace(/&oslash;/gi, "ø")
    .replace(/&Oslash;/gi, "Ø")
    .replace(/&#229;/g, "å")
    .replace(/&#197;/g, "Å")
    .replace(/&#230;/g, "æ")
    .replace(/&#198;/g, "Æ")
    .replace(/&#248;/g, "ø")
    .replace(/&#216;/g, "Ø")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(parseInt(code)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function isLikelyStoreName(name) {
  if (!name || name.length < 2 || name.length > 60) return false

  const lower = name.toLowerCase().trim()

  // Check blacklist
  if (NAV_BLACKLIST.has(lower)) return false

  // Filter out things that look like navigation
  if (NAV_PATTERNS.some(p => p.test(lower))) return false

  // Filter out pure numbers, dates, prices
  if (/^\d+$/.test(name)) return false
  if (/^\d{1,2}[.:]\d{2}/.test(name)) return false  // Times like 10:00
  if (/^kr\s?\d|^\d+\s?kr/i.test(name)) return false  // Prices

  // Filter out sentences (stores don't have long descriptions as names)
  if (name.split(" ").length > 6) return false

  // Filter out common UI text patterns
  if (/^(vis|se|les|klikk|trykk|gå til|last|scroll|swipe)/i.test(lower)) return false
  if (/^(copyright|©|\d{4}\s)/i.test(lower)) return false

  // Filter single common words that are not stores
  const singleWordBlacklist = new Set([
    "ja", "nei", "ok", "eller", "og", "til", "fra", "med", "for", "den", "det", "de",
    "er", "var", "har", "kan", "vil", "skal", "her", "der", "alle", "mer", "nye",
    "stort", "lite", "god", "ny", "gammel", "åpen", "stengt", "ledig", "info"
  ])
  if (singleWordBlacklist.has(lower)) return false

  return true
}

function isNavUrl(href) {
  if (!href) return false
  return NAV_PATTERNS.some(p => p.test(href))
}

function resolveUrl(href, baseUrl) {
  if (!href) return null
  try {
    return new URL(href, baseUrl).href
  } catch {
    return null
  }
}

function getMainDomain(urlStr) {
  try {
    const hostname = new URL(urlStr).hostname.toLowerCase()
    const parts = hostname.replace(/^www\\./, "").split(".")
    if (parts.length >= 2) return parts.slice(-2).join(".")
    return hostname
  } catch {
    return null
  }
}

function isSameDomain(tenantUrl, sourceUrl) {
  if (!tenantUrl || !sourceUrl) return false
  const tenantDomain = getMainDomain(tenantUrl)
  const sourceDomain = getMainDomain(sourceUrl)
  if (!tenantDomain || !sourceDomain) return false
  return tenantDomain === sourceDomain
}

function extractFromHtml(html, sourceUrl) {
  const tenants = []
  const seen = new Set()
  const baseUrl = sourceUrl

  // Strategy 1: JSON-LD structured data (highest confidence)
  const jsonLdPattern = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let jsonLdMatch
  while ((jsonLdMatch = jsonLdPattern.exec(html)) !== null) {
    try {
      const data = JSON.parse(jsonLdMatch[1])
      const items = Array.isArray(data) ? data : [data]
      for (const item of items) {
        // Look for Store, LocalBusiness, etc.
        if (item["@type"] && /Store|LocalBusiness|Restaurant|Shop|Organization/i.test(
          Array.isArray(item["@type"]) ? item["@type"].join(",") : item["@type"]
        )) {
          const name = normalizeText(item.name)
          if (name && isLikelyStoreName(name) && !seen.has(name.toLowerCase())) {
            seen.add(name.toLowerCase())
            tenants.push({ name, url: item.url || null, source: "json-ld", confidence: 0.95 })
          }
        }
        // Check for ItemList containing stores
        if (item["@type"] === "ItemList" && item.itemListElement) {
          for (const el of item.itemListElement) {
            const elItem = el.item || el
            const name = normalizeText(elItem.name)
            if (name && isLikelyStoreName(name) && !seen.has(name.toLowerCase())) {
              seen.add(name.toLowerCase())
              tenants.push({ name, url: elItem.url || null, source: "json-ld-list", confidence: 0.95 })
            }
          }
        }
      }
    } catch (e) { /* invalid JSON-LD, skip */ }
  }

  // Strategy 2: Find store listing sections by class/id patterns
  // Extract content from main/article/section areas, skip nav/header/footer
  const stripNavRegex = /<(nav|header|footer|aside)[\s>][\s\S]*?<\/\1>/gi
  const mainContent = html.replace(stripNavRegex, "")

  // Strategy 3: Look for repeated link patterns in list/grid structures
  // Find <ul>, <ol>, or grid-like divs with many links (likely store lists)
  const listPatterns = [
    // <li> items with links inside — common store list pattern
    /<li[^>]*>[\s\S]*?<a[^>]*href\s*=\s*["']([^"'#]*?)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/li>/gi,
    // Card-like divs with links
    /<(?:div|article|section)[^>]*class\s*=\s*["'][^"']*(?:store|shop|tenant|butikk|brand|card|item|tile)[^"']*["'][^>]*>[\s\S]*?<a[^>]*href\s*=\s*["']([^"'#]*?)["'][^>]*>([\s\S]*?)<\/a>/gi,
  ]

  for (const pattern of listPatterns) {
    let match
    while ((match = pattern.exec(mainContent)) !== null) {
      const href = match[1]
      const rawText = match[2].replace(/<[^>]*>/g, "")
      const name = normalizeText(rawText)
      if (name && isLikelyStoreName(name) && !seen.has(name.toLowerCase()) && !isNavUrl(href)) {
        seen.add(name.toLowerCase())
        const url = resolveUrl(href, baseUrl)
        tenants.push({ name, url, source: "list-link", confidence: 0.8 })
      }
    }
  }

  // Strategy 4: Links within store-specific sections (by class/id)
  for (const sectionPattern of STORE_SECTION_SELECTORS) {
    const sectionRegex = new RegExp(
      `<(?:div|section|ul|article)[^>]*(?:class|id)\\s*=\\s*["'][^"']*${sectionPattern.source}[^"']*["'][^>]*>([\\s\\S]*?)<\\/(?:div|section|ul|article)>`,
      "gi"
    )
    let sectionMatch
    while ((sectionMatch = sectionRegex.exec(html)) !== null) {
      const sectionHtml = sectionMatch[1]
      const linkRegex = /<a[^>]*href\s*=\s*["']([^"'#]*?)["'][^>]*>([\s\S]*?)<\/a>/gi
      let linkMatch
      while ((linkMatch = linkRegex.exec(sectionHtml)) !== null) {
        const href = linkMatch[1]
        const rawText = linkMatch[2].replace(/<[^>]*>/g, "")
        const name = normalizeText(rawText)
        if (name && isLikelyStoreName(name) && !seen.has(name.toLowerCase()) && !isNavUrl(href)) {
          seen.add(name.toLowerCase())
          const url = resolveUrl(href, baseUrl)
          tenants.push({ name, url, source: "store-section", confidence: 0.9 })
        }
      }
    }
  }

  // Strategy 5: data-attributes that mention store/tenant/butikk
  const dataAttrRegex = /<[^>]*data-(?:store|shop|tenant|butikk|brand)[-_]?name\s*=\s*["']([^"']+)["'][^>]*(?:href\s*=\s*["']([^"']*?)["'])?/gi
  let dataMatch
  while ((dataMatch = dataAttrRegex.exec(html)) !== null) {
    const name = normalizeText(dataMatch[1])
    const href = dataMatch[2]
    if (name && isLikelyStoreName(name) && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase())
      const url = resolveUrl(href, baseUrl)
      tenants.push({ name, url, source: "data-attr", confidence: 0.9 })
    }
  }

  // Strategy 6: General link extraction from main content (lower confidence)
  // Only use if we haven't found enough from higher-confidence methods
  if (tenants.length < 5) {
    const generalLinkRegex = /<a[^>]*href\s*=\s*["']([^"'#]*?)["'][^>]*>([\s\S]*?)<\/a>/gi
    let generalMatch
    const generalCandidates = []
    while ((generalMatch = generalLinkRegex.exec(mainContent)) !== null) {
      const href = generalMatch[1]
      const rawText = generalMatch[2].replace(/<[^>]*>/g, "")
      const name = normalizeText(rawText)
      if (name && isLikelyStoreName(name) && !seen.has(name.toLowerCase()) && !isNavUrl(href)) {
        const url = resolveUrl(href, baseUrl)
        generalCandidates.push({ name, url, source: "general-link", confidence: 0.5 })
      }
    }

    // Only add general candidates if there are several (indicates a listing)
    if (generalCandidates.length >= 4) {
      for (const c of generalCandidates) {
        if (!seen.has(c.name.toLowerCase())) {
          seen.add(c.name.toLowerCase())
          tenants.push(c)
        }
      }
    }
  }

  // Strategy 7: Heading-based extraction (h2, h3, h4) in main content
  // Some sites list stores as headings
  if (tenants.length < 5) {
    const headingRegex = /<h[2-4][^>]*>([\s\S]*?)<\/h[2-4]>/gi
    const headingCandidates = []
    let headingMatch
    while ((headingMatch = headingRegex.exec(mainContent)) !== null) {
      const rawText = headingMatch[1].replace(/<[^>]*>/g, "")
      const name = normalizeText(rawText)
      if (name && isLikelyStoreName(name) && !seen.has(name.toLowerCase())) {
        headingCandidates.push({ name, url: null, source: "heading", confidence: 0.4 })
      }
    }
    // Only use if many headings found (indicates a listing)
    if (headingCandidates.length >= 5) {
      for (const c of headingCandidates) {
        if (!seen.has(c.name.toLowerCase())) {
          seen.add(c.name.toLowerCase())
          tenants.push(c)
        }
      }
    }
  }

  // Sort by confidence descending, then alphabetically
  tenants.sort((a, b) => b.confidence - a.confidence || a.name.localeCompare(b.name, "nb"))

  return tenants
}

export async function POST(req) {
  try {
    const { url } = await req.json()
    if (!url) {
      return NextResponse.json({ success: false, error: "URL er påkrevd" }, { status: 400 })
    }

    const fetchUrl = url.startsWith("http") ? url : `https://${url}`

    const res = await fetch(fetchUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "nb-NO,nb;q=0.9,no;q=0.8,nn;q=0.7,en;q=0.5",
        "Accept-Charset": "utf-8"
      },
      redirect: "follow",
      signal: AbortSignal.timeout(15000)
    })

    if (!res.ok) {
      return NextResponse.json({ success: false, error: `Kunne ikke hente siden (${res.status})` }, { status: 200 })
    }

    // Handle encoding properly for Norwegian characters
    const contentType = res.headers.get("content-type") || ""
    let html

    if (contentType.includes("charset=iso-8859-1") || contentType.includes("charset=latin1") || contentType.includes("charset=windows-1252")) {
      // Handle Latin-1 encoded pages (common for older Norwegian sites)
      const buffer = await res.arrayBuffer()
      const decoder = new TextDecoder("windows-1252")
      html = decoder.decode(buffer)
    } else {
      // Try UTF-8 first, check meta charset
      const buffer = await res.arrayBuffer()
      let tempHtml = new TextDecoder("utf-8").decode(buffer)

      // Check if the page declares a different charset in meta tag
      const charsetMatch = tempHtml.match(/<meta[^>]*charset\s*=\s*["']?([^"'\s;>]+)/i)
      const httpEquivMatch = tempHtml.match(/<meta[^>]*content\s*=\s*["'][^"']*charset=([^"'\s;]+)/i)
      const declaredCharset = (charsetMatch?.[1] || httpEquivMatch?.[1] || "").toLowerCase()

      if (declaredCharset && !declaredCharset.includes("utf") && declaredCharset !== "ascii") {
        try {
          const decoder = new TextDecoder(declaredCharset)
          html = decoder.decode(buffer)
        } catch {
          html = tempHtml  // Fallback to UTF-8
        }
      } else {
        html = tempHtml
      }
    }

    const tenants = extractFromHtml(html, fetchUrl)

    if (tenants.length === 0) {
      return NextResponse.json({
        success: false,
        error: "Fant ingen butikker på denne siden. Prøv å bruke URL-en til butikkoversikten (f.eks. /butikker eller /stores)."
      })
    }

    // Return tenants with name and url
    return NextResponse.json({
      success: true,
      tenants: tenants.map(t => ({ name: t.name, url: t.url && !isSameDomain(t.url, fetchUrl) ? t.url : null })),
      count: tenants.length
    })

  } catch (e) {
    if (e.name === "TimeoutError" || e.name === "AbortError") {
      return NextResponse.json({ success: false, error: "Tidsavbrudd — siden svarte ikke i tide." }, { status: 200 })
    }
    return NextResponse.json({ success: false, error: "Intern feil ved henting av butikker." }, { status: 500 })
  }
}
