"use client"
import { useState, useMemo } from "react"

const DAYS_SHORT = ["Søn", "Man", "Tir", "Ons", "Tor", "Fre", "Lør"]

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

export default function PublishingPlan({ suggestions }) {
  const [showSettings, setShowSettings] = useState(false)
  const [showPlan, setShowPlan] = useState(true)
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
                    <div key={ii} className="p-3.5 transition-all duration-200 hover:shadow-sm"
                      style={{
                        borderRadius: "10px",
                        background: cv.isUrgent ? "#FAFFED" : "#F9F5FA",
                        border: cv.isUrgent ? "1px solid #D4FF66" : "1px solid #E7E1E3",
                      }}>
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
                      <p className="text-[10px] font-medium" style={{ color: cv.isUrgent ? "#92400E" : "#9333ea" }}>
                        {cv.isUrgent ? "⚡ " : "→ "}{cv.topReason}
                      </p>
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
  )
}
