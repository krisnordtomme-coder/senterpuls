"use client"
import { useState, useEffect } from "react"
import { useAuth } from "@/components/AuthProvider"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"

export default function AdminPage() {
  const { user, profile, memberships, currentOrg, setCurrentOrg, isAdmin, isOwner, signOut, loading } = useAuth()
  const router = useRouter()
  const [tab, setTab] = useState("centers") // centers | team | invitations | org
  const [centers, setCenters] = useState([])
  const [teamMembers, setTeamMembers] = useState([])
  const [invitations, setInvitations] = useState([])
  const [showNewOrg, setShowNewOrg] = useState(false)
  const [showNewCenter, setShowNewCenter] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [newOrgName, setNewOrgName] = useState("")
  const [newCenterName, setNewCenterName] = useState("")
  const [newCenterCity, setNewCenterCity] = useState("")
  const [inviteEmail, setInviteEmail] = useState("")
  const [inviteRole, setInviteRole] = useState("redaktor")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.push("/login")
  }, [user, loading])

  useEffect(() => {
    if (currentOrg) {
      fetchCenters()
      fetchTeam()
      fetchInvitations()
    }
  }, [currentOrg])

  async function fetchCenters() {
    const { data } = await supabase.from("centers").select("*").eq("organization_id", currentOrg.id).order("name")
    setCenters(data || [])
  }

  async function fetchTeam() {
    const { data } = await supabase.from("memberships").select("*, profiles(*)").eq("organization_id", currentOrg.id)
    setTeamMembers(data || [])
  }

  async function fetchInvitations() {
    const { data } = await supabase.from("invitations").select("*").eq("organization_id", currentOrg.id).is("accepted_at", null)
    setInvitations(data || [])
  }

  async function createOrganization() {
    if (!newOrgName.trim()) return
    setSaving(true)
    const slug = newOrgName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")
    const { data: org, error } = await supabase.from("organizations").insert({ name: newOrgName.trim(), slug }).select().single()
    if (!error && org) {
      await supabase.from("memberships").insert({ user_id: user.id, organization_id: org.id, role: "eier" })
      setCurrentOrg(org)
      setShowNewOrg(false)
      setNewOrgName("")
    }
    setSaving(false)
  }

  async function createCenter() {
    if (!newCenterName.trim()) return
    setSaving(true)
    const slug = newCenterName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-")
    await supabase.from("centers").insert({
      organization_id: currentOrg.id, name: newCenterName.trim(), slug, city: newCenterCity.trim() || null
    })
    setShowNewCenter(false)
    setNewCenterName("")
    setNewCenterCity("")
    fetchCenters()
    setSaving(false)
  }

  async function sendInvitation() {
    if (!inviteEmail.trim()) return
    setSaving(true)
    await supabase.from("invitations").insert({
      organization_id: currentOrg.id, email: inviteEmail.trim().toLowerCase(), role: inviteRole, invited_by: user.id
    })
    setShowInvite(false)
    setInviteEmail("")
    fetchInvitations()
    setSaving(false)
  }

  async function deleteInvitation(id) {
    await supabase.from("invitations").delete().eq("id", id)
    fetchInvitations()
  }

  async function toggleCenterActive(center) {
    await supabase.from("centers").update({ active: !center.active }).eq("id", center.id)
    fetchCenters()
  }

  if (loading) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#FAE4FB" }}><p>Laster...</p></div>

  if (!user) return null

  const roleLabels = { eier: "Eier", admin: "Admin", redaktor: "Redakt\u00f8r", leser: "Leser" }
  const roleColors = { eier: "#D4FF66", admin: "#D6C7FF", redaktor: "#FAE4FB", leser: "#E7E1E3" }

  return (
    <div style={{ minHeight: "100vh", background: "#FAE4FB" }}>
      {/* Top bar */}
      <header style={{
        background: "#121226", color: "white", padding: "1rem 2rem",
        display: "flex", justifyContent: "space-between", alignItems: "center"
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1.5rem" }}>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: "1.4rem", margin: 0, cursor: "pointer" }}
            onClick={() => router.push("/")}>SenterPuls</h1>
          <span style={{ opacity: 0.4 }}>|</span>
          <span style={{ fontSize: "0.85rem", opacity: 0.7 }}>Admin</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {/* Org selector */}
          {memberships.length > 0 && (
            <select
              value={currentOrg?.id || ""}
              onChange={e => {
                const m = memberships.find(m => m.organization_id === e.target.value)
                if (m) setCurrentOrg(m.organizations)
              }}
              style={{
                background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)",
                color: "white", padding: "0.4rem 0.8rem", borderRadius: "8px", fontSize: "0.85rem"
              }}
            >
              {memberships.map(m => (
                <option key={m.organization_id} value={m.organization_id} style={{ color: "#121226" }}>
                  {m.organizations?.name}
                </option>
              ))}
            </select>
          )}
          <span style={{ fontSize: "0.85rem", opacity: 0.7 }}>{profile?.full_name || user?.email}</span>
          <button onClick={signOut} style={{
            background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.2)",
            color: "white", padding: "0.4rem 0.8rem", borderRadius: "8px", cursor: "pointer", fontSize: "0.8rem"
          }}>Logg ut</button>
        </div>
      </header>

      <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "2rem" }}>
        {/* No org yet */}
        {memberships.length === 0 && !showNewOrg && (
          <div style={{
            background: "white", borderRadius: "20px", padding: "3rem", textAlign: "center",
            boxShadow: "0 4px 20px rgba(0,0,0,0.06)"
          }}>
            <h2 style={{ fontFamily: "var(--font-heading)", color: "#360817", fontSize: "1.6rem" }}>Velkommen til SenterPuls!</h2>
            <p style={{ color: "#360817", opacity: 0.7, marginBottom: "1.5rem" }}>Opprett en organisasjon for \u00e5 komme i gang.</p>
            <button onClick={() => setShowNewOrg(true)} style={{
              background: "#D4FF66", color: "#121226", border: "none", padding: "0.8rem 2rem",
              borderRadius: "12px", fontWeight: 600, cursor: "pointer", fontSize: "1rem"
            }}>+ Opprett organisasjon</button>
          </div>
        )}

        {/* New org form */}
        {showNewOrg && (
          <div style={{ background: "white", borderRadius: "20px", padding: "2rem", marginBottom: "1.5rem", boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
            <h3 style={{ color: "#360817", marginTop: 0 }}>Ny organisasjon</h3>
            <input value={newOrgName} onChange={e => setNewOrgName(e.target.value)} placeholder="Organisasjonsnavn (f.eks. Carucel Eiendom)"
              style={{ width: "100%", padding: "0.75rem 1rem", border: "2px solid #E7E1E3", borderRadius: "12px", fontSize: "0.95rem", boxSizing: "border-box", marginBottom: "1rem" }} />
            <div style={{ display: "flex", gap: "0.5rem" }}>
              <button onClick={createOrganization} disabled={saving} style={{
                background: "#D4FF66", color: "#121226", border: "none", padding: "0.6rem 1.5rem",
                borderRadius: "10px", fontWeight: 600, cursor: "pointer"
              }}>{saving ? "Oppretter..." : "Opprett"}</button>
              <button onClick={() => setShowNewOrg(false)} style={{
                background: "#E7E1E3", color: "#360817", border: "none", padding: "0.6rem 1.5rem",
                borderRadius: "10px", cursor: "pointer"
              }}>Avbryt</button>
            </div>
          </div>
        )}

        {/* Main admin content */}
        {currentOrg && (
          <>
            {/* Tabs */}
            <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
              {[
                { key: "centers", label: "Sentre", icon: "\ud83c\udfec" },
                { key: "team", label: "Team", icon: "\ud83d\udc65" },
                { key: "invitations", label: "Invitasjoner", icon: "\u2709\ufe0f" },
                { key: "org", label: "Organisasjon", icon: "\u2699\ufe0f" },
              ].map(t => (
                <button key={t.key} onClick={() => setTab(t.key)} style={{
                  padding: "0.7rem 1.2rem", border: "none", borderRadius: "12px", cursor: "pointer",
                  background: tab === t.key ? "#121226" : "white", color: tab === t.key ? "white" : "#360817",
                  fontWeight: tab === t.key ? 600 : 400, fontSize: "0.9rem",
                  boxShadow: tab === t.key ? "none" : "0 2px 8px rgba(0,0,0,0.04)",
                  transition: "all 0.2s"
                }}>{t.icon} {t.label}</button>
              ))}
              <div style={{ flex: 1 }} />
              <button onClick={() => setShowNewOrg(true)} style={{
                background: "white", color: "#360817", border: "none", padding: "0.7rem 1.2rem",
                borderRadius: "12px", cursor: "pointer", fontSize: "0.85rem"
              }}>+ Ny org</button>
            </div>

            {/* Centers tab */}
            {tab === "centers" && (
              <div style={{ background: "white", borderRadius: "20px", padding: "2rem", boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                  <h2 style={{ fontFamily: "var(--font-heading)", color: "#360817", margin: 0 }}>Sentre i {currentOrg.name}</h2>
                  {isAdmin && <button onClick={() => setShowNewCenter(true)} style={{
                    background: "#D4FF66", color: "#121226", border: "none", padding: "0.6rem 1.2rem",
                    borderRadius: "10px", fontWeight: 600, cursor: "pointer"
                  }}>+ Nytt senter</button>}
                </div>

                {showNewCenter && (
                  <div style={{ background: "#FAE4FB", borderRadius: "14px", padding: "1.5rem", marginBottom: "1.5rem" }}>
                    <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                      <input value={newCenterName} onChange={e => setNewCenterName(e.target.value)} placeholder="Senternavn"
                        style={{ flex: 2, minWidth: "200px", padding: "0.65rem 1rem", border: "2px solid #E7E1E3", borderRadius: "10px", fontSize: "0.9rem" }} />
                      <input value={newCenterCity} onChange={e => setNewCenterCity(e.target.value)} placeholder="By"
                        style={{ flex: 1, minWidth: "120px", padding: "0.65rem 1rem", border: "2px solid #E7E1E3", borderRadius: "10px", fontSize: "0.9rem" }} />
                      <button onClick={createCenter} disabled={saving} style={{
                        background: "#121226", color: "white", border: "none", padding: "0.65rem 1.2rem",
                        borderRadius: "10px", fontWeight: 600, cursor: "pointer"
                      }}>{saving ? "..." : "Opprett"}</button>
                      <button onClick={() => setShowNewCenter(false)} style={{
                        background: "#E7E1E3", color: "#360817", border: "none", padding: "0.65rem 1rem",
                        borderRadius: "10px", cursor: "pointer"
                      }}>Avbryt</button>
                    </div>
                  </div>
                )}

                {centers.length === 0 ? (
                  <p style={{ color: "#360817", opacity: 0.5, textAlign: "center", padding: "2rem" }}>Ingen sentre enn\u00e5. Opprett ditt f\u00f8rste senter!</p>
                ) : (
                  <div style={{ display: "grid", gap: "0.75rem" }}>
                    {centers.map(c => (
                      <div key={c.id} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "1rem 1.25rem", borderRadius: "14px",
                        background: c.active ? "#f8f7ff" : "#f5f5f5", border: "1px solid #E7E1E3"
                      }}>
                        <div>
                          <strong style={{ color: "#360817" }}>{c.name}</strong>
                          {c.city && <span style={{ marginLeft: "0.5rem", color: "#360817", opacity: 0.5, fontSize: "0.85rem" }}>{c.city}</span>}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                          <span style={{
                            fontSize: "0.75rem", padding: "0.2rem 0.6rem", borderRadius: "6px",
                            background: c.active ? "#D4FF66" : "#E7E1E3", color: "#360817"
                          }}>{c.active ? "Aktiv" : "Inaktiv"}</span>
                          {isAdmin && <button onClick={() => toggleCenterActive(c)} style={{
                            background: "none", border: "1px solid #E7E1E3", borderRadius: "8px",
                            padding: "0.3rem 0.6rem", cursor: "pointer", fontSize: "0.75rem", color: "#360817"
                          }}>{c.active ? "Deaktiver" : "Aktiver"}</button>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Team tab */}
            {tab === "team" && (
              <div style={{ background: "white", borderRadius: "20px", padding: "2rem", boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                  <h2 style={{ fontFamily: "var(--font-heading)", color: "#360817", margin: 0 }}>Teammedlemmer</h2>
                  {isAdmin && <button onClick={() => setShowInvite(true)} style={{
                    background: "#D4FF66", color: "#121226", border: "none", padding: "0.6rem 1.2rem",
                    borderRadius: "10px", fontWeight: 600, cursor: "pointer"
                  }}>+ Inviter</button>}
                </div>

                <div style={{ display: "grid", gap: "0.75rem" }}>
                  {teamMembers.map(m => (
                    <div key={m.id} style={{
                      display: "flex", justifyContent: "space-between", alignItems: "center",
                      padding: "1rem 1.25rem", borderRadius: "14px", background: "#f8f7ff", border: "1px solid #E7E1E3"
                    }}>
                      <div>
                        <strong style={{ color: "#360817" }}>{m.profiles?.full_name || "Ukjent"}</strong>
                        <span style={{ marginLeft: "0.5rem", color: "#360817", opacity: 0.5, fontSize: "0.85rem" }}>{m.profiles?.email}</span>
                      </div>
                      <span style={{
                        fontSize: "0.75rem", padding: "0.25rem 0.7rem", borderRadius: "8px",
                        background: roleColors[m.role] || "#E7E1E3", color: "#360817", fontWeight: 600
                      }}>{roleLabels[m.role] || m.role}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Invitations tab */}
            {tab === "invitations" && (
              <div style={{ background: "white", borderRadius: "20px", padding: "2rem", boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
                  <h2 style={{ fontFamily: "var(--font-heading)", color: "#360817", margin: 0 }}>Ventende invitasjoner</h2>
                  {isAdmin && <button onClick={() => setShowInvite(true)} style={{
                    background: "#D4FF66", color: "#121226", border: "none", padding: "0.6rem 1.2rem",
                    borderRadius: "10px", fontWeight: 600, cursor: "pointer"
                  }}>+ Inviter</button>}
                </div>

                {showInvite && (
                  <div style={{ background: "#FAE4FB", borderRadius: "14px", padding: "1.5rem", marginBottom: "1.5rem" }}>
                    <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "flex-end" }}>
                      <div style={{ flex: 2, minWidth: "200px" }}>
                        <label style={{ display: "block", fontSize: "0.8rem", color: "#360817", marginBottom: "0.3rem" }}>E-post</label>
                        <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="bruker@epost.no" type="email"
                          style={{ width: "100%", padding: "0.65rem 1rem", border: "2px solid #E7E1E3", borderRadius: "10px", fontSize: "0.9rem", boxSizing: "border-box" }} />
                      </div>
                      <div style={{ flex: 1, minWidth: "120px" }}>
                        <label style={{ display: "block", fontSize: "0.8rem", color: "#360817", marginBottom: "0.3rem" }}>Rolle</label>
                        <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                          style={{ width: "100%", padding: "0.65rem 1rem", border: "2px solid #E7E1E3", borderRadius: "10px", fontSize: "0.9rem", boxSizing: "border-box" }}>
                          <option value="admin">Admin</option>
                          <option value="redaktor">Redakt\u00f8r</option>
                          <option value="leser">Leser</option>
                        </select>
                      </div>
                      <button onClick={sendInvitation} disabled={saving} style={{
                        background: "#121226", color: "white", border: "none", padding: "0.65rem 1.2rem",
                        borderRadius: "10px", fontWeight: 600, cursor: "pointer"
                      }}>Send</button>
                      <button onClick={() => setShowInvite(false)} style={{
                        background: "#E7E1E3", color: "#360817", border: "none", padding: "0.65rem 1rem",
                        borderRadius: "10px", cursor: "pointer"
                      }}>Avbryt</button>
                    </div>
                  </div>
                )}

                {invitations.length === 0 ? (
                  <p style={{ color: "#360817", opacity: 0.5, textAlign: "center", padding: "2rem" }}>Ingen ventende invitasjoner.</p>
                ) : (
                  <div style={{ display: "grid", gap: "0.75rem" }}>
                    {invitations.map(inv => (
                      <div key={inv.id} style={{
                        display: "flex", justifyContent: "space-between", alignItems: "center",
                        padding: "1rem 1.25rem", borderRadius: "14px", background: "#f8f7ff", border: "1px solid #E7E1E3"
                      }}>
                        <div>
                          <strong style={{ color: "#360817" }}>{inv.email}</strong>
                          <span style={{
                            marginLeft: "0.75rem", fontSize: "0.75rem", padding: "0.2rem 0.6rem",
                            borderRadius: "6px", background: roleColors[inv.role], color: "#360817"
                          }}>{roleLabels[inv.role]}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          <span style={{ fontSize: "0.75rem", color: "#360817", opacity: 0.4 }}>
                            Utl\u00f8per {new Date(inv.expires_at).toLocaleDateString("nb-NO")}
                          </span>
                          <button onClick={() => deleteInvitation(inv.id)} style={{
                            background: "none", border: "1px solid #E7E1E3", borderRadius: "8px",
                            padding: "0.3rem 0.6rem", cursor: "pointer", fontSize: "0.75rem", color: "#991b1b"
                          }}>Slett</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Org settings tab */}
            {tab === "org" && (
              <div style={{ background: "white", borderRadius: "20px", padding: "2rem", boxShadow: "0 4px 20px rgba(0,0,0,0.06)" }}>
                <h2 style={{ fontFamily: "var(--font-heading)", color: "#360817", margin: "0 0 1.5rem" }}>Organisasjonsinnstillinger</h2>
                <div style={{ display: "grid", gap: "1rem" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.85rem", color: "#360817", marginBottom: "0.3rem", fontWeight: 500 }}>Navn</label>
                    <input value={currentOrg.name} readOnly style={{
                      width: "100%", padding: "0.75rem 1rem", border: "2px solid #E7E1E3", borderRadius: "12px",
                      fontSize: "0.95rem", background: "#f8f7ff", boxSizing: "border-box"
                    }} />
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: "0.85rem", color: "#360817", marginBottom: "0.3rem", fontWeight: 500 }}>Slug</label>
                    <input value={currentOrg.slug} readOnly style={{
                      width: "100%", padding: "0.75rem 1rem", border: "2px solid #E7E1E3", borderRadius: "12px",
                      fontSize: "0.95rem", background: "#f8f7ff", boxSizing: "border-box"
                    }} />
                  </div>
                  <div style={{ padding: "1rem", background: "#FAE4FB", borderRadius: "12px", marginTop: "0.5rem" }}>
                    <p style={{ margin: 0, fontSize: "0.85rem", color: "#360817" }}>
                      <strong>Plan:</strong> Gratis (Free tier) &bull; <strong>Sentre:</strong> {centers.length} &bull; <strong>Brukere:</strong> {teamMembers.length}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
