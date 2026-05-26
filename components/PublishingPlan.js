"use client"
import { useState, useMemo } from "react"

const DAYS_SHORT = ["Søn", "Man", "Tir", "Ons", "Tor", "Fre", "Lør"]

const CAT_LABELS = {
  kampanje: "Kampanje", produktlansering: "Produktlansering", event: "Event",
  sesong: "Sesong", baerekraft: "Bærekraft", nyhet: "Nyhet",
}

function getNextPublishDays(count, closedDays) {
  const days = []
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 1)
  while (days.length < count) {
    if (!closedDays.includes(d.getDay())) { days.push(new Date(d)) }
    d.setDate(d.getDate() + 1)
  }
  return days
}

function computeCustomerValue(suggestion) {
  const text = (suggestion.content?.original_text || suggestion.suggested_text || "").toLowerCase()
  const category = suggestion.category || ""
  const baseScore = suggestion.relevance_score || 0
  let boost = 0
  let reasons = []
  const hasPercent = /%|prosent|rabatt|avslag|salg|tilbud|kampanje/i.test(text)
  const hasEvent = /event|arrangement|konsert|show|workshop|kurs|åpning|lansering|inviter|påmelding|rollespill|turnering/i.test(text)
  const hasDeadline = /siste|snart|før |frem til|t\.o\.m|kun i dag|begrenset|while|slutt|ender|utløper/i.test(text)
  const hasDate = /\d{1,2}\.\s*(jan|feb|mar|apr|mai|jun|jul|aug|sep|okt|nov|des)|\d{1,2}\/\d{1,2}|(mandag|tirsdag|onsdag|torsdag|fredag|lørdag|søndag)/i.test(text)
  if (hasEvent) { boost += 15; reasons.push("Arrangement som driver besøk") }
  if (hasPercent) { boost += 12; reasons.push("Tilbud/rabatt som trekker kunder") }
  if (hasDeadline) { boost += 10; reasons.push("Tidsbegrenset — haster") }
  if (hasDate) { boost += 5; reasons.push("Spesifikk dato — planlegg publisering") }
  if (category === "event") { boost += 8; if (!reasons.includes("Arrangement som driver besøk")) reasons.push("Event-innhold") }
  if (category === "kampanje") { boost += 6; if (!hasPercent) reasons.push("Kampanjeinnhold") }
  if (category === "produktlansering") { boost += 5; reasons.push("Nytt produkt — skaper nysgjerrighet") }
  if (category === "sesong") { boost += 4; reasons.push("Sesongaktuelt") }
  const hasImage = suggestion.content?.image_urls?.length > 0
  if (hasImage) { boost += 3 }
  const postedAt = suggestion.content?.posted_at
  if (postedAt) {
    const daysSince = (Date.now() - new Date(postedAt).getTime()) / 86400000
    if (daysSince < 3) { boost += 8; reasons.push("Helt nytt innhold") }
    else if (daysSince < 7) { boost += 4; reasons.push("Ferskt innhold") }
  }
  const hasCTA = /bestill|kjøp|book|meld deg|registrer|les mer|se alle|handle|klikk|få |hent/i.test(text)
  if (hasCTA) { boost += 3; reasons.push("Tydelig handlingsoppfordring") }
  const topReason = reasons.length > 0 ? reasons[0] : "Relevant innhold"
  return { customerValue: Math.min(baseScore + boost, 100), topReason, reasons, isUrgent: hasDeadline || hasEvent, hasImage }
}

