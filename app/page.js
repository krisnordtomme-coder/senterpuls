"use client"
import { useState, useEffect } from "react"
import { supabase } from "../lib/supabase"
import { useAuth } from "@/components/AuthProvider"
import { useRouter } from "next/navigation"
import SuggestionCard from "../components/SuggestionCard"
import PublishingPlan from "../components/PublishingPlan"

const CATEGORIES = ["Alle", "kampanje", "produktlansering", "event", "sesong", "baerekraft", "nyhet"]
const CAT_LABELS = {
  kampanje: "Kampanje", produktlansering: "Produktlansering", event: "Event",
  sesong: "Sesong", baerekraft: "Bærekraft", nyhet: "Nyhet"
}
const SOURCES = ["Alle", "website", "instagram", "facebook"]
const SOURCE_LABELS = { website: "Nettside", instagram: "Instagram", facebook: "Facebook" }
const SOURCE_ICONS = { instagram: "📷", facebook: "💬", website: "🌐" }

export default function Home() {
  const { user, profile, currentOrg, memberships, isOwner, isAdmin, signOut, loading: authLoading } = useAuth()
  const router = useRouter()
  const [suggestions, setSuggestions] = useState([])
  const [stores, setStores] = useState([])
  const [centers, setCenters] = useState([])
  const [selectedCenter, setSelectedCenter] = useState(null)
  const [filter, setFilter] = useState("Alle")
  const [sourceFilter, setSourceFilter] = useState("Alle")
  const [sortBy, setSortBy] = useState("relevans")
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)
  const [scanningSocial, setScanningSocial] = useState(false)
  const [scanResult, setScanResult] = useState(null)
  const [stats, setStats] = useState({ total: 0, active: 0, pending: 0, published: 0 })

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login")
    }
  }, [authLoading, user, router])

  useEffect(() => {
    if (currentOrg) {
      loadCenters()
    }
  }, [currentOrg])

  useEffect(() => {
    if (selectedCenter || currentOrg) {
      loadData()
    }
  }, [selectedCenter, currentOrg])

  async function loadCenters() {
    const { data } = await supabase
      .from("centers")
      .select("*")
      .eq("organization_id", currentOrg.id)
      .eq("active", true)
      .order("name")
    setCenters(data || [])
    if (data && data.length > 0 && !selectedCenter) {
      setSelectedCenter(data[0])
    }
  }

  async function loadData() {
    let sugQuery = supabase
      .from("suggestions")
      .select("*, stores(name, category), content(original_text, source, original_url, image_urls, posted_at)")
      .order("relevance_score", { ascending: false })

    let storeQuery = supabase.from("stores").select("*").eq("active", true)

    if (selectedCenter) {
      storeQuery = storeQuery.eq("center_id", selectedCenter.id)
    } else if (currentOrg) {
      storeQuery = storeQuery.eq("organization_id", currentOrg.id)
    }

    const [{ data: sug }, { data: st }] = await Promise.all([sugQuery, storeQuery])

    const storeIds = new Set((st || []).map(s => s.id))
    const filteredSug = selectedCenter
      ? (sug || []).filter(s => storeIds.has(s.store_id))
      : (sug || [])

    setSuggestions(filteredSug)
    setStores(st || [])
    setStats({
      total: filteredSug.length,
      active: filteredSug.filter(s => s.status === "new" || s.status === "approved").length,
      pending: filteredSug.filter(s => s.status === "new").length,
      published: filteredSug.filter(s => s.status === "published").length,
    })
    setLoading(false)
  }

  async function runScan() {
    setScanning(true); setScanResult(null)
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
    setScanningSocial(true); setScanResult(null)
    try {
      const res = await fetch("/api/scrape-social", { method: "POST" })
      const data = await res.json()
      setScanResult(data)
      setTimeout(loadData, 4000)
    } catch (e) { setScanResult({ error: e.message }) }
    setScanningSocial(false)
  }

  async function updateStatus(id, status) {
    await supabase.from("suggestions").update({
      status, published_at: status === "published" ? new Date().toISOString() : null
    }).eq("id", id)
    setSuggestions(prev => prev.map(s => (s.id === id ? { ...s, status } : s)))
    setStats(prev => ({
      ...prev,
      pending: prev.pending - 1,
      published: status === "published" ? prev.published + 1 : prev.published
    }))
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

  const STAT_ITEMS = [
    { label: "Totalt", value: stats.total, icon: "📊" },
    { label: "Aktive", value: stats.active, icon: "✨" },
    { label: "Venter", value: stats.pending, icon: "⏳" },
    { label: "Publisert", value: stats.published, icon: "✓" }
  ]

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#FDF5FD" }}>
        <p style={{ color: "#360817", opacity: 0.4 }}>Laster...</p>
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen" style={{ background: "#FDF5FD" }}>
      <header className="border-b px-6 py-5" style={{ background: "#FAE4FB", borderColor: "#E7E1E3" }}>
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl tracking-tight" style={{
              fontFamily: "var(--font-heading, 'DM Serif Display'), Georgia, serif",
              color: "#360817"
            }}>
              {"Senter"}<span style={{ color: "#9333ea" }}>{"Puls"}</span>
            </h1>
            <div className="flex items-center gap-2 mt-0.5">
              {centers.length > 1 ? (
                <select
                  value={selectedCenter?.id || ""}
                  onChange={(e) => {
                    const c = centers.find(c => c.id === e.target.value)
                    setSelectedCenter(c)
                    setLoading(true)
                  }}
                  className="text-sm bg-transparent border-none outline-none cursor-pointer"
                  style={{ color: "#360817", opacity: 0.6 }}
                >
                  {centers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              ) : (
                <p className="text-sm" style={{ color: "#360817", opacity: 0.6 }}>
                  {selectedCenter?.name || currentOrg?.name || "Laster..."}
                </p>
              )}
              <span className="text-sm" style={{ color: "#360817", opacity: 0.4 }}>
                · {stores.length} leietakere
              </span>
            </div>
          </div>
          <div className="flex gap-3 items-center">
            {(isOwner || isAdmin) && (
              <button
                onClick={() => router.push("/admin")}
                className="px-4 py-2.5 text-sm font-medium transition-all duration-200"
                style={{
                  borderRadius: "6px",
                  background: "white",
                  color: "#360817",
                  border: "1px solid #E7E1E3"
                }}
              >
                ⚙️ Admin
              </button>
            )}
            <button onClick={runSocialScan} disabled={scanningSocial}
              className="px-5 py-2.5 text-sm font-medium transition-all duration-200"
              style={{
                borderRadius: "6px",
                background: scanningSocial ? "#D6C7FF" : "white",
                color: "#360817",
                border: "1px solid #E7E1E3",
                cursor: scanningSocial ? "wait" : "pointer",
                opacity: scanningSocial ? 0.7 : 1
              }}>
              {scanningSocial ? "Scanner SoMe..." : "📱 SoMe-scan"}
            </button>
            <button onClick={runScan} disabled={scanning}
              className="px-5 py-2.5 text-sm font-medium transition-all duration-200"
              style={{
                borderRadius: "6px",
                background: scanning ? "#5a1a2e" : "#360817",
                color: "#FAE4FB",
                cursor: scanning ? "wait" : "pointer"
              }}>
              {scanning ? "Scanner..." : "Oppdater nå"}
            </button>
            <div className="ml-2 flex items-center gap-2">
              <span className="text-xs" style={{ color: "#360817", opacity: 0.4 }}>
                {profile?.full_name || user.email}
              </span>
              <button
                onClick={signOut}
                className="text-xs px-2 py-1"
                style={{ color: "#360817", opacity: 0.4, cursor: "pointer" }}
              >
                Logg ut
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        {scanResult && (
          <div className="mb-6 p-4 text-sm" style={{
            borderRadius: "14px",
            background: scanResult.error ? "#FEE2E2" : scanResult.newContent > 0 ? "#FAFFED" : "#FEF3C7",
            color: scanResult.error ? "#991B1B" : scanResult.newContent > 0 ? "#360817" : "#92400E",
            border: scanResult.error ? "1px solid #FECACA" : scanResult.newContent > 0 ? "1px solid #D4FF66" : "1px solid #FDE68A",
          }}>
            {scanResult.error
              ? `Feil: ${scanResult.error}`
              : scanResult.breakdown
                ? `SoMe-scan: ${scanResult.stores} butikker — ${scanResult.newContent} nye (${scanResult.breakdown.instagram || 0} IG, ${scanResult.breakdown.facebook || 0} FB)`
                : `Scannet ${scanResult.stores} butikker — fant ${scanResult.newContent} nye innholdselementer`}
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {STAT_ITEMS.map(s => (
            <div key={s.label} className="p-5 transition-all duration-200 hover:shadow-md"
              style={{ background: "white", borderRadius: "14px", border: "1px solid #E7E1E3" }}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium uppercase tracking-wider"
                  style={{ color: "#360817", opacity: 0.5 }}>{s.label}</p>
                <span className="text-lg">{s.icon}</span>
              </div>
              <p className="text-3xl font-light" style={{
                fontFamily: "var(--font-heading, 'DM Serif Display'), Georgia, serif",
                color: "#360817"
              }}>{s.value}</p>
            </div>
          ))}
        </div>

        {!loading && suggestions.length > 0 && <PublishingPlan suggestions={suggestions} />}

        <div className="flex gap-2 mb-3 flex-wrap">
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setFilter(c)}
              className="px-4 py-2 text-xs font-medium transition-all duration-200"
              style={{
                borderRadius: "20px",
                background: filter === c ? "#360817" : "white",
                color: filter === c ? "#FAE4FB" : "#360817",
                border: filter === c ? "1px solid #360817" : "1px solid #E7E1E3"
              }}>
              {c === "Alle" ? "Alle" : CAT_LABELS[c] || c}
            </button>
          ))}
        </div>

        <div className="flex gap-2 mb-6 flex-wrap items-center">
          {SOURCES.map(s => (
            <button key={s} onClick={() => setSourceFilter(s)}
              className="px-4 py-2 text-xs font-medium transition-all duration-200"
              style={{
                borderRadius: "20px",
                background: sourceFilter === s ? "#D6C7FF" : "white",
                color: "#360817",
                border: sourceFilter === s ? "1px solid #D6C7FF" : "1px solid #E7E1E3"
              }}>
              {s === "Alle" ? "Alle kilder" : `${SOURCE_ICONS[s] || ""} ${SOURCE_LABELS[s] || s}`}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs" style={{ color: "#360817", opacity: 0.4 }}>Sorter:</span>
            <button onClick={() => setSortBy("relevans")}
              className="px-3 py-1.5 text-xs font-medium transition-all duration-200"
              style={{
                borderRadius: "6px",
                background: sortBy === "relevans" ? "#360817" : "white",
                color: sortBy === "relevans" ? "#FAE4FB" : "#360817",
                border: sortBy === "relevans" ? "none" : "1px solid #E7E1E3"
              }}>Relevans</button>
            <button onClick={() => setSortBy("dato")}
              className="px-3 py-1.5 text-xs font-medium transition-all duration-200"
              style={{
                borderRadius: "6px",
                background: sortBy === "dato" ? "#360817" : "white",
                color: sortBy === "dato" ? "#FAE4FB" : "#360817",
                border: sortBy === "dato" ? "none" : "1px solid #E7E1E3"
              }}>Nyeste</button>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-24" style={{ color: "#360817", opacity: 0.4 }}>Laster innhold...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-24">
            <p className="mb-2" style={{ color: "#360817", opacity: 0.4 }}>Ingen innholdsforslag ennå</p>
            <p className="text-sm" style={{ color: "#360817", opacity: 0.3 }}>
              {"Klikk «Oppdater nå» for å starte scanning"}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map(s => <SuggestionCard key={s.id} suggestion={s} onUpdateStatus={updateStatus} />)}
          </div>
        )}
      </main>
    </div>
  )
}
