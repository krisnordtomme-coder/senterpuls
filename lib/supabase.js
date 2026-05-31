import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// Bypass navigator.locks which causes auth session lock hangs
export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    lock: (name, acquireTimeout, fn) => fn(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true
  }
})

// Direct fetch helper - fallback for when the JS client still hangs
export async function supabaseDirectRpc(fnName, params = {}) {
  const projectId = supabaseUrl?.split("//")[1]?.split(".")[0]
  const tokenStr = typeof window !== "undefined"
    ? localStorage.getItem(`sb-${projectId}-auth-token`)
    : null
  const token = tokenStr ? JSON.parse(tokenStr) : null
  const accessToken = token?.access_token

  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/${fnName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": supabaseKey,
      "Authorization": accessToken ? `Bearer ${accessToken}` : `Bearer ${supabaseKey}`
    },
    body: JSON.stringify(params)
  })

  if (!response.ok) {
    const errorText = await response.text()
    return { data: null, error: { message: `${response.status}: ${errorText}` } }
  }

  const data = await response.json()
  return { data, error: null }
}

// Direct REST helpers for table writes — same purpose as supabaseDirectRpc:
// bypass the Supabase JS client, which intermittently hangs on its auth session
// lock and never resolves. These use plain fetch with the user's access token.

function getAccessToken() {
  if (typeof window === "undefined") return null
  const projectId = supabaseUrl?.split("//")[1]?.split(".")[0]
  const tokenStr = localStorage.getItem(`sb-${projectId}-auth-token`)
  const token = tokenStr ? JSON.parse(tokenStr) : null
  return token?.access_token || null
}

// PATCH a table with `patch`, filtered by `match` (column -> value). Returns
// the updated rows ({ data, error }) like the JS client would.
export async function supabaseDirectUpdate(table, match, patch) {
  const accessToken = getAccessToken()
  const params = new URLSearchParams()
  for (const [col, val] of Object.entries(match)) {
    params.append(col, `eq.${val}`)
  }

  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${params.toString()}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      "apikey": supabaseKey,
      "Authorization": accessToken ? `Bearer ${accessToken}` : `Bearer ${supabaseKey}`,
      "Prefer": "return=representation"
    },
    body: JSON.stringify(patch)
  })

  if (!response.ok) {
    const errorText = await response.text()
    return { data: null, error: { message: `${response.status}: ${errorText}` } }
  }

  const data = await response.json()
  return { data, error: null }
}
