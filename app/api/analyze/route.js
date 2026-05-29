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

function buildSystemPrompt(centerName) {
  return `Du er en innholdsanalytiker for kjÃ¸pesenteret ${centerName}.

SENTERETS TONE: Ung og energisk. Varm og inkluderende, men med et moderne driv. Bruk emojis sparsomt (1-3 per post). Skriv kort og punchete.

MÃLGRUPPE: Familier med barn, bredt aldersspenn.

VIKTIG - KONTEKSTUALISERING:
- Alt innhold du genererer skal handle om ${centerName}. ALDRI nevn andre kjÃ¸pesentre.
- Hvis kildematerialet nevner et annet senter eller en annen lokasjon, ERSTATT det med ${centerName}.
- Hashtags skal bruke #${centerName.replace(/\s+/g, "")} (uten mellomrom).

VIKTIG - FILTRERINGSKRITERIER:
Du skal KUN gi hÃ¸y relevans-score (50+) til innhold som er:
- Aktive kampanjer eller salg (f.eks. "50% pÃ¥ utvalgte varer", "medlemsdager")
- Nye produktlanseringer eller kolleksjoner
- Konkrete events eller arrangementer med dato
- Sesongbaserte tilbud med tidsavgrensning
- BÃ¦rekraftsinitiativer eller konkrete nyheter

Du skal gi LAV relevans-score (under 30) til:
- Generelle butikkbeskrivelser ("Vi er en butikk som selger...")
- "Om oss"-tekst eller selskapsinformasjon
- Statisk nettside-innhold uten nyhetsverdi (Ã¥pningstider, adresser, kontaktinfo)
- Produktkataloger uten spesifikke tilbud
- Generelle slagord eller merkevare-beskrivelser
- Innhold som bare beskriver hva butikken er eller gjÃ¸r generelt

UNNTAK FOR SOSIALE MEDIER:
For innhold fra Instagram eller Facebook, vÃ¦r mer sjenerÃ¸s med scoring. Selv profilbeskrivelser og korte poster kan vÃ¦re nyttige for Ã¥ vise at butikken er aktiv. Gi minst 30 til SoMe-innhold med noe substans.

Din oppgave er Ã¥ analysere innhold fra en butikk og returnere et JSON-objekt med:
1. category: en av "kampanje", "produktlansering", "event", "sesong", "baerekraft", "nyhet"
2. relevance_score: 1-100 (hÃ¸yere = mer relevant for senteret Ã¥ dele)
3. suggested_text: et objekt med ferdige tekster for ulike kanaler:
   - instagram: kort, engasjerende med 1-2 emojis og 3-5 hashtags (inkluder #${centerName.replace(/\s+/g, "")})
   - facebook: litt lengre, informativ, inkluder oppfordring
   - website: saklig, 2-3 setninger for senterets nettside

HUSK: Alt innhold skal kontekstualiseres for ${centerName}. Aldri referer til andre sentre.

Vurder relevans basert pÃ¥: tidsnÃ¦rhet, engasjementspotensial, visuell appell, og om det driver trafikk til senteret.

Svar KUN med gyldig JSON, ingen annen tekst.`
}

async function analyzeContent(storeName, text, source, centerName) {
  try {
    const sourceNote =
      source === "instagram" || source === "facebook"
        ? "\n(Kilde: " + source + " - vurder som SoMe-innhold)"
        : ""

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: buildSystemPrompt(centerName),
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
      // No body â analyze all unanalyzed content
    }

    const { data: existing } = await supabase.from("suggestions").select("content_id")
    const analyzedIds = new Set((existing || []).map((s) => s.content_id))

    // Fetch content with store AND center info
    // When centerId is provided, filter at query level (before LIMIT) using inner join
    let contentQuery
    if (centerId) {
      contentQuery = supabase
        .from("content")
        .select("*, stores!inner(name, center_id)")
        .eq("stores.center_id", centerId)
        .order("scraped_at", { ascending: false })
        .limit(200)
    } else {
      contentQuery = supabase
        .from("content")
        .select("*, stores(name, center_id)")
        .order("scraped_at", { ascending: false })
        .limit(200)
    }

    const { data: allContent } = await contentQuery
    let toAnalyze = (allContent || []).filter((c) => !analyzedIds.has(c.id))

    if (!toAnalyze.length)
      return Response.json({ message: "Ingen nytt innhold Ã¥ analysere", analyzed: 0 })

    // Build a map of center_id -> center name for all relevant centers
    const centerIds = [...new Set(toAnalyze.map((c) => c.stores?.center_id).filter(Boolean))]
    const centerMap = {}

    if (centerIds.length > 0) {
      const { data: centers } = await supabase
        .from("centers")
        .select("id, name")
        .in("id", centerIds)
      for (const c of centers || []) {
        centerMap[c.id] = c.name
      }
    }

    let analyzed = 0
    let skipped = 0
    const BATCH_SIZE = 5

    for (let i = 0; i < toAnalyze.length; i += BATCH_SIZE) {
      const batch = toAnalyze.slice(i, i + BATCH_SIZE)
      const results = await Promise.all(
        batch.map(async (content) => {
          const centerName = centerMap[content.stores?.center_id] || "KjÃ¸pesenteret"
          const result = await analyzeContent(
            content.stores?.name || "Ukjent",
            content.original_text,
            content.source,
            centerName
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
