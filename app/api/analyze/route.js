import { createClient } from "@supabase/supabase-js"
import Anthropic from "@anthropic-ai/sdk"

export const maxDuration = 300

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MIN_RELEVANCE_SCORE = 50
const MIN_RELEVANCE_SCORE_SOME = 20

// Maps the tone_of_voice slug (set on the center settings page) to a tone
// instruction for the model. Keep keys in sync with TONE_OPTIONS in
// app/center/[id]/page.js.
const TONE_PROFILES = {
  "varm-og-inviterende": "varm, vennlig og inkluderende – imøtekommende og familievennlig",
  "moderne-og-trendy": "moderne, ung og trendy – friskt, ungdommelig og i tiden",
  "lokal-og-naer": "lokal og nær – jordnær, nedpå og lokalt forankret",
  "eksklusiv-og-premium": "eksklusiv og premium – sofistikert, elegant og kvalitetsbevisst",
  "praktisk-og-effektiv": "praktisk og effektiv – rett på sak, tydelig og funksjonell",
  "baerekraftig-og-bevisst": "bærekraftig og bevisst – miljøbevisst, ansvarlig og verdidrevet",
}

// Fallbacks preserve the previous hardcoded behavior for centers that have not
// configured a tone / customer group.
const DEFAULT_TONE = "ung og energisk – varm og inkluderende, men med et moderne driv"
const DEFAULT_AUDIENCE = "Familier med barn, bredt aldersspenn"

function buildSystemPrompt(center) {
  const centerName = center?.name || "Kjøpesenteret"
  const tone = (center?.tone_of_voice && TONE_PROFILES[center.tone_of_voice]) || DEFAULT_TONE
  const audience = center?.customer_group?.trim() || DEFAULT_AUDIENCE
  const positioningLine = center?.positioning?.trim()
    ? `\n\nSENTERETS POSISJONERING: ${center.positioning.trim()}`
    : ""

  return `Du er en innholdsanalytiker for kjøpesenteret ${centerName}.

SENTERETS TONE: ${tone}. Bruk emojis sparsomt (1-3 per post). Skriv kort og punchete.

MÅLGRUPPE: ${audience}.${positioningLine}

VIKTIG - KONTEKSTUALISERING:
- Alt innhold du genererer skal handle om ${centerName}. ALDRI nevn andre kjøpesentre.
- Hvis kildematerialet nevner et annet senter eller en annen lokasjon, ERSTATT det med ${centerName}.
- Hashtags skal bruke #${centerName.replace(/\s+/g, "")} (uten mellomrom).

VIKTIG - KUN FYSISK BESØK:
Senteret ønsker KUN å promotere fysisk besøk i butikkene. Du skal ALDRI:
- Nevne nettbutikk, netthandel, e-handel, "bestill online", "kjøp på nett", "handle fra sofaen" eller lignende
- Inkludere lenker til nettbutikker eller oppfordre til netthandel
- Bruke formuleringer som "tilgjengelig online", "finn det på nett", "nettilbud" osv.
Alt innhold skal oppfordre til å BESØKE butikken fysisk på ${centerName}. Bruk formuleringer som "stikk innom", "finn det i butikken", "kom og se", "besøk oss på senteret" osv.
Hvis kildematerialet handler UTELUKKENDE om netthandel uten fysisk relevans, gi relevans-score under 20.

VIKTIG - FILTRERINGSKRITERIER:
Du skal KUN gi høy relevans-score (50+) til innhold som er:
- Aktive kampanjer eller salg (f.eks. "50% på utvalgte varer", "medlemsdager")
- Nye produktlanseringer eller kolleksjoner
- Konkrete events eller arrangementer med dato
- Sesongbaserte tilbud med tidsavgrensning
- Bærekraftsinitiativer eller konkrete nyheter

Du skal gi LAV relevans-score (under 30) til:
- Generelle butikkbeskrivelser ("Vi er en butikk som selger...")
- "Om oss"-tekst eller selskapsinformasjon
- Statisk nettside-innhold uten nyhetsverdi (åpningstider, adresser, kontaktinfo)
- Produktkataloger uten spesifikke tilbud
- Generelle slagord eller merkevare-beskrivelser
- Innhold som bare beskriver hva butikken er eller gjør generelt
- Innhold som kun handler om nettbutikk/netthandel uten fysisk butikk-relevans

UNNTAK FOR SOSIALE MEDIER:
For innhold fra Instagram eller Facebook, vær mer sjenerøs med scoring. Selv profilbeskrivelser og korte poster kan være nyttige for å vise at butikken er aktiv. Gi minst 30 til SoMe-innhold med noe substans.

Din oppgave er å analysere innhold fra en butikk og returnere et JSON-objekt med:
1. category: en av "kampanje", "produktlansering", "event", "sesong", "baerekraft", "nyhet"
2. relevance_score: 1-100 (høyere = mer relevant for senteret å dele)
3. suggested_text: et objekt med ferdige tekster for ulike kanaler:
   - instagram: kort, engasjerende med 1-2 emojis og 3-5 hashtags (inkluder #${centerName.replace(/\s+/g, "")}). Oppfordre til fysisk besøk.
   - facebook: litt lengre, informativ, inkluder oppfordring til å besøke butikken på senteret
   - website: saklig, 2-3 setninger for senterets nettside. Fokus på fysisk besøk.

HUSK: Alt innhold skal kontekstualiseres for ${centerName}. Aldri referer til andre sentre. ALDRI promoter netthandel — kun fysisk besøk i butikken.

Vurder relevans basert på: tidsnærhet, engasjementspotensial, visuell appell, og om det driver fysisk trafikk til senteret.

Svar KUN med gyldig JSON, ingen annen tekst.`
}

