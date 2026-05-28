"use client"
import { useState, useEffect, useRef } from "react"
import { useAuth } from "@/components/AuthProvider"
import { supabase } from "@/lib/supabase"
import { useRouter, useParams } from "next/navigation"

const TONE_OPTIONS = [
  { value: "varm-og-inviterende", label: "Varm og inviterende", desc: "Vennlig, inkluderende og imøtekommende. Passer for familiesentre." },
  { value: "moderne-og-trendy", label: "Moderne og trendy", desc: "Friskt, ungdommelig og i tiden. Passer for motesentre." },
  { value: "lokal-og-naer", label: "Lokal og nær", desc: "Nedpå jansen, lokalt forankret. Passer for nabolagssentre." },
  { value: "eksklusiv-og-premium", label: "Eksklusiv og premium", desc: "Sofistikert og eksklusivt. Passer for premium-sentre." },
  { value: "praktisk-og-effektiv", label: "Praktisk og effektiv", desc: "Rett på sak, funksjonelt. Passer for hverdagssentre." },
  { value: "baerekraftig-og-bevisst", label: "Bærekraftig og bevisst", desc: "Miljøbevisst og ansvarlig. Passer for grønne sentre." }
]

const TENANT_CATEGORIES = [
  "Dagligvare", "Klær og mote", "Sko", "Sport og fritid", "Elektronikk",
  "Helse og velvære", "Restaurant og cafe", "Hjeminnredning", "Gavebutikk",
  "Bank og finans", "Frisør og skjønnhet", "Optiker", "Apotek", "Annet"
]

