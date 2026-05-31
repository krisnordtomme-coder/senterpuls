// Shared helper: mirror a center's center_tenants rows into the operational
// `stores` table that the scrape -> analyze pipeline reads from. Used by both
// /api/scrape (website) and /api/scrape-social (Instagram/Facebook).
//
// A tenant is synced if it has ANY of: a website URL, an Instagram handle, or a
// Facebook page — so social-only tenants (no website) still get a store row to
// attach content to. stores.url is nullable for exactly this reason.

export function normalizeUrl(url) {
  if (!url) return null
  url = url.trim()
  if (!url) return null
  if (url.startsWith("http://") || url.startsWith("https://")) return url
  if (url.startsWith("www.")) return "https://" + url
  return "https://" + url
}

export async function syncTenantsToStores(centerId, supabase) {
  const { data: center } = await supabase
    .from("centers").select("id, organization_id").eq("id", centerId).single()
  if (!center) return []

  const { data: tenants } = await supabase
    .from("center_tenants").select("*").eq("center_id", centerId)
  if (!tenants || tenants.length === 0) return []

  // Only tenants with something to scrape (website and/or social).
  const scannable = tenants.filter(t => t.url || t.instagram_handle || t.facebook_page)
  if (scannable.length === 0) return []

  const { data: existingStores } = await supabase
    .from("stores")
    .select("id, name, url, center_id, instagram_handle, facebook_page")
    .eq("center_id", centerId)
  const existingByName = new Map((existingStores || []).map(s => [s.name.toLowerCase(), s]))

  const syncedStores = []

  for (const tenant of scannable) {
    const normalizedUrl = normalizeUrl(tenant.url)
    const instagram = tenant.instagram_handle || null
    const facebook = tenant.facebook_page || null
    const existing = existingByName.get(tenant.name.toLowerCase())

    if (existing) {
      // Keep the store row in sync with the tenant's current links.
      const changed =
        existing.url !== normalizedUrl ||
        existing.instagram_handle !== instagram ||
        existing.facebook_page !== facebook
      if (changed) {
        await supabase.from("stores")
          .update({ url: normalizedUrl, instagram_handle: instagram, facebook_page: facebook, active: true })
          .eq("id", existing.id)
      }
      syncedStores.push({ ...existing, url: normalizedUrl, instagram_handle: instagram, facebook_page: facebook, active: true })
    } else {
      const { data: newStore } = await supabase.from("stores").insert({
        name: tenant.name,
        url: normalizedUrl,
        category: tenant.category || null,
        instagram_handle: instagram,
        facebook_page: facebook,
        center_id: centerId,
        organization_id: center.organization_id,
        active: true,
      }).select().single()
      if (newStore) syncedStores.push(newStore)
    }
  }

  return syncedStores
}
