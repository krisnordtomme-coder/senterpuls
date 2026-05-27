"use client"
import { useState, useEffect } from "react"
import { useAuth } from "@/components/AuthProvider"
import { supabase } from "@/lib/supabase"
import { useRouter, useParams } from "next/navigation"

const TONE_OPTIONS = [
  { value: "varm-og-inviterende", label: "Varm og inviterende", desc: "Vennlig, inkluderende og imotekommende. Passer for familiesentre." },
  { value: "moderne-og-trendy", label: "Moderne og trendy", desc: "Friskt, ungdommelig og i tiden. Passer for motesentre." },
  { value: "lokal-og-naer", label: "Lokal og naer", desc: "Nedpaa jansen, lokalt forankret. Passer for nabolagssentre." },
  { value: "eksklusiv-og-premium", label: "Eksklusiv og premium", desc: "Sofistikert og eksklusivt. Passer for premium-sentre." },
  { value: "praktisk-og-effektiv", label: "Praktisk og effektiv", desc: "Rett paa sak, funksjonelt. Passer for hverdagssentre." },
  { value: "baerekraftig-og-bevisst", label: "Baerekraftig og bevisst", desc: "Miljobevisst og ansvarlig. Passer for groenne sentre." }
]

const TENANT_CATEGORIES = [
  "Dagligvare", "Klaer og mote", "Sko", "Sport og fritid", "Elektronikk",
  "Helse og velveare", "Restaurant og cafe", "Hjeminnredning", "Gavebutikk",
  "Bank og finans", "Frisoor og skjonnhet", "Optiker", "Apotek", "Annet"
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

  // Center profile fields
  const [customerGroup, setCustomerGroup] = useState("")
  const [positioning, setPositioning] = useState("")
  const [toneOfVoice, setToneOfVoice] = useState("")

  // New tenant form
  const [newTenantName, setNewTenantName] = useState("")
  const [newTenantCategory, setNewTenantCategory] = useState("")
  const [newTenantUrl, setNewTenantUrl] = useState("")

  // New competitor form
  const [newCompName, setNewCompName] = useState("")
  const [newCompDesc, setNewCompDesc] = useState("")
  const [fetchingDesc, setFetchingDesc] = useState(false)

  useEffect(() => {
    if (!authLoading && !user) router.push("/login")
  }, [user, authLoading])

  useEffect(() => {
    if (centerId && user) loadAll()
  }, [centerId, user])

  async function loadAll() {
    setLoading(true)
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
    { key: "tenants", label: "Leietakere", icon: "\ud83c\udfe2", count: tenants.length },
    { key: "competitors", label: "Konkurrenter", icon: "\ud83c\udfaf" , count: competitors.length },
    { key: "profile", label: "Posisjonering", icon: "\ud83d\udccd" },
    { key: "tone", label: "Tone of Voice", icon: "\ud83c\udfa4" }
  ]

  return (
    <div style={{ minHeight: "100vh", background: "#FAE4FB" }}>
      <header style={{ background: "#121226", color: "white", padding: "1rem 2rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.4rem", margin: 0, cursor: "pointer" }} onClick={() => router.push("/")}>SenterPuls</h1>
          <span style={{ opacity: 0.4 }}>|</span>
          <span style={{ fontSize: "0.85rem", opacity: 0.7 }}>{center.name}</span>
          <span style={{ fontSize: "0.75rem", opacity: 0.4 }}>Innstillinger</span>
          <button onClick={() => router.push("/")} style={{ background: "rgba(212,255,102,0.15)", border: "1px solid rgba(212,255,102,0.3)", color: "#D4FF66", padding: "0.35rem 0.9rem", borderRadius: "8px", cursor: "pointer", fontSize: "0.8rem", fontWeight: 500 }}>&larr; Dashboard</button>
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
            <h2 style={{ fontFamily: "var(--font-heading)", color: "#360817", margin: "0 0 1.5rem" }}>Leietakere i {center.name}</h2>

            <div style={{ background: "#FAE4FB", borderRadius: "14px", padding: "1.5rem", marginBottom: "1.5rem" }}>
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ flex: 2, minWidth: "180px" }}>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "#360817", marginBottom: "0.3rem" }}>Navn</label>
                  <input value={newTenantName} onChange={e => setNewTenantName(e.target.value)} placeholder="F.eks. Kiwi" style={{ width: "100%", padding: "0.65rem 1rem", border: "2px solid #E7E1E3", borderRadius: "10px", fontSize: "0.9rem", boxSizing: "border-box" }} />
                </div>
                <div style={{ flex: 1, minWidth: "140px" }}>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "#360817", marginBottom: "0.3rem" }}>Kategori</label>
                  <select value={newTenantCategory} onChange={e => setNewTenantCategory(e.target.value)} style={{ width: "100%", padding: "0.65rem 1rem", border: "2px solid #E7E1E3", borderRadius: "10px", fontSize: "0.9rem", boxSizing: "border-box" }}>
                    <option value="">Velg...</option>
                    {TENANT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ flex: 2, minWidth: "180px" }}>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "#360817", marginBottom: "0.3rem" }}>URL</label>
                  <input value={newTenantUrl} onChange={e => setNewTenantUrl(e.target.value)} placeholder="https://..." style={{ width: "100%", padding: "0.65rem 1rem", border: "2px solid #E7E1E3", borderRadius: "10px", fontSize: "0.9rem", boxSizing: "border-box" }} />
                </div>
                <button onClick={addTenant} disabled={saving || !newTenantName.trim()} style={{ background: "#121226", color: "white", border: "none", padding: "0.65rem 1.2rem", borderRadius: "10px", fontWeight: 600, cursor: "pointer", opacity: !newTenantName.trim() ? 0.4 : 1 }}>+ Legg til</button>
              </div>
            </div>

            {tenants.length === 0 ? (
              <p style={{ color: "#360817", opacity: 0.4, textAlign: "center", padding: "2rem" }}>Ingen leietakere lagt til ennaa.</p>
            ) : (
              <div style={{ display: "grid", gap: "0.5rem" }}>
                {tenants.map(t => (
                  <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.8rem 1.25rem", borderRadius: "12px", background: "#f8f7ff", border: "1px solid #E7E1E3" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "1rem", flex: 1 }}>
                      <strong style={{ color: "#360817" }}>{t.name}</strong>
                      {t.category && <span style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem", borderRadius: "6px", background: "#E7E1E3", color: "#360817" }}>{t.category}</span>}
                      {t.url && <a href={t.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: "0.75rem", color: "#7c3aed" }}>\ud83d\udd17 Nettside</a>}
                    </div>
                    <button onClick={() => removeTenant(t.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.8rem", color: "#991b1b", padding: "0.2rem 0.5rem" }}>Fjern</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeSection === "competitors" && (
          <div style={{ background: "white", borderRadius: "20px", padding: "2rem", boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
            <h2 style={{ fontFamily: "var(--font-heading)", color: "#360817", margin: "0 0 0.5rem" }}>Konkurrenter</h2>
            <p style={{ color: "#360817", opacity: 0.5, fontSize: "0.85rem", marginBottom: "1.5rem" }}>Legg til konkurrerende sentre. Beskrivelsen brukes til aa gi smartere innholdsforslag.</p>

            <div style={{ background: "#FAE4FB", borderRadius: "14px", padding: "1.5rem", marginBottom: "1.5rem" }}>
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ flex: 1, minWidth: "200px" }}>
                  <label style={{ display: "block", fontSize: "0.8rem", color: "#360817", marginBottom: "0.3rem" }}>Senternavn</label>
                  <input value={newCompName} onChange={e => setNewCompName(e.target.value)} placeholder="F.eks. Sandvika Storsenter" style={{ width: "100%", padding: "0.65rem 1rem", border: "2px solid #E7E1E3", borderRadius: "10px", fontSize: "0.9rem", boxSizing: "border-box" }} />
                </div>
                <button onClick={addCompetitor} disabled={saving || !newCompName.trim()} style={{ background: "#121226", color: "white", border: "none", padding: "0.65rem 1.2rem", borderRadius: "10px", fontWeight: 600, cursor: "pointer", opacity: !newCompName.trim() ? 0.4 : 1 }}>+ Legg til</button>
              </div>
            </div>

            {competitors.length === 0 ? (
              <p style={{ color: "#360817", opacity: 0.4, textAlign: "center", padding: "2rem" }}>Ingen konkurrenter lagt til ennaa.</p>
            ) : (
              <div style={{ display: "grid", gap: "0.75rem" }}>
                {competitors.map(c => (
                  <div key={c.id} style={{ padding: "1rem 1.25rem", borderRadius: "14px", background: "#f8f7ff", border: "1px solid #E7E1E3" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                      <strong style={{ color: "#360817" }}>{c.name}</strong>
                      <button onClick={() => removeCompetitor(c.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.8rem", color: "#991b1b" }}>Fjern</button>
                    </div>
                    <textarea
                      value={c.description || ""}
                      onChange={e => updateCompetitorDesc(c.id, e.target.value)}
                      placeholder="Kort beskrivelse av konkurrenten, f.eks. storrelse, profil, styrker..."
                      rows={2}
                      style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid #E7E1E3", borderRadius: "8px", fontSize: "0.85rem", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeSection === "profile" && (
          <div style={{ background: "white", borderRadius: "20px", padding: "2rem", boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
            <h2 style={{ fontFamily: "var(--font-heading)", color: "#360817", margin: "0 0 0.5rem" }}>Kundegruppe og posisjonering</h2>
            <p style={{ color: "#360817", opacity: 0.5, fontSize: "0.85rem", marginBottom: "1.5rem" }}>Denne informasjonen brukes til aa skreddersy innholdsforslag for senteret ditt.</p>

            <div style={{ display: "grid", gap: "1.5rem" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.9rem", color: "#360817", marginBottom: "0.5rem", fontWeight: 500 }}>Kundegruppe / posisjon i markedet</label>
                <textarea
                  value={customerGroup}
                  onChange={e => setCustomerGroup(e.target.value)}
                  placeholder="Beskriv senterets hovedmaalgruppe og posisjon i markedet. F.eks: 'Familier i Skedsmo-omraadet, 25-55 aar. Hverdagssenter med fokus paa praktiske innkjop og gode tilbud.'"
                  rows={4}
                  style={{ width: "100%", padding: "0.75rem 1rem", border: "2px solid #E7E1E3", borderRadius: "12px", fontSize: "0.9rem", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }}
                />
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.9rem", color: "#360817", marginBottom: "0.5rem", fontWeight: 500 }}>Senterets posisjonering / merkevare</label>
                <textarea
                  value={positioning}
                  onChange={e => setPositioning(e.target.value)}
                  placeholder="Beskriv senterets merkevare og hva som gjor det unikt. F.eks: 'Lokalt forankret handlested med stor dagligvareavdeling, gode parkeringsmuligheter og et bredt utvalg butikker for hele familien.'"
                  rows={4}
                  style={{ width: "100%", padding: "0.75rem 1rem", border: "2px solid #E7E1E3", borderRadius: "12px", fontSize: "0.9rem", resize: "vertical", boxSizing: "border-box", fontFamily: "inherit" }}
                />
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
            <p style={{ color: "#360817", opacity: 0.5, fontSize: "0.85rem", marginBottom: "1.5rem" }}>Velg kommunikasjonsstilen som passer best for senteret ditt. Dette paavirker innholdsforslag.</p>

            <div style={{ display: "grid", gap: "0.75rem" }}>
              {TONE_OPTIONS.map(opt => (
                <div
                  key={opt.value}
                  onClick={() => { setToneOfVoice(opt.value); saveProfile() }}
                  style={{
                    padding: "1.25rem 1.5rem", borderRadius: "14px", cursor: "pointer",
                    border: toneOfVoice === opt.value ? "2px solid #121226" : "2px solid #E7E1E3",
                    background: toneOfVoice === opt.value ? "#f0eeff" : "white",
                    transition: "all 0.2s"
                  }}
                >
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
    </div>
  )
}
