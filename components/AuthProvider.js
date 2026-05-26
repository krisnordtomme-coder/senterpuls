"use client"
import { createContext, useContext, useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

const AuthContext = createContext({})

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [memberships, setMemberships] = useState([])
  const [currentOrg, setCurrentOrg] = useState(null)
  const [currentCenter, setCurrentCenter] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) {
        fetchProfile(session.user.id)
        fetchMemberships(session.user.id)
      } else {
        setLoading(false)
      }
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        setUser(session?.user ?? null)
        if (session?.user) {
          await fetchProfile(session.user.id)
          await fetchMemberships(session.user.id)
        } else {
          setProfile(null)
          setMemberships([])
          setCurrentOrg(null)
          setCurrentCenter(null)
        }
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single()
    setProfile(data)
  }

  async function fetchMemberships(userId) {
    const { data } = await supabase
      .from("memberships")
      .select("*, organizations(*)")
      .eq("user_id", userId)
    setMemberships(data || [])
    
    // Auto-select first org if none selected
    if (data?.length > 0 && !currentOrg) {
      setCurrentOrg(data[0].organizations)
    }
    setLoading(false)
  }

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    return { data, error }
  }

  async function signUp(email, password, fullName) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin + "/auth/callback",
      },
    })
    return { data, error }
  }

  async function signInWithMagicLink(email) {
    const { data, error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin + "/auth/callback",
      },
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

  const value = {
    user,
    profile,
    memberships,
    currentOrg,
    currentCenter,
    setCurrentOrg,
    setCurrentCenter,
    loading,
    signIn,
    signUp,
    signInWithMagicLink,
    signOut,
    isOwner: memberships.some(m => m.organization_id === currentOrg?.id && m.role === "eier"),
    isAdmin: memberships.some(m => m.organization_id === currentOrg?.id && (m.role === "eier" || m.role === "admin")),
    currentRole: memberships.find(m => m.organization_id === currentOrg?.id)?.role,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error("useAuth must be used within AuthProvider")
  return context
}