async function analyzeContent(storeName, text, source, center) {
  try {
    const centerName = center?.name || "Kjøpesenteret"
    const sourceNote =
      source === "instagram" || source === "facebook"
        ? "\n(Kilde: " + source + " - vurder som SoMe-innhold)"
        : ""

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: buildSystemPrompt(center),
      messages: [
        {
          role: "user",
          content: "Butikk: " + storeName + "\nSenter: " + centerName + sourceNote + "\nInnhold: " + text,
        },
      ],
    })

    let aiText = response.content[0].text
    aiText = aiText.replace(/^```json\s*\n?/, "").replace(/\n?```\s*$/, "")
    return JSON.parse(aiText)
  } catch (e) {
    console.error("AI analysis failed:", e.message)
    return null
  }
}

export async function POST(request) {
  try {
    // Accept optional centerId to scope analysis
    let centerId = null
    try {
      const body = await request.json()
      centerId = body?.centerId || null
    } catch {
      // No body — analyze all unanalyzed content
    }

    const { data: existing } = await supabase.from("suggestions").select("content_id")
    const analyzedIds = new Set((existing || []).map((s) => s.content_id))

    // Fetch content with store AND center info
    // When centerId is provided, first get store IDs for that center, then filter content
    let allContent = null
    let contentError = null

    if (centerId) {
      // Step 1: Get store IDs belonging to this center
      const { data: centerStores, error: storesErr } = await supabase
        .from("stores")
        .select("id")
        .eq("center_id", centerId)

      if (storesErr) {
        console.error("Failed to fetch center stores:", storesErr.message)
        return Response.json({ error: "Failed to fetch stores: " + storesErr.message }, { status: 500 })
      }

      const storeIds = (centerStores || []).map((s) => s.id)
      console.log("Center " + centerId + ": found " + storeIds.length + " stores")

      if (storeIds.length === 0) {
        return Response.json({ message: "Ingen butikker funnet for dette senteret", analyzed: 0 })
      }

      // Step 2: Fetch content for those stores
      const { data, error } = await supabase
        .from("content")
        .select("*, stores(name, center_id)")
        .in("store_id", storeIds)
        .order("scraped_at", { ascending: false })
        .limit(200)

      allContent = data
      contentError = error
    } else {
      const { data, error } = await supabase
        .from("content")
        .select("*, stores(name, center_id)")
        .order("scraped_at", { ascending: false })
        .limit(200)

      allContent = data
      contentError = error
    }

    if (contentError) {
      console.error("Content query failed:", contentError.message)
      return Response.json({ error: "Content query failed: " + contentError.message }, { status: 500 })
    }

    console.log("Fetched " + (allContent || []).length + " content items, " + analyzedIds.size + " already analyzed")
    let toAnalyze = (allContent || []).filter((c) => !analyzedIds.has(c.id))
    console.log("To analyze after filtering: " + toAnalyze.length)

    if (!toAnalyze.length)
      return Response.json({ message: "Ingen nytt innhold å analysere", analyzed: 0 })

    // Build a map of center_id -> center name for all relevant centers
    const centerIds = [...new Set(toAnalyze.map((c) => c.stores?.center_id).filter(Boolean))]
    const centerMap = {}

    if (centerIds.length > 0) {
      const { data: centers } = await supabase
        .from("centers")
        .select("id, name, tone_of_voice, positioning, customer_group")
        .in("id", centerIds)
      for (const c of centers || []) {
        centerMap[c.id] = c
      }
    }

    let analyzed = 0
    let skipped = 0
    const BATCH_SIZE = 5

    for (let i = 0; i < toAnalyze.length; i += BATCH_SIZE) {
      const batch = toAnalyze.slice(i, i + BATCH_SIZE)
      const results = await Promise.all(
        batch.map(async (content) => {
          const center = centerMap[content.stores?.center_id] || { name: "Kjøpesenteret" }
          const result = await analyzeContent(
            content.stores?.name || "Ukjent",
            content.original_text,
            content.source,
            center
          )
          return { content, result }
        })
      )

      for (const { content, result } of results) {
        if (!result) continue

        const isSoMe = content.source === "instagram" || content.source === "facebook"
        const threshold = isSoMe ? MIN_RELEVANCE_SCORE_SOME : MIN_RELEVANCE_SCORE
        if (result.relevance_score < threshold) {
          skipped++
          continue
        }

        await supabase.from("suggestions").insert({
          content_id: content.id,
          store_id: content.store_id,
          category: result.category,
          relevance_score: result.relevance_score,
          suggested_text: result.suggested_text,
          channels: Object.keys(result.suggested_text || {}),
        })
        analyzed++
      }
    }

    return Response.json({
      message:
        "Analyserte " +
        analyzed +
        " innholdselementer, filtrerte bort " +
        skipped +
        " irrelevante",
      analyzed,
      skipped,
    })
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 })
  }
}
