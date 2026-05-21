import { createClient } from "@supabase/supabase-js"
import Anthropic from "@anthropic-ai/sdk"

export const maxDuration = 300

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MIN_RELEVANCE_SCORE = 50

const SYSTEM_PROMPT = `Du er en innholdsanalytiker for kjøpesenteret Værstetorvet i Fredrikstad.

SENTERETS TONE: Ung og energisk. Varm og inkluderende, men med et moderne driv. Bruk emojis sparsomt (1-3 per post). Skriv kort og punchete.

MÅLGRUPPE: Familier med barn, bredt aldersspenn.

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

Din oppgave er å analysere innhold fra en butikk og returnere et JSON-objekt med:

1. category: en av "kampanje", "produktlansering", "event", "sesong", "baerekraft", "nyhet"
2. relevance_score: 1-100 (høyere = mer relevant for senteret å dele)
3. suggested_text: et objekt med ferdige tekster for ulike kanaler:
  - instagram: kort, engasjerende med 1-2 emojis og 3-5 hashtags (inkluder #Værstetorvet)
    - facebook: litt lengre, informativ, inkluder oppfordring
      - website: saklig, 2-3 setninger for senterets nettside

      Vurder relevans basert på: tidsnærhet, engasjementspotensial, visuell appell, og om det driver trafikk til senteret.

      Svar KUN med gyldig JSON, ingen annen tekst.`

async function analyzeContent(storeName, text) {
    try {
          const response = await anthropic.messages.create({
                  model: "claude-sonnet-4-6",
                  max_tokens: 1024,
                  system: SYSTEM_PROMPT,
                  messages: [{ role: "user", content: "Butikk: " + storeName + "\nInnhold: " + text }],
          })
          let aiText = response.content[0].text
          aiText = aiText.replace(/^```json\s*\n?/, '').replace(/\n?```\s*$/, '')
          return JSON.parse(aiText)
    } catch (e) {
          console.error("AI analysis failed:", e.message)
          return null
    }
}

export async function POST() {
    try {
          const { data: existing } = await supabase.from("suggestions").select("content_id")
          const analyzedIds = new Set((existing || []).map(s => s.content_id))
          const { data: allContent } = await supabase.from("content").select("*, stores(name)").order("scraped_at", { ascending: false }).limit(200)
          const toAnalyze = (allContent || []).filter(c => !analyzedIds.has(c.id))
          if (!toAnalyze.length) return Response.json({ message: "Ingen nytt innhold å analysere", analyzed: 0 })

      let analyzed = 0
          let skipped = 0
          const BATCH_SIZE = 5

      for (let i = 0; i < toAnalyze.length; i += BATCH_SIZE) {
              const batch = toAnalyze.slice(i, i + BATCH_SIZE)
              const results = await Promise.all(
                        batch.map(async (content) => {
                                    const result = await analyzeContent(content.stores?.name || "Ukjent", content.original_text)
                                    return { content, result }
                        })
                      )
              for (const { content, result } of results) {
                        if (!result) continue
                        if (result.relevance_score < MIN_RELEVANCE_SCORE) {
                                    skipped++
                                    continue
                        }
                        await supabase.from("suggestions").insert({
                                    content_id: content.id, store_id: content.store_id, category: result.category,
                                    relevance_score: result.relevance_score, suggested_text: result.suggested_text,
                                    channels: Object.keys(result.suggested_text || {}),
                        })
                        analyzed++
              }
      }
          return Response.json({ message: "Analyserte " + analyzed + " innholdselementer, filtrerte bort " + skipped + " irrelevante", analyzed, skipped })
    } catch (e) {
          return Response.json({ error: e.message }, { status: 500 })
    }
}
