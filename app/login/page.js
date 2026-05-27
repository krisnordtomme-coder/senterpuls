"use client"
import { useState } from "react"
import { useAuth } from "@/components/AuthProvider"
import { useRouter } from "next/navigation"

export default function LoginPage() {
  const { signIn, signUp, signInWithMagicLink, user } = useAuth()
  const router = useRouter()
  const [mode, setMode] = useState("login") // login | signup | magic
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [loading, setLoading] = useState(false)

  // Redirect if already logged in
  if (user) {
    router.push("/")
    return null
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError("")
    setMessage("")
    setLoading(true)

    try {
      if (mode === "magic") {
        const { error } = await signInWithMagicLink(email)
        if (error) throw error
        setMessage("Sjekk e-posten din for en innloggingslenke!")
      } else if (mode === "signup") {
        const { error } = await signUp(email, password, fullName)
        if (error) throw error
        setMessage("Konto opprettet! Sjekk e-posten din for bekreftelse.")
      } else {
        const { error } = await signIn(email, password)
        if (error) throw error
        router.push("/")
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #FAE4FB 0%, #D6C7FF 50%, #121226 100%)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "2rem",
    }}>
      <div style={{
        background: "white",
        borderRadius: "24px",
        padding: "3rem",
        maxWidth: "440px",
        width: "100%",
        boxShadow: "0 20px 60px rgba(18, 18, 38, 0.15)",
      }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <h1 style={{
            fontFamily: "var(--font-heading), serif",
            fontSize: "2rem",
            color: "#360817",
            margin: 0,
          }}>
            SenterPuls
          </h1>
          <p style={{
            color: "#360817",
            opacity: 0.6,
            marginTop: "0.5rem",
            fontSize: "0.9rem",
          }}>
            {mode === "signup" ? "Opprett ny konto" : "Logg inn for å fortsette"}
          </p>
        </div>

        {/* Mode tabs */}
        <div style={{
          display: "flex",
          gap: "0.5rem",
          marginBottom: "1.5rem",
          background: "#FAE4FB",
          borderRadius: "12px",
          padding: "4px",
        }}>
          {[
            { key: "login", label: "E-post & passord" },
            { key: "magic", label: "Magic link" },
            { key: "signup", label: "Registrer" },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => { setMode(tab.key); setError(""); setMessage("") }}
              style={{
                flex: 1,
                padding: "0.6rem 0.5rem",
                border: "none",
                borderRadius: "10px",
                cursor: "pointer",
                fontSize: "0.8rem",
                fontWeight: mode === tab.key ? 600 : 400,
                background: mode === tab.key ? "white" : "transparent",
                color: "#360817",
                boxShadow: mode === tab.key ? "0 2px 8px rgba(0,0,0,0.08)" : "none",
                transition: "all 0.2s",
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit}>
          {mode === "signup" && (
            <div style={{ marginBottom: "1rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", color: "#360817", marginBottom: "0.3rem", fontWeight: 500 }}>
                Fullt navn
              </label>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Ola Nordmann"
                required
                style={{
                  width: "100%",
                  padding: "0.75rem 1rem",
                  border: "2px solid #E7E1E3",
                  borderRadius: "12px",
                  fontSize: "0.95rem",
                  outline: "none",
                  transition: "border-color 0.2s",
                  boxSizing: "border-box",
                }}
              />
            </div>
          )}

          <div style={{ marginBottom: "1rem" }}>
            <label style={{ display: "block", fontSize: "0.85rem", color: "#360817", marginBottom: "0.3rem", fontWeight: 500 }}>
              E-postadresse
            </label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="din@epost.no"
              required
              style={{
                width: "100%",
                padding: "0.75rem 1rem",
                border: "2px solid #E7E1E3",
                borderRadius: "12px",
                fontSize: "0.95rem",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>

          {mode !== "magic" && (
            <div style={{ marginBottom: "1.5rem" }}>
              <label style={{ display: "block", fontSize: "0.85rem", color: "#360817", marginBottom: "0.3rem", fontWeight: 500 }}>
                Passord
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                style={{
                  width: "100%",
                  padding: "0.75rem 1rem",
                  border: "2px solid #E7E1E3",
                  borderRadius: "12px",
                  fontSize: "0.95rem",
                  outline: "none",
                  boxSizing: "border-box",
                }}
              />
            </div>
          )}

          {error && (
            <div style={{
              background: "#fee2e2",
              color: "#991b1b",
              padding: "0.75rem 1rem",
              borderRadius: "10px",
              fontSize: "0.85rem",
              marginBottom: "1rem",
            }}>
              {error}
            </div>
          )}

          {message && (
            <div style={{
              background: "#D4FF66",
              color: "#360817",
              padding: "0.75rem 1rem",
              borderRadius: "10px",
              fontSize: "0.85rem",
              marginBottom: "1rem",
            }}>
              {message}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "0.85rem",
              background: loading ? "#D6C7FF" : "#121226",
              color: "white",
              border: "none",
              borderRadius: "12px",
              fontSize: "1rem",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
              transition: "all 0.2s",
            }}
          >
            {loading ? "Venter..." : mode === "signup" ? "Opprett konto" : mode === "magic" ? "Send magic link" : "Logg inn"}
          </button>
        </form>
      </div>
    </div>
  )
}
