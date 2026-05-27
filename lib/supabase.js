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