export default function CenterSettingsPage() {
  const { user, memberships, isAdmin, loading: authLoading } = useAuth()
  const router = useRouter()
  const params = useParams()
  const centerId = params.id

  const [center, setCenter] = useState(null)
  const [tenants, setTenants] = useState([])
  const [competitors, setCompetitors] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeSection, setActiveSection] = useState("tenants")

  const [customerGroup, setCustomerGroup] = useState("")
  const [positioning, setPositioning] = useState("")
  const [toneOfVoice, setToneOfVoice] = useState("")

  const [newTenantName, setNewTenantName] = useState("")
  const [newTenantCategory, setNewTenantCategory] = useState("")
  const [newTenantUrl, setNewTenantUrl] = useState("")

  const [newCompName, setNewCompName] = useState("")
  const [newCompDesc, setNewCompDesc] = useState("")
  const [fetchingDesc, setFetchingDesc] = useState(false)

  const [showScrapeModal, setShowScrapeModal] = useState(false)
  const [scrapeUrl, setScrapeUrl] = useState("")
  const [scrapeResults, setScrapeResults] = useState([])
  const [scrapeLoading, setScrapeLoading] = useState(false)
  const [scrapeError, setScrapeError] = useState("")
  const [selectedScrape, setSelectedScrape] = useState({})

  const [editingTenantUrl, setEditingTenantUrl] = useState(null) // { id, url }
  const hasLoadedData = useRef(false)

  const [showExcelModal, setShowExcelModal] = useState(false)
  const [excelText, setExcelText] = useState("")
  const [excelRows, setExcelRows] = useState([])
  const [selectedExcel, setSelectedExcel] = useState({})
  const [excelHasHeader, setExcelHasHeader] = useState(true)

  useEffect(() => {
    if (!authLoading && !user) router.push("/login")
  }, [!user, authLoading])

  useEffect(() => {
    if (centerId && user?.id) loadAll()
  }, [centerId, user?.id])

  async function loadAll() {
    if (!hasLoadedData.current) setLoading(true)
    const [centerRes, tenantsRes, competitorsRes] = await Promise.all([
      supabase.from("centers").select("*").eq("id", centerId).single(),
      supabase.from("center_tenants").select("*").eq("center_id", centerId).order("name"),
      supabase.from("center_competitors").select("*").eq("center_id", centerId).order("name")
    ])
    if (centerRes.data) {
      setCenter(centerRes.data)
      setCustomerGroup(centerRes.data.customer_group || "")
      setPositioning(centerRes.data.positioning || "")
      setToneOfVoice(centerRes.data.tone_of_voice || "")
    }
    setTenants(tenantsRes.data || [])
    setCompetitors(competitorsRes.data || [])
    setLoading(false)
    hasLoadedData.current = true
  }

  async function saveProfile() {
    setSaving(true)
    await supabase.from("centers").update({
      customer_group: customerGroup || null,
      positioning: positioning || null,
      tone_of_voice: toneOfVoice || null
    }).eq("id", centerId)
    setSaving(false)
  }

  async function addTenant() {
    if (!newTenantName.trim()) return
    setSaving(true)
    await supabase.from("center_tenants").insert({
      center_id: centerId,
      name: newTenantName.trim(),
      category: newTenantCategory || null,
      url: newTenantUrl.trim() || null
    })
    setNewTenantName("")
    setNewTenantCategory("")
    setNewTenantUrl("")
    const { data } = await supabase.from("center_tenants").select("*").eq("center_id", centerId).order("name")
    setTenants(data || [])
    setSaving(false)
  }

  async function removeTenant(id) {
    await supabase.from("center_tenants").delete().eq("id", id)
    setTenants(prev => prev.filter(t => t.id !== id))
  }

  async function updateTenantUrl(id, url) {
    const cleanUrl = url?.trim() || null
    await supabase.from("center_tenants").update({ url: cleanUrl }).eq("id", id)
    setTenants(prev => prev.map(t => t.id === id ? { ...t, url: cleanUrl } : t))
    setEditingTenantUrl(null)
  }

  async function addCompetitor() {
    if (!newCompName.trim()) return
    setSaving(true)
    await supabase.from("center_competitors").insert({
      center_id: centerId,
      name: newCompName.trim(),
      description: newCompDesc.trim() || null
    })
    setNewCompName("")
    setNewCompDesc("")
    const { data } = await supabase.from("center_competitors").select("*").eq("center_id", centerId).order("name")
    setCompetitors(data || [])
    setSaving(false)
  }

  async function removeCompetitor(id) {
    await supabase.from("center_competitors").delete().eq("id", id)
    setCompetitors(prev => prev.filter(c => c.id !== id))
  }

  async function updateCompetitorDesc(id, desc) {
    await supabase.from("center_competitors").update({ description: desc }).eq("id", id)
    setCompetitors(prev => prev.map(c => c.id === id ? { ...c, description: desc } : c))
  }

  async function handleScrape() {
    if (!scrapeUrl.trim()) return
    setScrapeLoading(true)
    setScrapeError("")
    setScrapeResults([])
    setSelectedScrape({})
    try {
      const res = await fetch("/api/scrape-tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: scrapeUrl.trim() })
      })
      const data = await res.json()
      if (data.success && data.tenants && data.tenants.length > 0) {
        setScrapeResults(data.tenants)
        const sel = {}
        data.tenants.forEach((t, i) => { sel[i] = true })
        setSelectedScrape(sel)
      } else {
        setScrapeError(data.error || "Ingen butikker funnet på denne siden. Prøv en annen URL.")
      }
    } catch (e) {
      setScrapeError("Kunne ikke hente data. Sjekk URL og prøv igjen.")
    }
    setScrapeLoading(false)
  }

  async function importScrapedTenants() {
    const toImport = scrapeResults.filter((_, i) => selectedScrape[i])
    if (toImport.length === 0) return
    setSaving(true)
    const existing = new Set(tenants.map(t => t.name.toLowerCase()))
    const newOnes = toImport.filter(t => !existing.has(t.name.toLowerCase()))
    if (newOnes.length > 0) {
      await supabase.from("center_tenants").insert(
        newOnes.map(t => ({ center_id: centerId, name: t.name, category: null, url: t.url || null }))
      )
    }
    const { data } = await supabase.from("center_tenants").select("*").eq("center_id", centerId).order("name")
    setTenants(data || [])
    setShowScrapeModal(false)
    setScrapeResults([])
    setScrapeUrl("")
    setSaving(false)
  }

  function parseExcelText(text) {
    if (!text.trim()) { setExcelRows([]); return }
    const lines = text.trim().split("\n").filter(l => l.trim())
    const startIdx = excelHasHeader ? 1 : 0
    const rows = []
    for (let i = startIdx; i < lines.length; i++) {
      const cols = lines[i].split("\t")
      const name = (cols[0] || "").trim()
      const category = (cols[1] || "").trim()
      const url = (cols[2] || "").trim()
      if (name) rows.push({ name, category, url })
    }
    setExcelRows(rows)
    const sel = {}
    rows.forEach((_, i) => { sel[i] = true })
    setSelectedExcel(sel)
  }

  async function importExcelTenants() {
    const toImport = excelRows.filter((_, i) => selectedExcel[i])
    if (toImport.length === 0) return
    setSaving(true)
    const existing = new Set(tenants.map(t => t.name.toLowerCase()))
    const newOnes = toImport.filter(t => !existing.has(t.name.toLowerCase()))
    if (newOnes.length > 0) {
      await supabase.from("center_tenants").insert(
        newOnes.map(t => ({
          center_id: centerId,
          name: t.name,
          category: TENANT_CATEGORIES.includes(t.category) ? t.category : null,
          url: t.url || null
        }))
      )
    }
    const { data } = await supabase.from("center_tenants").select("*").eq("center_id", centerId).order("name")
    setTenants(data || [])
    setShowExcelModal(false)
    setExcelText("")
    setExcelRows([])
    setSaving(false)
  }

  if (authLoading || loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FAE4FB" }}>
      <p style={{ color: "#360817", opacity: 0.5 }}>Laster senterinnstillinger...</p>
    </div>
  )

  if (!center) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FAE4FB" }}>
      <div style={{ textAlign: "center" }}>
        <p style={{ color: "#360817", opacity: 0.5 }}>Senter ikke funnet</p>
        <button onClick={() => router.push("/")} style={{ background: "#121226", color: "white", border: "none", padding: "0.6rem 1.5rem", borderRadius: "10px", cursor: "pointer", marginTop: "1rem" }}>Tilbake til dashboard</button>
      </div>
    </div>
  )

  const sections = [
    { key: "tenants", label: "Leietakere", icon: "🏢", count: tenants.length },
    { key: "competitors", label: "Konkurrenter", icon: "🎯", count: competitors.length },
    { key: "profile", label: "Posisjonering", icon: "📍" },
    { key: "tone", label: "Tone of Voice", icon: "🎤" }
  ]

  const modalOverlay = {
    position: "fixed", top: 0, left: 0, right: 0, bottom: 0,
    background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center",
    justifyContent: "center", zIndex: 1000, padding: "1rem"
  }
  const modalBox = {
    background: "white", borderRadius: "20px", padding: "2rem",
    maxWidth: "640px", width: "100%", maxHeight: "80vh", overflow: "auto",
    boxShadow: "0 20px 60px rgba(0,0,0,0.2)"
  }

  return (
    <div style={{ minHeight: "100vh", background: "#FAE4FB" }}>
      <header style={{ background: "#121226", color: "white", padding: "1rem 2rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.4rem", margin: 0, cursor: "pointer" }} onClick={() => router.push("/")}>SenterPuls</h1>
          <span style={{ opacity: 0.4 }}>|</span>
          <span style={{ fontSize: "0.85rem", opacity: 0.7 }}>{center.name}</span>
          <span style={{ fontSize: "0.75rem", opacity: 0.4 }}>Innstillinger</span>
          <button onClick={() => router.push("/")} style={{ background: "rgba(212,255,102,0.15)", border: "1px solid rgba(212,255,102,0.3)", color: "#D4FF66", padding: "0.35rem 0.9rem", borderRadius: "8px", cursor: "pointer", fontSize: "0.8rem", fontWeight: 500 }}>{"←"} Dashboard</button>
        </div>
        <span style={{ fontSize: "0.85rem", opacity: 0.7 }}>{center.city || ""}</span>
      </header>

      <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "2rem" }}>
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
          {sections.map(s => (
            <button key={s.key} onClick={() => setActiveSection(s.key)} style={{
              padding: "0.7rem 1.2rem", border: "none", borderRadius: "12px", cursor: "pointer",
              background: activeSection === s.key ? "#121226" : "white",
              color: activeSection === s.key ? "white" : "#360817",
              fontWeight: activeSection === s.key ? 600 : 400, fontSize: "0.9rem",
              boxShadow: activeSection === s.key ? "none" : "0 2px 8px rgba(0,0,0,0.04)",
              transition: "all 0.2s"
            }}>
              {s.icon} {s.label} {s.count !== undefined ? `(${s.count})` : ""}
            </button>
          ))}
        </div>

        {activeSection === "tenants" && (
          <div style={{ background: "white", borderRadius: "20px", padding: "2rem", boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "0.75rem" }}>
              <h2 style={{ fontFamily: "var(--font-heading)", color: "#360817", margin: 0 }}>Leietakere i {center.name}</h2>
              <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                <button onClick={() => setShowScrapeModal(true)} style={{
                  background: "#7c3aed", color: "white", border: "none", padding: "0.5rem 1rem",
                  borderRadius: "10px", cursor: "pointer", fontSize: "0.8rem", fontWeight: 500
                }}>{"🌐"} Hent fra hjemmeside</button>
                <button onClick={() => { setShowExcelModal(true); setExcelText(""); setExcelRows([]) }} style={{
                  background: "#059669", color: "white", border: "none", padding: "0.5rem 1rem",
                  borderRadius: "10px", cursor: "pointer", fontSize: "0.8rem", fontWeight: 500
                }}>{"📋"} Lim inn fra Excel</button>
              </div>
            </div>

            <div style={{ background: "#FAE4FB", borderRadius: "14px", padding: "1.5rem", marginBottom: "1.5rem" }}>
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ flex: 2, minWidth: "180px" }}>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "#360817", marginBottom: "0.3rem" }}>Navn</label>
                  <input value={newTenantName} onChange={e => setNewTenantName(e.target.value)} placeholder="F.eks. Kiwi"
                    style={{ width: "100%", padding: "0.65rem 1rem", border: "2px solid #E7E1E3", borderRadius: "10px", fontSize: "0.9rem", boxSizing: "border-box" }} />
                </div>
                <div style={{ flex: 1, minWidth: "140px" }}>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "#360817", marginBottom: "0.3rem" }}>Kategori</label>
                  <select value={newTenantCategory} onChange={e => setNewTenantCategory(e.target.value)}
                    style={{ width: "100%", padding: "0.65rem 1rem", border: "2px solid #E7E1E3", borderRadius: "10px", fontSize: "0.9rem", boxSizing: "border-box" }}>
                    <option value="">Velg...</option>
                    {TENANT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ flex: 2, minWidth: "180px" }}>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "#360817", marginBottom: "0.3rem" }}>URL</label>
                  <input value={newTenantUrl} onChange={e => setNewTenantUrl(e.target.value)} placeholder="https://..."
                    style={{ width: "100%", padding: "0.65rem 1rem", border: "2px solid #E7E1E3", borderRadius: "10px", fontSize: "0.9rem", boxSizing: "border-box" }} />
                </div>
                <button onClick={addTenant} disabled={saving || !newTenantName.trim()} style={{
                  background: "#121226", color: "white", border: "none", padding: "0.65rem 1.2rem",
                  borderRadius: "10px", fontWeight: 600, cursor: "pointer", opacity: !newTenantName.trim() ? 0.4 : 1
                }}>+ Legg til</button>
              </div>
            </div>

            {tenants.length === 0 ? (
              <p style={{ color: "#360817", opacity: 0.4, textAlign: "center", padding: "2rem" }}>Ingen leietakere lagt til ennå.</p>
            ) : (
              <div style={{ display: "grid", gap: "0.5rem" }}>
                {tenants.map(t => (
                  <div key={t.id} style={{ padding: "0.8rem 1.25rem", borderRadius: "12px", background: "#f8f7ff", border: "1px solid #E7E1E3" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "1rem", flex: 1 }}>
                        <strong style={{ color: "#360817" }}>{t.name}</strong>
                        {t.category && <span style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem", borderRadius: "6px", background: "#E7E1E3", color: "#360817" }}>{t.category}</span>}
                      </div>
                      <button onClick={() => removeTenant(t.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.8rem", color: "#991b1b", padding: "0.2rem 0.5rem" }}>Fjern</button>
                    </div>
                    <div style={{ marginTop: "0.4rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      {editingTenantUrl?.id === t.id ? (
                        <div style={{ display: "flex", gap: "0.4rem", flex: 1 }}>
                          <input
                            autoFocus
                            value={editingTenantUrl.url}
                            onChange={e => setEditingTenantUrl({ id: t.id, url: e.target.value })}
                            onKeyDown={e => { if (e.key === "Enter") updateTenantUrl(t.id, editingTenantUrl.url); if (e.key === "Escape") setEditingTenantUrl(null) }}
                            placeholder="https://www.butikken.no"
                            style={{ flex: 1, padding: "0.35rem 0.6rem", border: "1px solid #7c3aed", borderRadius: "6px", fontSize: "0.8rem", outline: "none" }}
                          />
                          <button onClick={() => updateTenantUrl(t.id, editingTenantUrl.url)} style={{ background: "#7c3aed", color: "white", border: "none", padding: "0.35rem 0.7rem", borderRadius: "6px", fontSize: "0.75rem", cursor: "pointer", fontWeight: 500 }}>Lagre</button>
                          <button onClick={() => setEditingTenantUrl(null)} style={{ background: "none", border: "1px solid #E7E1E3", padding: "0.35rem 0.7rem", borderRadius: "6px", fontSize: "0.75rem", cursor: "pointer", color: "#360817" }}>Avbryt</button>
                        </div>
                      ) : (
                        <>
                          {t.url ? (
                            <>
                              <a href={t.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.75rem", color: "#7c3aed", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "300px" }}>{"🔗"} {t.url}</a>
                              <button onClick={() => setEditingTenantUrl({ id: t.id, url: t.url })} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.7rem", color: "#7c3aed", padding: "0.1rem 0.3rem" }} title="Endre URL">{"✏️"}</button>
                            </>
                          ) : (
                            <button onClick={() => setEditingTenantUrl({ id: t.id, url: "" })} style={{ background: "none", border: "1px dashed #ccc", borderRadius: "6px", padding: "0.25rem 0.6rem", cursor: "pointer", fontSize: "0.7rem", color: "#999" }}>+ Legg til URL</button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeSection === "competitors" && (
          <div style={{ background: "white", borderRadius: "20px", padding: "2rem", boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
            <h2 style={{ fontFamily: "var(--font-heading)", color: "#360817", margin: "0 0 0.5rem" }}>Konkurrenter</h2>
            <p style={{ color: "#360817", opacity: 0.5, fontSize: "0.85rem", marginBottom: "1.5rem" }}>Legg til konkurrerende sentre. Beskrivelsen brukes til å gi smartere innholdsforslag.</p>
            <div style={{ background: "#FAE4FB", borderRadius: "14px", padding: "1.5rem", marginBottom: "1.5rem" }}>
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ flex: 1, minWidth: "200px" }}>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "#360817", marginBottom: "0.3rem" }}>Senternavn</label>
                  <input value={newCompName} onChange={e => setNewCompName(e.target.value)} placeholder="F.eks. Sandvika Storsenter"
                    style={{ width: "100%", padding: "0.65rem 1rem", border: "2px solid #E7E1E3", borderRadius: "10px", fontSize: "0.9rem", boxSizing: "border-box" }} />
                </div>
                <button onClick={addCompetitor} disabled={saving || !newCompName.trim()} style={{
                  background: "#121226", color: "white", border: "none", padding: "0.65rem 1.2rem",
                  borderRadius: "10px", fontWeight: 600, cursor: "pointer", opacity: !newCompName.trim() ? 0.4 : 1
                }}>+ Legg til</button>
              </div>
            </div>
            {competitors.length === 0 ? (
              <p style={{ color: "#360817", opacity: 0.4, textAlign: "center", padding: "2rem" }}>Ingen konkurrenter lagt til ennå.</p>
            ) : (
              <div style={{ display: "grid", gap: "0.75rem" }}>
                {competitors.map(c => (
                  <div key={c.id} style={{ padding: "1rem 1.25rem", borderRadius: "14px", background: "#f8f7ff", border: "1px solid #E7E1E3" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                      <strong style={{ color: "#360817" }}>{c.name}</strong>
                      <button onClick={() => removeCompetitor(c.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.8rem", color: "#991b1b" }}>Fjern</button>
                    </div>
                    <textarea value={c.description || ""} onChange={e => updateCompetitorDesc(c.id, e.target.value)}
                      placeholder="Kort beskrivelse av konkurrenten, f.eks. størrelse, profil, styrker..." rows={2}
                      style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #E7E1E3", borderRadius: "8px", fontSize: "0.85rem", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeSection === "profile" && (
          <div style={{ background: "white", borderRadius: "20px", padding: "2rem", boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
            <h2 style={{ fontFamily: "var(--font-heading)", color: "#360817", margin: "0 0 0.5rem" }}>Kundegruppe og posisjonering</h2>
            <p style={{ color: "#360817", opacity: 0.5, fontSize: "0.85rem", marginBottom: "1.5rem" }}>Denne informasjonen brukes til å skreddersy innholdsforslag for senteret ditt.</p>
            <div style={{ display: "grid", gap: "1.5rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.9rem", color: "#360817", marginBottom: "0.5rem", fontWeight: 500 }}>Kundegruppe / posisjon i markedet</label>
                <textarea value={customerGroup} onChange={e => setCustomerGroup(e.target.value)}
                  placeholder="Beskriv senterets hovedmålgruppe og posisjon i markedet."
                  rows={4} style={{ width: "100%", padding: "0.75rem 1rem", border: "2px solid #E7E1E3", borderRadius: "12px", fontSize: "0.9rem", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: "0.9rem", color: "#360817", marginBottom: "0.5rem", fontWeight: 500 }}>Senterets posisjonering / merkevare</label>
                <textarea value={positioning} onChange={e => setPositioning(e.target.value)}
                  placeholder="Beskriv senterets merkevare og hva som gjør det unikt."
                  rows={4} style={{ width: "100%", padding: "0.75rem 1rem", border: "2px solid #E7E1E3", borderRadius: "12px", fontSize: "0.9rem", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }} />
              </div>
              <button onClick={saveProfile} disabled={saving} style={{
                background: "#D4FF66", color: "#121226", border: "none", padding: "0.75rem 2rem",
                borderRadius: "12px", fontWeight: 600, cursor: "pointer", fontSize: "0.95rem",
                alignSelf: "flex-start", opacity: saving ? 0.6 : 1
              }}>{saving ? "Lagrer..." : "Lagre endringer"}</button>
            </div>
          </div>
        )}

        {activeSection === "tone" && (
          <div style={{ background: "white", borderRadius: "20px", padding: "2rem", boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
            <h2 style={{ fontFamily: "var(--font-heading)", color: "#360817", margin: "0 0 0.5rem" }}>Tone of Voice</h2>
            <p style={{ color: "#360817", opacity: 0.5, fontSize: "0.85rem", marginBottom: "1.5rem" }}>Velg kommunikasjonsstilen som passer best for senteret ditt. Dette påvirker innholdsforslag.</p>
            <div style={{ display: "grid", gap: "0.75rem" }}>
              {TONE_OPTIONS.map(opt => (
                <div key={opt.value} onClick={() => { setToneOfVoice(opt.value); saveProfile() }} style={{
                  padding: "1.25rem 1.5rem", borderRadius: "14px", cursor: "pointer",
                  border: toneOfVoice === opt.value ? "2px solid #121226" : "2px solid #E7E1E3",
                  background: toneOfVoice === opt.value ? "#f0eeff" : "white", transition: "all 0.2s"
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <strong style={{ color: "#360817", fontSize: "0.95rem" }}>{opt.label}</strong>
                    {toneOfVoice === opt.value && <span style={{ background: "#D4FF66", padding: "0.2rem 0.6rem", borderRadius: "6px", fontSize: "0.75rem", fontWeight: 600 }}>Valgt</span>}
                  </div>
                  <p style={{ color: "#360817", opacity: 0.6, fontSize: "0.85rem", margin: "0.3rem 0 0" }}>{opt.desc}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {showScrapeModal && (
        <div style={modalOverlay} onClick={e => { if (e.target === e.currentTarget) setShowScrapeModal(false) }}>
          <div style={modalBox}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ margin: 0, color: "#360817", fontFamily: "var(--font-heading)" }}>{"🌐"} Hent leietakere fra hjemmeside</h3>
              <button onClick={() => setShowScrapeModal(false)} style={{ background: "none", border: "none", fontSize: "1.2rem", cursor: "pointer", color: "#360817" }}>{"✕"}</button>
            </div>
            <div style={{ background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: "10px", padding: "0.75rem 1rem", marginBottom: "1rem", fontSize: "0.8rem", color: "#9A3412" }}>
              {"⚠️"} Listen som hentes er automatisk generert og kan inneholde feil. Kontroller og komplettér listen manuelt etter import.
            </div>
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
              <input value={scrapeUrl} onChange={e => setScrapeUrl(e.target.value)}
                placeholder="https://www.senteret.no/butikker" onKeyDown={e => e.key === "Enter" && handleScrape()}
                style={{ flex: 1, padding: "0.65rem 1rem", border: "2px solid #E7E1E3", borderRadius: "10px", fontSize: "0.9rem" }} />
              <button onClick={handleScrape} disabled={scrapeLoading || !scrapeUrl.trim()} style={{
                background: "#7c3aed", color: "white", border: "none", padding: "0.65rem 1.2rem",
                borderRadius: "10px", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap",
                opacity: scrapeLoading || !scrapeUrl.trim() ? 0.6 : 1
              }}>{scrapeLoading ? "Søker..." : "Hent butikker"}</button>
            </div>
            <p style={{ fontSize: "0.8rem", color: "#360817", opacity: 0.5, margin: "0 0 1rem" }}>
              Lim inn URL til senterets butikkoversikt, f.eks. /butikker eller /stores
            </p>
            {scrapeError && (
              <div style={{ background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: "10px", padding: "0.75rem 1rem", marginBottom: "1rem", fontSize: "0.85rem", color: "#991b1b" }}>
                {scrapeError}
              </div>
            )}
            {scrapeResults.length > 0 && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "0.85rem", color: "#360817", fontWeight: 500 }}>Fant {scrapeResults.length} butikker</span>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button onClick={() => { const sel = {}; scrapeResults.forEach((_, i) => { sel[i] = true }); setSelectedScrape(sel) }}
                      style={{ fontSize: "0.75rem", background: "none", border: "1px solid #E7E1E3", borderRadius: "6px", padding: "0.25rem 0.5rem", cursor: "pointer" }}>Velg alle</button>
                    <button onClick={() => setSelectedScrape({})}
                      style={{ fontSize: "0.75rem", background: "none", border: "1px solid #E7E1E3", borderRadius: "6px", padding: "0.25rem 0.5rem", cursor: "pointer" }}>Fjern alle</button>
                  </div>
                </div>
                <div style={{ maxHeight: "300px", overflow: "auto", border: "1px solid #E7E1E3", borderRadius: "12px", marginBottom: "1rem" }}>
                  {scrapeResults.map((t, i) => (
                    <label key={i} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.6rem 1rem", borderBottom: i < scrapeResults.length - 1 ? "1px solid #f0f0f0" : "none", cursor: "pointer", background: selectedScrape[i] ? "#f0eeff" : "white" }}>
                      <input type="checkbox" checked={!!selectedScrape[i]} onChange={e => setSelectedScrape(prev => ({ ...prev, [i]: e.target.checked }))} />
                      <div style={{ display: "flex", flexDirection: "column" }}>
                        <span style={{ fontSize: "0.9rem", color: "#360817" }}>{t.name}</span>
                        {t.url && <span style={{ fontSize: "0.7rem", color: "#999", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "300px" }}>{t.url}</span>}
                      </div>
                    </label>
                  ))}
                </div>
                <button onClick={importScrapedTenants} disabled={saving} style={{
                  background: "#121226", color: "white", border: "none", padding: "0.65rem 1.5rem",
                  borderRadius: "10px", fontWeight: 600, cursor: "pointer", width: "100%",
                  opacity: saving ? 0.6 : 1
                }}>{saving ? "Importerer..." : `Importer ${Object.values(selectedScrape).filter(Boolean).length} valgte`}</button>
              </>
            )}
          </div>
        </div>
      )}

      {showExcelModal && (
        <div style={modalOverlay} onClick={e => { if (e.target === e.currentTarget) setShowExcelModal(false) }}>
          <div style={modalBox}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ margin: 0, color: "#360817", fontFamily: "var(--font-heading)" }}>{"📋"} Lim inn fra Excel</h3>
              <button onClick={() => setShowExcelModal(false)} style={{ background: "none", border: "none", fontSize: "1.2rem", cursor: "pointer", color: "#360817" }}>{"✕"}</button>
            </div>
            <div style={{ background: "#F0FDF4", border: "1px solid #BBF7D0", borderRadius: "10px", padding: "0.75rem 1rem", marginBottom: "1rem", fontSize: "0.8rem", color: "#166534" }}>
              Kopier kolonner fra Excel og lim inn nedenfor. Forventet format: <strong>Navn</strong> (kol. 1), <strong>Kategori</strong> (kol. 2, valgfri), <strong>URL</strong> (kol. 3, valgfri).
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.75rem", fontSize: "0.85rem", color: "#360817", cursor: "pointer" }}>
              <input type="checkbox" checked={excelHasHeader} onChange={e => { setExcelHasHeader(e.target.checked); parseExcelText(excelText) }} />
              Første rad er overskrift (hopp over)
            </label>
            <textarea value={excelText} onChange={e => { setExcelText(e.target.value); parseExcelText(e.target.value) }}
              placeholder="Butikknavn&#9;Kategori&#9;URL&#10;Kiwi&#9;Dagligvare&#9;https://kiwi.no&#10;H&M&#9;Klær og mote&#9;"
              rows={6} style={{ width: "100%", padding: "0.75rem 1rem", border: "2px solid #E7E1E3", borderRadius: "12px", fontSize: "0.85rem", fontFamily: "monospace", resize: "vertical", boxSizing: "border-box", marginBottom: "1rem" }} />
            {excelRows.length > 0 && (
              <>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                  <span style={{ fontSize: "0.85rem", color: "#360817", fontWeight: 500 }}>Forhåndsvisning: {excelRows.length} rader</span>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button onClick={() => { const sel = {}; excelRows.forEach((_, i) => { sel[i] = true }); setSelectedExcel(sel) }}
                      style={{ fontSize: "0.75rem", background: "none", border: "1px solid #E7E1E3", borderRadius: "6px", padding: "0.25rem 0.5rem", cursor: "pointer" }}>Velg alle</button>
                    <button onClick={() => setSelectedExcel({})}
                      style={{ fontSize: "0.75rem", background: "none", border: "1px solid #E7E1E3", borderRadius: "6px", padding: "0.25rem 0.5rem", cursor: "pointer" }}>Fjern alle</button>
                  </div>
                </div>
                <div style={{ maxHeight: "250px", overflow: "auto", border: "1px solid #E7E1E3", borderRadius: "12px", marginBottom: "1rem" }}>
                  {excelRows.map((r, i) => (
                    <label key={i} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.5rem 1rem", borderBottom: i < excelRows.length - 1 ? "1px solid #f0f0f0" : "none", cursor: "pointer", background: selectedExcel[i] ? "#f0fdf4" : "white" }}>
                      <input type="checkbox" checked={!!selectedExcel[i]} onChange={e => setSelectedExcel(prev => ({ ...prev, [i]: e.target.checked }))} />
                      <span style={{ fontSize: "0.85rem", color: "#360817", flex: 1 }}>
                        <strong>{r.name}</strong>
                        {r.category && <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", color: "#059669" }}>{r.category}</span>}
                        {r.url && <span style={{ marginLeft: "0.5rem", fontSize: "0.7rem", color: "#7c3aed" }}>{r.url}</span>}
                      </span>
                    </label>
                  ))}
                </div>
                <button onClick={importExcelTenants} disabled={saving} style={{
                  background: "#121226", color: "white", border: "none", padding: "0.65rem 1.5rem",
                  borderRadius: "10px", fontWeight: 600, cursor: "pointer", width: "100%",
                  opacity: saving ? 0.6 : 1
                }}>{saving ? "Importerer..." : `Importer ${Object.values(selectedExcel).filter(Boolean).length} valgte`}</button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
