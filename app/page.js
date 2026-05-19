"use client"
import { useState, useEffect } from "react"
import { supabase } from "../lib/supabase"
import SuggestionCard from "../components/SuggestionCard"

const CATEGORIES = ["Alle", "kampanje", "produktlansering", "event", "sesong", "baerekraft", "nyhet"]
const CAT_LABELS = { kampanje: "Kampanje", produktlansering: "Produktlansering", event: "Event", sesong: "Sesong", baerekraft: "B\u00e6rekraft", nyhet: "Nyhet" }

export default function Home() {
  const [suggestions, setSuggestions] = useState([])
  const [stores, setStores] = useState([])
  const [filter, setFilter] = useState("Alle")
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ total: 0, active: 0, pending: 0, published: 0 })

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const [{ data: sug }, { data: st }] = await Promise.all([
      supabase.from("suggestions").select("*, stores(name, category), content(original_text, source, original_url, image_urls)").order("relevance_score", { ascending: false }),
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

  async function updateStatus(id, status) {
    await supabase.from("suggestions").update({ status, published_at: status === "published" ? new Date().toISOString() : null }).eq("id", id)
    setSuggestions(prev => prev.map(s => s.id === id ? { ...s, status } : s))
    setStats(prev => ({ ...prev, pending: prev.pending - 1, published: status === "published" ? prev.published + 1 : prev.published }))
  }

  const filtered = filter === "Alle" ? suggestions : suggestions.filter(s => s.category === filter)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Senter<span className="text-blue-600">Puls</span></h1>
            <p className="text-sm text-gray-500">V\u00e6rstetorvet \u00b7 {stores.length} leietakere</p>
          </div>
          <button onClick={() => fetch("/api/scrape", { method: "POST" }).then(() => setTimeout(loadData, 3000))} className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition">Oppdater n\u00e5</button>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-6">
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[{ label: "Totalt", value: stats.total, color: "text-blue-600" }, { label: "Aktive", value: stats.active, color: "text-green-600" }, { label: "Venter", value: stats.pending, color: "text-amber-600" }, { label: "Publisert", value: stats.published, color: "text-gray-900" }].map(s => (
            <div key={s.label} className="bg-white rounded-lg p-4 border border-gray-100"><p className="text-xs text-gray-500">{s.label}</p><p className={`text-2xl font-semibold ${s.color}`}>{s.value}</p></div>
          ))}
        </div>
        <div className="flex gap-2 mb-5 flex-wrap">
          {CATEGORIES.map(c => (<button key={c} onClick={() => setFilter(c)} className={`px-3 py-1.5 text-xs rounded-full border transition ${filter === c ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}>{c === "Alle" ? "Alle" : CAT_LABELS[c] || c}</button>))}
        </div>
        {loading ? <div className="text-center py-20 text-gray-400">Laster innhold...</div> : filtered.length === 0 ? <div className="text-center py-20"><p className="text-gray-400 mb-2">Ingen innholdsforslag enn\u00e5</p><p className="text-sm text-gray-400">Klikk \u00abOppdater n\u00e5\u00bb for \u00e5 starte scanning</p></div> : <div className="space-y-3">{filtered.map(s => <SuggestionCard key={s.id} suggestion={s} onUpdateStatus={updateStatus} />)}</div>}
      </main>
    </div>
  )
}