function ItemDetailModal({ item, onClose }) {
  const [copied, setCopied] = useState(null)
  const [imgError, setImgError] = useState(false)
  const [showFullImage, setShowFullImage] = useState(false)
  const store = item.stores
  const content = item.content
  const cv = item._cv
  const channels = item.suggested_text || {}
  const imageUrl = content?.image_urls?.[0]
  const hasImage = imageUrl && !imgError
  const sourceUrl = content?.original_url
  const catLabel = CAT_LABELS[item.category] || item.category || "Innhold"

  function copyText(label, text) {
    navigator.clipboard.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(null), 1500)
  }

  async function downloadImage() {
    if (!imageUrl) return
    try {
      const res = await fetch(imageUrl)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = (store?.name || "bilde") + "-" + Date.now() + ".jpg"
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch { window.open(imageUrl, "_blank") }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(18,18,38,0.7)" }}
      onClick={onClose}>
      <div className="relative w-full max-w-2xl max-h-[90vh] overflow-y-auto"
        style={{ background: "white", borderRadius: "18px", boxShadow: "0 25px 60px rgba(54,8,23,0.25)" }}
        onClick={e => e.stopPropagation()}>

        {/* Close button */}
        <button onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 transition-all duration-200"
          style={{ borderRadius: "10px", background: "rgba(231,225,227,0.8)", color: "#360817" }}>
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>

        {/* Image section */}
        {hasImage && (
          <div className="relative">
            <img src={imageUrl} alt={store?.name || ""}
              className="w-full object-cover cursor-pointer"
              style={{ borderRadius: "18px 18px 0 0", maxHeight: "300px" }}
              onClick={() => setShowFullImage(true)}
              onError={() => setImgError(true)} />
            <button onClick={downloadImage}
              className="absolute bottom-3 right-3 px-3 py-1.5 text-xs font-medium flex items-center gap-1.5 transition-all duration-200"
              style={{ borderRadius: "8px", background: "rgba(255,255,255,0.92)", color: "#360817", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              Last ned bilde
            </button>
          </div>
        )}

        {/* Header */}
        <div className="px-6 pt-5 pb-4" style={{ borderBottom: "1px solid #E7E1E3" }}>
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 flex items-center justify-center text-sm font-semibold flex-shrink-0"
              style={{ borderRadius: "12px", background: "#D6C7FF", color: "#360817" }}>
              {store?.name?.substring(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="font-medium text-base" style={{ color: "#360817", fontFamily: "var(--font-heading, 'DM Serif Display'), Georgia, serif" }}>{store?.name}</span>
                <span className="text-[10px] px-2.5 py-0.5 font-medium"
                  style={{ borderRadius: "10px", background: cv.isUrgent ? "#FEF3C7" : "#FAE4FB", color: cv.isUrgent ? "#92400E" : "#86198F" }}>
                  {catLabel}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold" style={{ color: cv.customerValue >= 80 ? "#16a34a" : cv.customerValue >= 60 ? "#d97706" : "#9ca3af" }}>
                  {cv.customerValue}/100
                </span>
                {cv.reasons.map((r, i) => (
                  <span key={i} className="text-[10px]" style={{ color: "#9333ea" }}>
                    {cv.isUrgent && i === 0 ? "⚡ " : "→ "}{r}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Original content */}
        {content?.original_text && (
          <div className="px-6 py-4" style={{ borderBottom: "1px solid #E7E1E3" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium uppercase" style={{ color: "#360817", opacity: 0.5 }}>Originalt innhold</span>
              <div className="flex items-center gap-2">
                {sourceUrl && (
                  <a href={sourceUrl} target="_blank" rel="noopener noreferrer"
                    className="text-xs font-medium flex items-center gap-1 transition-all duration-200"
                    style={{ color: "#9333ea" }}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                    Se kilde
                  </a>
                )}
                <button onClick={() => copyText("original", content.original_text)}
                  className="text-xs font-medium transition-all duration-200"
                  style={{ color: "#9333ea" }}>
                  {copied === "original" ? "Kopiert!" : "Kopier"}
                </button>
              </div>
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "#360817", opacity: 0.75 }}>
              {content.original_text}
            </p>
          </div>
        )}

        {/* AI-generated texts per channel */}
        {typeof channels === 'object' && Object.keys(channels).length > 0 && (
          <div className="px-6 py-4" style={{ background: "#F9F5FA" }}>
            <span className="text-xs font-medium uppercase block mb-3" style={{ color: "#360817", opacity: 0.5 }}>AI-generert tekst per kanal</span>
            <div className="space-y-4">
              {Object.entries(channels).map(([ch, text]) => {
                const chLabel = ch === "website" ? "🌐 Nettside" : ch === "instagram" ? "📷 Instagram" : ch === "facebook" ? "💬 Facebook" : ch
                const chBg = ch === "website" ? "#D6C7FF" : ch === "instagram" ? "#FAE4FB" : "#E7E1E3"
                return (
                  <div key={ch} className="p-4" style={{ background: "white", borderRadius: "12px", border: "1px solid #E7E1E3" }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-medium px-2.5 py-0.5" style={{ borderRadius: "10px", background: chBg, color: "#360817" }}>
                        {chLabel}
                      </span>
                      <button onClick={() => copyText(ch, text)}
                        className="text-xs font-medium px-3 py-1 transition-all duration-200"
                        style={{ borderRadius: "6px", background: copied === ch ? "#D1FAE5" : "#F9F5FA", color: copied === ch ? "#065F46" : "#9333ea" }}>
                        {copied === ch ? "✓ Kopiert!" : "Kopier tekst"}
                      </button>
                    </div>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "#360817", opacity: 0.85 }}>
                      {text}
                    </p>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* If suggested_text is a string (not per-channel) */}
        {typeof channels === 'string' && channels.length > 0 && (
          <div className="px-6 py-4" style={{ background: "#F9F5FA" }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium uppercase" style={{ color: "#360817", opacity: 0.5 }}>AI-generert tekst</span>
              <button onClick={() => copyText("suggested", channels)}
                className="text-xs font-medium px-3 py-1 transition-all duration-200"
                style={{ borderRadius: "6px", background: copied === "suggested" ? "#D1FAE5" : "#F9F5FA", color: copied === "suggested" ? "#065F46" : "#9333ea" }}>
                {copied === "suggested" ? "✓ Kopiert!" : "Kopier tekst"}
              </button>
            </div>
            <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "#360817", opacity: 0.85 }}>
              {channels}
            </p>
          </div>
        )}

        {/* Additional images */}
        {content?.image_urls?.length > 1 && (
          <div className="px-6 py-4" style={{ borderTop: "1px solid #E7E1E3" }}>
            <span className="text-xs font-medium uppercase block mb-3" style={{ color: "#360817", opacity: 0.5 }}>Alle bilder ({content.image_urls.length})</span>
            <div className="grid grid-cols-3 gap-2">
              {content.image_urls.map((url, i) => (
                <img key={i} src={url} alt="" className="w-full h-24 object-cover cursor-pointer transition-all duration-200 hover:opacity-80"
                  style={{ borderRadius: "8px" }}
                  onClick={() => window.open(url, "_blank")} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Full image lightbox */}
      {showFullImage && hasImage && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ background: "rgba(18,18,38,0.9)" }}
          onClick={() => setShowFullImage(false)}>
          <img src={imageUrl} alt="" className="max-w-full max-h-[90vh] object-contain" style={{ borderRadius: "14px" }} />
        </div>
      )}
    </div>
  )
}

export default function PublishingPlan({ suggestions }) {
  const [showSettings, setShowSettings] = useState(false)
  const [showPlan, setShowPlan] = useState(true)
  const [selectedItem, setSelectedItem] = useState(null)
  const [settings, setSettings] = useState({
    webPerDay: 2, igEveryNDays: 2, fbEveryNDays: 2, closedDays: [0],
  })

  const plan = useMemo(() => {
    const days = getNextPublishDays(3, settings.closedDays)
    const scored = suggestions
      .filter(s => s.status === "new")
      .map(s => ({ ...s, _cv: computeCustomerValue(s) }))
    const webPool = scored.filter(s => s.content?.source === "website").sort((a, b) => b._cv.customerValue - a._cv.customerValue)
    const igPool = scored.filter(s => s.content?.source === "instagram").sort((a, b) => b._cv.customerValue - a._cv.customerValue)
    const fbPool = scored.filter(s => s.content?.source === "facebook").sort((a, b) => b._cv.customerValue - a._cv.customerValue)
    let webIdx = 0, igIdx = 0, fbIdx = 0
    const usedStores = new Set()
    return days.map((day, dayIndex) => {
      const items = []
      const dayStores = new Set()
      let webAdded = 0
      let webScan = webIdx
      while (webAdded < settings.webPerDay && webScan < webPool.length) {
        const s = webPool[webScan]
        const storeName = s.stores?.name
        if (!dayStores.has(storeName)) {
          items.push({ ...s, channel: "web" })
          dayStores.add(storeName); usedStores.add(storeName); webAdded++
          webPool.splice(webScan, 1)
        } else { webScan++ }
      }
      if (dayIndex % settings.igEveryNDays === 0) {
        let igScan = igIdx
        while (igScan < igPool.length) {
          const s = igPool[igScan]
          const storeName = s.stores?.name
          if (!dayStores.has(storeName)) {
            items.push({ ...s, channel: "instagram" })
            dayStores.add(storeName); igPool.splice(igScan, 1); break
          }
          igScan++
        }
      }
      if (dayIndex % settings.fbEveryNDays === 0) {
        let fbScan = fbIdx
        while (fbScan < fbPool.length) {
          const s = fbPool[fbScan]
          const storeName = s.stores?.name
          if (!dayStores.has(storeName)) {
            items.push({ ...s, channel: "facebook" })
            dayStores.add(storeName); fbPool.splice(fbScan, 1); break
          }
          fbScan++
        }
      }
      return { date: day, items }
    })
  }, [suggestions, settings])

  const totalPlanned = plan.reduce((sum, d) => sum + d.items.length, 0)

  function formatDay(d) {
    return d.toLocaleDateString("no-NO", { weekday: "long", day: "numeric", month: "long" })
  }

  function channelBadge(ch) {
    if (ch === "web") return { label: "🌐 Nettside", bg: "#D6C7FF", color: "#360817" }
    if (ch === "instagram") return { label: "📷 Instagram", bg: "#FAE4FB", color: "#360817" }
    return { label: "💬 Facebook", bg: "#E7E1E3", color: "#360817" }
  }

  if (!showPlan) {
    return (
      <div className="mb-8 flex items-center justify-between px-5 py-4"
        style={{ background: "white", borderRadius: "14px", border: "1px solid #E7E1E3" }}>
        <div className="flex items-center gap-2">
          <span className="text-base">{"📅"}</span>
          <span className="text-sm font-medium" style={{ color: "#360817" }}>Publiseringsplan</span>
          <span className="text-xs" style={{ color: "#360817", opacity: 0.4 }}>({totalPlanned} anbefalinger neste 3 dager)</span>
        </div>
        <button onClick={() => setShowPlan(true)} className="text-xs font-medium" style={{ color: "#9333ea" }}>Vis plan</button>
      </div>
    )
  }

  return (
    <>
      <div className="mb-8 overflow-hidden" style={{ background: "white", borderRadius: "14px", border: "1px solid #E7E1E3" }}>
        <div className="px-6 py-5 flex items-center justify-between" style={{ borderBottom: "1px solid #E7E1E3" }}>
          <div>
            <h2 className="text-lg" style={{ fontFamily: "var(--font-heading, 'DM Serif Display'), Georgia, serif", color: "#360817" }}>
              {"📅"} Publiseringsplan
            </h2>
            <p className="text-xs mt-1" style={{ color: "#360817", opacity: 0.5 }}>
              {totalPlanned} anbefalte publiseringer neste 3 dager — sortert etter kundeverdi
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowSettings(!showSettings)}
              className="px-4 py-2 text-xs font-medium transition-all duration-200"
              style={{ borderRadius: "6px", background: showSettings ? "#D6C7FF" : "#F9F5FA", color: "#360817", border: "1px solid #E7E1E3" }}>
              {"⚙️"} Innstillinger
            </button>
            <button onClick={() => setShowPlan(false)}
              className="px-3 py-2 text-xs transition-all duration-200"
              style={{ color: "#360817", opacity: 0.4 }}>
              Skjul
            </button>
          </div>
        </div>

        {showSettings && (
          <div className="px-6 py-5" style={{ background: "#F9F5FA", borderBottom: "1px solid #E7E1E3" }}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#360817", opacity: 0.7 }}>Web-artikler per dag</label>
                <select value={settings.webPerDay} onChange={e => setSettings(p => ({ ...p, webPerDay: +e.target.value }))}
                  className="w-full px-3 py-2 text-sm" style={{ borderRadius: "6px", border: "1px solid #E7E1E3", background: "white", color: "#360817" }}>
                  {[0, 1, 2, 3, 4, 5].map(n => (<option key={n} value={n}>{n}</option>))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#360817", opacity: 0.7 }}>Instagram-poster</label>
                <select value={settings.igEveryNDays} onChange={e => setSettings(p => ({ ...p, igEveryNDays: +e.target.value }))}
                  className="w-full px-3 py-2 text-sm" style={{ borderRadius: "6px", border: "1px solid #E7E1E3", background: "white", color: "#360817" }}>
                  <option value={1}>Hver dag</option>
                  <option value={2}>Annenhver dag</option>
                  <option value={3}>Hver 3. dag</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#360817", opacity: 0.7 }}>Facebook-poster</label>
                <select value={settings.fbEveryNDays} onChange={e => setSettings(p => ({ ...p, fbEveryNDays: +e.target.value }))}
                  className="w-full px-3 py-2 text-sm" style={{ borderRadius: "6px", border: "1px solid #E7E1E3", background: "white", color: "#360817" }}>
                  <option value={1}>Hver dag</option>
                  <option value={2}>Annenhver dag</option>
                  <option value={3}>Hver 3. dag</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1.5" style={{ color: "#360817", opacity: 0.7 }}>Stengte dager</label>
                <div className="flex gap-1 flex-wrap mt-0.5">
                  {DAYS_SHORT.map((d, i) => (
                    <button key={i} onClick={() => setSettings(p => ({
                      ...p, closedDays: p.closedDays.includes(i) ? p.closedDays.filter(x => x !== i) : [...p.closedDays, i]
                    }))}
                      className="px-2 py-1 text-[10px] font-medium transition-all duration-200"
                      style={{
                        borderRadius: "4px",
                        background: settings.closedDays.includes(i) ? "#360817" : "white",
                        color: settings.closedDays.includes(i) ? "#FAE4FB" : "#360817",
                        border: settings.closedDays.includes(i) ? "1px solid #360817" : "1px solid #E7E1E3",
                      }}>
                      {d}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3" style={{ borderTop: "none" }}>
          {plan.map(({ date, items }, di) => (
            <div key={di} className="p-5" style={{ borderRight: di < 2 ? "1px solid #E7E1E3" : "none" }}>
              <p className="text-sm font-medium capitalize mb-4" style={{ color: "#360817", fontFamily: "var(--font-heading, 'DM Serif Display'), Georgia, serif" }}>
                {formatDay(date)}
              </p>
              {items.length === 0 ? (
                <p className="text-xs italic py-6 text-center" style={{ color: "#360817", opacity: 0.3 }}>Ingen planlagt</p>
              ) : (
                <div className="space-y-3">
                  {items.map((item, ii) => {
                    const badge = channelBadge(item.channel)
                    const cv = item._cv
                    return (
                      <div key={ii}
                        className="p-3.5 transition-all duration-200 hover:shadow-md cursor-pointer"
                        style={{
                          borderRadius: "10px",
                          background: cv.isUrgent ? "#FAFFED" : "#F9F5FA",
                          border: cv.isUrgent ? "1px solid #D4FF66" : "1px solid #E7E1E3",
                        }}
                        onClick={() => setSelectedItem(item)}>
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="text-[10px] px-2 py-0.5 font-medium whitespace-nowrap"
                            style={{ borderRadius: "10px", background: badge.bg, color: badge.color }}>
                            {badge.label}
                          </span>
                          <span className="text-[10px] font-medium truncate" style={{ color: "#360817", opacity: 0.5 }}>
                            {item.stores?.name}
                          </span>
                          <span className="ml-auto text-[10px] font-bold" style={{ color: "#16a34a" }}>
                            {cv.customerValue}
                          </span>
                        </div>
                        <p className="text-xs leading-relaxed mb-2" style={{ color: "#360817", opacity: 0.8, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                          {(typeof item.suggested_text === 'string' ? item.suggested_text : item.suggested_text?.website || item.suggested_text?.instagram || item.suggested_text?.facebook) || item.content?.original_text?.substring(0, 120)}
                        </p>
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-medium" style={{ color: cv.isUrgent ? "#92400E" : "#9333ea" }}>
                            {cv.isUrgent ? "⚡ " : "→ "}{cv.topReason}
                          </p>
                          <span className="text-[10px] font-medium" style={{ color: "#9333ea", opacity: 0.7 }}>
                            Vis detaljer →
                          </span>
                        </div>
                        {item.content?.image_urls?.[0] && (
                          <img src={item.content.image_urls[0]} alt="" className="mt-2.5 w-full h-20 object-cover" style={{ borderRadius: "8px" }} />
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {selectedItem && (
        <ItemDetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
    </>
  )
}
