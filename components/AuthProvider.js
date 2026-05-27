"use client"
import { createContext, useContext, useEffect, useState, useRef } from "react"
import { supabase } from "@/lib/supabase"

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [memberships, setMemberships] = useState([])
  const [currentOrg, setCurrentOrg] = useState(null)
  const [currentCenter, setCurrentCenter] = useState(null)
  const [loading, setLoading] = useState(true)
  const initialized = useRef(false)

  useEffect(() => {
    if (initialized.current) return
    initialized.current = true

    async function init() {
      try {
        // Race getSession against a 4-second timeout
        const result = await Promise.race([
          supabase.auth.getSession(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("getSession_timeout")), 4000)
          )
        ])

        const { data, error } = result
        if (error) {
          console.error("getSession error:", error.message)
          setLoading(false)
          return
        }
        const session = data?.session
        setUser(session?.user ?? null)
        if (session?.user) {
          await initializeUser(session.user.id)
        }
      } catch (err) {
        console.warn("Auth init error/timeout:", err.message)
        // If getSession hung, try to recover from localStorage
        if (err.message === "getSession_timeout") {
          try {
            const storageKey = Object.keys(localStorage).find(
              k => k.includes("supabase") && k.includes("auth")
            )
            if (storageKey) {
              const stored = JSON.parse(localStorage.getItem(storageKey))
              if (stored?.user) {
                console.log("Recovered user from localStorage after timeout")
                setUser(stored.user)
                try {
                  await initializeUser(stored.user.id)
                } catch (initErr) {
                  console.error("initializeUser after recovery failed:", initErr)
                }
              }
            }
          } catch (recoveryErr) {
            console.error("localStorage recovery failed:", recoveryErr)
          }
        }
      } finally {
        setLoading(false)
      }
    }

    init()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null)
        if (session?.user) {
          try {
            await initializeUser(session.user.id)
          } catch (err) {
            console.error("Auth state change init error:", err)
          }
        } else {
          setProfile(null)
          setMemberships([])
          setCurrentOrg(null)
          setCurrentCenter(null)
        }
      }
    )

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  async function initializeUser(userId) {
    try {
      await fetchProfile(userId)
      await fetchMemberships(userId)
    } catch (err) {
      console.error("Error initializing user:", err)
    }
  }

  async function fetchProfile(userId) {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single()
      if (error) throw error
      setProfile(data)
    } catch (err) {
      console.error("Error fetching profile:", err)
    }
  }

  async function fetchMemberships(userId) {
    try {
      const { data, error } = await supabase
        .from("memberships")
        .select("*, organizations(*)")
        .eq("user_id", userId)
      if (error) {
        console.warn("Embedded select failed, using fallback:", error.message)
        const { data: mData } = await supabase
          .from("memberships")
          .select("*")
          .eq("user_id", userId)
        if (mData?.length > 0) {
          const orgIds = [...new Set(mData.map(m => m.organization_id))]
          const { data: orgData } = await supabase
            .from("organizations")
            .select("*")
            .in("id", orgIds)
          const enriched = mData.map(m => ({
            ...m,
            organizations: orgData?.find(o => o.id === m.organization_id) || null
          }))
          setMemberships(enriched)
          if (enriched.length > 0 && !currentOrg) setCurrentOrg(enriched[0].organizations)
          return
        }
        setMemberships([])
        return
      }
      setMemberships(data || [])
      if (data?.length > 0 && !currentOrg) setCurrentOrg(data[0].organizations)
    } catch (err) {
      console.error("Error fetching memberships:", err)
      setMemberships([])
    }
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    return { data, error }
  }

  async function signUp(email, password, fullName) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } }
    })
    return { data, error }
  }

  async function signInWithMagicLink(email) {
    const { data, error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin + "/auth/callback" }
    })
    return { data, error }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setMemberships([])
    setCurrentOrg(null)
    setCurrentCenter(null)
  }

  const membership = memberships.find(m => m.organization_id === currentOrg?.id)
  const isOwner = membership?.role === "eier"
  const isAdmin = isOwner || membership?.role === "admin"

  const value = {
    user, profile, memberships, currentOrg, setCurrentOrg,
    currentCenter, setCurrentCenter, loading, isOwner, isAdmin,
    signIn, signUp, signInWithMagicLink, signOut
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
