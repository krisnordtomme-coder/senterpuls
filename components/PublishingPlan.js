"use client"
import { useState, useMemo } from "react"

const DAYS_SHORT = ["Søn", "Man", "Tir", "Ons", "Tor", "Fre", "Lør"]

function getNextPublishDays(count, closedDays) {
  const days = []
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 1)
  while (days.length < count) {
    if (!closedDays.includes(d.getDay())) {
      days.push(new Date(d))
    }
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

  return {
    customerValue: Math.min(baseScore + boost, 100),
    topReason,
    reasons,
    isUrgent: hasDeadline || hasEvent,
    hasImage
  }
}

export default function PublishingPlan({ suggestions }) {
  const [showSettings, setShowSettings] = useState(false)
  const [showPlan, setShowPlan] = useState(true)
  const [settings, setSettings] = useState({
    webPerDay: 2,
    igEveryNDays: 2,
    fbEveryNDays: 2,
    closedDays: [0],
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
          dayStores.add(storeName)
          usedStores.add(storeName)
          webAdded++
          webPool.splice(webScan, 1)
        } else {
          webScan++
        }
      }

      if (dayIndex % settings.igEveryNDays === 0) {
        let igScan = igIdx
        while (igScan < igPool.length) {
          const s = igPool[igScan]
          const storeName = s.stores?.name
          if (!dayStores.has(storeName)) {
            items.push({ ...s, channel: "instagram" })
            dayStores.add(storeName)
            igPool.splice(igScan, 1)
            break
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
            dayStores.add(storeName)
            fbPool.splice(fbScan, 1)
            break
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
    if (ch === "web") return { label: "\u{1F310} Nettside", bg: "#dbeafe", color: "#1d4ed8" }
    if (ch === "instagram") return { label: "\u{1F4F7} Instagram", bg: "#fce7f3", color: "#be185d" }
    return { label: "\u{1F4AC} Facebook", bg: "#ddd6fe", color: "#7c3aed" }
  }

  if (!showPlan) {
    return (
      <div className="mb-6 bg-white rounded-xl border border-gray-200 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-base">{"📅"}</span>
          <span className="text-sm font-medium text-gray-700">Publiseringsplan</span>
          <span className="text-xs text-gray-400">({totalPlanned} anbefalinger neste 3 dager)</span>
        </div>
        <button onClick={() => setShowPlan(true)} className="text-xs text-blue-600 hover:text-blue-800">Vis plan</button>
      </div>
    )
  }

  return (
    <div className="mb-6 bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">{"\u{1F4C5}"} Publiseringsplan</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            {totalPlanned} anbefalte publiseringer neste 3 dager \u2014 sortert etter kundeverdi
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowSettings(!showSettings)} className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600 transition">
            {"\u2699\uFE0F"} Innstillinger
          </button>
          <button onClick={() => setShowPlan(false)} className="px-2 py-1.5 text-xs text-gray-400 hover:text-gray-600">
            Skjul
          </button>
        </div>
      </div>

      {showSettings && (
        <div className="px-5 py-4 bg-gray-50 border-b border-gray-100">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Web-artikler per dag</label>
              <select value={settings.webPerDay} onChange={e => setSettings(p => ({ ...p, webPerDay: +e.target.value }))} className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md bg-white">
                {[0, 1, 2, 3, 4, 5].map(n => (<option key={n} value={n}>{n}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Instagram-poster</label>
              <select value={settings.igEveryNDays} onChange={e => setSettings(p => ({ ...p, igEveryNDays: +e.target.value }))} className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md bg-white">
                <option value={1}>Hver dag</option>
                <option value={2}>Annenhver dag</option>
                <option value={3}>Hver 3. dag</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Facebook-poster</label>
              <select value={settings.fbEveryNDays} onChange={e => setSettings(p => ({ ...p, fbEveryNDays: +e.target.value }))} className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded-md bg-white">
                <option value={1}>Hver dag</option>
                <option value={2}>Annenhver dag</option>
                <option value={3}>Hver 3. dag</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Stengte dager</label>
              <div className="flex gap-1 flex-wrap mt-1">
                {DAYS_SHORT.map((d, i) => (
                  <button key={i} onClick={() => setSettings(p => ({ ...p, closedDays: p.closedDays.includes(i) ? p.closedDays.filter(x => x !== i) : [...p.closedDays, i] }))}
                    className={`px-1.5 py-0.5 text-[10px] rounded transition ${settings.closedDays.includes(i) ? "bg-red-100 text-red-700 border border-red-200" : "bg-white text-gray-500 border border-gray-200 hover:bg-gray-50"}`}>
                    {d}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-gray-100">
        {plan.map(({ date, items }, di) => (
          <div key={di} className="p-4">
            <p className="text-sm font-medium text-gray-800 capitalize mb-3">
              {formatDay(date)}
            </p>
            {items.length === 0 ? (
              <p className="text-xs text-gray-400 italic py-4 text-center">Ingen planlagt</p>
            ) : (
              <div className="space-y-2.5">
                {items.map((item, ii) => {
                  const badge = channelBadge(item.channel)
                  const cv = item._cv
                  return (
                    <div key={ii} className={`rounded-lg border p-3 transition ${cv.isUrgent ? "border-amber-200 bg-amber-50" : "border-gray-100 bg-gray-50"}`}>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap" style={{ background: badge.bg, color: badge.color }}>
                          {badge.label}
                        </span>
                        <span className="text-[10px] text-gray-500 font-medium truncate">
                          {item.stores?.name}
                        </span>
                        <span className="ml-auto text-[10px] font-bold text-green-600">
                          {cv.customerValue}
                        </span>
                      </div>
                      <p className="text-xs text-gray-700 line-clamp-2 mb-1.5">
                        {(typeof item.suggested_text === 'string' ? item.suggested_text : item.suggested_text?.website || item.suggested_text?.instagram || item.suggested_text?.facebook) || item.content?.original_text?.substring(0, 120)}
                      </p>
                      <p className="text-[10px] text-amber-700 font-medium">
                        {cv.isUrgent ? "\u26A1 " : "\u2192 "}
                        {cv.topReason}
                      </p>
                      {item.content?.image_urls?.[0] && (
                        <img src={item.content.image_urls[0]} alt="" className="mt-2 w-full h-20 object-cover rounded" />
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

