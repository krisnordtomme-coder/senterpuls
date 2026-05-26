"use client"
import { useState, useEffect } from "react"
import { supabase } from "../lib/supabase"
import SuggestionCard from "../components/SuggestionCard"
import PublishingPlan from "../components/PublishingPlan"

const CATEGORIES = ["Alle", "kampanje", "produktlansering", "event", "sesong", "baerekraft", "nyhet"]
const CAT_LABELS = { kampanje: "Kampanje", produktlansering: "Produktlansering", event: "Event", sesong: "Sesong", baerekraft: "Bærekraft", nyhet: "Nyhet" }
const SOURCES = ["Alle", "website", "instagram", "facebook"]
const SOURCE_LABELS = { website: "Nettside", instagram: "Instagram", facebook: "Facebook" }
const SOURCE_ICONS = { instagram: "\u{1F4F7}", facebook: "\u{1F4AC}", website: "\u{1F310}" }

export default function Home() {
  const [suggestions, setSuggestions] = useState([])
  const [stores, setStores] = useState([])
  const [filter, setFilter] = useState("Alle")
  const [sourceFilter, setSourceFilter] = useState("Alle")
  const [sortBy, setSortBy] = useState("relevans")
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanningSocial, setScanningSocial] = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const [stats, setStats] = useState({ total: 0, active: 0, pending: 0, published: 0 })

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: sug }, { data: st }] = await Promise.all([
      supabase.from("suggestions").select("*, stores(name, category), content(original_text, source, original_url, image_urls, posted_at)").order("relevance_score", { ascending: false }),
      supabase.from("stores").select("*").eq("active", true),
    ])
    setSuggestions(sug || [])
    setStores(st || [])
    setStats({
      total: sug?.length || 0,
      active: sug?.filter(s => s.status === "new" || s.status === "approved").length || 0,
      pending: sug?.filter(s => s.status === "new").length || 0,
      published: sug?.filter(s => s.status === "published").length || 0,
    })
    setLoading(false)
  }

  async function runScan() {
    setScanning(true)
    setScanResult(null)
    try {
      const res = await fetch("/api/scrape", { method: "POST" })
      const data = await res.json()
      setScanResult(data)
      await fetch("/api/analyze", { method: "POST" })
      setTimeout(loadData, 4000)
    } catch (e) { setScanResult({ error: e.message }) }
    setScanning(false)
  }

  async function runSocialScan() {
    setScanningSocial(true)
    setScanResult(null)
    try {
      const res = await fetch("/api/scrape-social", { method: "POST" })
      const data = await res.json()
      setScanResult(data)
      setTimeout(loadData, 4000)
    } catch (e) { setScanResult({ error: e.message }) }
    setScanningSocial(false)
  }

  async function updateStatus(id, status) {
    await supabase.from("suggestions").update({ status, published_at: status === "published" ? new Date().toISOString() : null }).eq("id", id)
    setSuggestions(prev => prev.map(s => (s.id === id ? { ...s, status } : s)))
    setStats(prev => ({ ...prev, pending: prev.pending - 1, published: status === "published" ? prev.published + 1 : prev.published }))
  }

  const filtered = suggestions
    .filter(s => filter === "Alle" || s.category === filter)
    .filter(s => sourceFilter === "Alle" || s.content?.source === sourceFilter)
    .sort((a, b) => {
      if (sortBy === "dato") {
        const dateA = a.content?.posted_at || a.created_at || ""
        const dateB = b.content?.posted_at || b.created_at || ""
        return dateB.localeCompare(dateA)
      }
      return (b.relevance_score || 0) - (a.relevance_score || 0)
    })

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Senter<span className="text-blue-600">Puls</span></h1>
            <p className="text-sm text-gray-500">Værstetorvet · {stores.length} leietakere</p>
          </div>
          <div className="flex gap-2">
            <button onClick={runSocialScan} disabled={scanningSocial} className={`px-4 py-2 text-sm rounded-lg transition ${scanningSocial ? "bg-pink-400 text-white cursor-wait" : "bg-pink-50 text-pink-700 border border-pink-200 hover:bg-pink-100"}`}>
              {scanningSocial ? "Scanner SoMe..." : "\u{1F4F1} SoMe-scan"}
            </button>
            <button onClick={runScan} disabled={scanning} className={`px-4 py-2 text-white text-sm rounded-lg transition ${scanning ? "bg-blue-400 cursor-wait" : "bg-blue-600 hover:bg-blue-700"}`}>
              {scanning ? "Scanner..." : "Oppdater nå"}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-6">
        {scanResult && (
          <div className={`mb-4 p-3 rounded-lg text-sm ${scanResult.error ? "bg-red-50 text-red-700" : scanResult.newContent > 0 ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"}`}>
            {scanResult.error ? `Feil: ${scanResult.error}` : scanResult.breakdown ? `SoMe-scan: ${scanResult.stores} butikker — ${scanResult.newContent} nye (${scanResult.breakdown.instagram || 0} IG, ${scanResult.breakdown.facebook || 0} FB)` : `Scannet ${scanResult.stores} butikker — fant ${scanResult.newContent} nye innholdselementer`}
          </div>
        )}

        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: "Totalt", value: stats.total, color: "text-blue-600" },
            { label: "Aktive", value: stats.active, color: "text-green-600" },
            { label: "Venter", value: stats.pending, color: "text-amber-600" },
            { label: "Publisert", value: stats.published, color: "text-gray-900" }
          ].map(s => (
            <div key={s.label} className="bg-white rounded-lg p-4 border border-gray-100">
              <p className="text-xs text-gray-500">{s.label}</p>
              <p className={`text-2xl font-semibold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>

{!loading && suggestions.length > 0 && (
            <PublishingPlan suggestions={suggestions} />
          )}

        <div className="flex gap-2 mb-3 flex-wrap">
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setFilter(c)} className={`px-3 py-1.5 text-xs rounded-full border transition ${filter === c ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
              {c === "Alle" ? "Alle" : CAT_LABELS[c] || c}
            </button>
          ))}
        </div>

        <div className="flex gap-2 mb-5 flex-wrap items-center">
          {SOURCES.map(s => (
            <button key={s} onClick={() => setSourceFilter(s)} className={`px-3 py-1.5 text-xs rounded-full border transition ${sourceFilter === s ? "bg-purple-50 text-purple-700 border-purple-200" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>
              {s === "Alle" ? "Alle kilder" : `${SOURCE_ICONS[s] || ""} ${SOURCE_LABELS[s] || s}`}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-xs text-gray-400">Sorter:</span>
            <button onClick={() => setSortBy("relevans")} className={`px-2.5 py-1 text-xs rounded-md transition ${sortBy === "relevans" ? "bg-gray-800 text-white" : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"}`}>
              Relevans
            </button>
            <button onClick={() => setSortBy("dato")} className={`px-2.5 py-1 text-xs rounded-md transition ${sortBy === "dato" ? "bg-gray-800 text-white" : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"}`}>
              Nyeste
            </button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-20 text-gray-400">Laster innhold...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-gray-400 mb-2">Ingen innholdsforslag ennå</p>
            <p className="text-sm text-gray-400">Klikk «Oppdater nå» for å starte scanning</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(s => <SuggestionCard key={s.id} suggestion={s} onUpdateStatus={updateStatus} />)}
          </div>
        )}
      </main>
    </div>
  )
}
