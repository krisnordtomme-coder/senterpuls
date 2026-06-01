"use client"
import { createContext, useContext, useEffect, useState, useRef, useCallback } from "react"
import { supabase, supabaseDirectRpc } from "@/lib/supabase"

const AuthContext = createContext({})

function withTimeout(promise, ms = 8000) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("Query timeout after " + ms + "ms")), ms))
  ])
}

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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log("Auth state change:", event, session?.user?.email)
        if (session?.user) {
          setUser(session.user)
          try {
            await initializeUser(session.user.id)
          } catch (err) {
            console.error("initializeUser error:", err)
          }
        } else {
          setUser(null)
          setProfile(null)
          setMemberships([])
          setCurrentOrg(null)
          setCurrentCenter(null)
        }
        setLoading(false)
      }
    )

    const safetyTimeout = setTimeout(() => {
      setLoading(prev => {
        if (prev) {
          console.log("Safety timeout - no auth event received")
          return false
        }
        return prev
      })
    }, 6000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(safetyTimeout)
    }
  }, [])

  async function initializeUser(userId) {
    console.log("initializeUser called for:", userId)
    await Promise.all([
      fetchProfile(userId),
      fetchMemberships(userId)
    ])
  }

  async function fetchProfile(userId) {
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single()
      if (error) {
        console.error("fetchProfile error:", error.message)
        return
      }
      setProfile(data)
    } catch (err) {
      console.error("fetchProfile exception:", err)
    }
  }

  async function fetchMemberships(userId) {
    try {
      console.log("fetchMemberships called for:", userId)
      const { data, error } = await withTimeout(
        supabaseDirectRpc('get_my_memberships')
      )
      if (error) {
        console.error("fetchMemberships error:", error.message)
        return
      }
      console.log("fetchMemberships data:", JSON.stringify(data))
      const membershipsData = data || []
      setMemberships(membershipsData)
      if (membershipsData.length > 0) {
        // Only default the org when none is selected. onAuthStateChange also
        // fires on TOKEN_REFRESHED (e.g. during a long scan); without this
        // guard it would reset the user's chosen org back to the first one.
        setCurrentOrg(prev => {
          if (prev) {
            const stillMember = membershipsData.some(m => m.organization_id === prev.id)
            if (stillMember) return prev
          }
          return membershipsData[0].organizations || prev
        })
      }
    } catch (err) {
      console.error("fetchMemberships exception:", err)
    }
  }

  const refreshMemberships = useCallback(async () => {
    if (user?.id) {
      await fetchMemberships(user.id)
    }
  }, [user?.id])

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    return { data, error }
  }

  async function signUp(email, password, fullName) {
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { full_name: fullName } }
    })
    return { data, error }
  }

  async function signInWithMagicLink(email) {
    const { data, error } = await supabase.auth.signInWithOtp({ email })
    return { data, error }
  }

  async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (!error) {
      setUser(null)
      setProfile(null)
      setMemberships([])
      setCurrentOrg(null)
      setCurrentCenter(null)
    }
    return { error }
  }

  const membership = memberships.find(m => m.organization_id === currentOrg?.id)
  const isOwner = membership?.role === "eier"
  const isAdmin = isOwner || membership?.role === "admin"

  const value = {
    user, profile, memberships, currentOrg, setCurrentOrg,
    currentCenter, setCurrentCenter, loading, isOwner, isAdmin,
    signIn, signUp, signInWithMagicLink, signOut, refreshMemberships,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => useContext(AuthContext)
