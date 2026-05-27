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

    // Safety timeout - never stay loading for more than 5 seconds
    const timeout = setTimeout(() => {
      setLoading(prev => {
        if (prev) console.warn("Auth loading timeout - forcing load complete")
        return false
      })
    }, 5000)

    async function init() {
      try {
        const { data, error } = await supabase.auth.getSession()
        if (error) {
          console.error("getSession error:", error.message)
          setLoading(false)
          clearTimeout(timeout)
          return
        }
        const session = data?.session
        setUser(session?.user ?? null)
        if (session?.user) {
          await initializeUser(session.user.id)
        }
      } catch (err) {
        console.error("Auth init error:", err)
      } finally {
        setLoading(false)
        clearTimeout(timeout)
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
      clearTimeout(timeout)
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
      const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).single()
      if (error) throw error
      setProfile(data)
    } catch (err) {
      console.error("Error fetching profile:", err)
    }
  }

  async function fetchMemberships(userId) {
    try {
      const { data, error } = await supabase.from("memberships").select("*, organizations(*)").eq("user_id", userId)
      if (error) {
        console.warn("Embedded select failed, using fallback:", error.message)
        const { data: mData } = await supabase.from("memberships").select("*").eq("user_id", userId)
        if (mData?.length > 0) {
          const orgIds = [...new Set(mData.map(m => m.organization_id))]
          const { data: orgData } = await supabase.from("organizations").select("*").in("id", orgIds)
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
    user,
    profile,
    memberships,
    currentOrg,
    setCurrentOrg,
    currentCenter,
    setCurrentCenter,
    loading,
    isOwner,
    isAdmin,
    signIn,
    signUp,
    signInWithMagicLink,
    signOut
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  return useContext(AuthContext)
}
