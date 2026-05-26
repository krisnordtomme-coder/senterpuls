"use client"
import { useState } from "react"

const CAT_STYLES = {
  kampanje: { bg: "#FEE2E2", text: "#991B1B" },
  produktlansering: { bg: "#D6C7FF", text: "#5B21B6" },
  event: { bg: "#FAE4FB", text: "#86198F" },
  sesong: { bg: "#FEF3C7", text: "#92400E" },
  baerekraft: { bg: "#D1FAE5", text: "#065F46" },
  nyhet: { bg: "#E7E1E3", text: "#360817" },
}
const CAT_LABELS = {
  kampanje: "Kampanje", produktlansering: "Produktlansering", event: "Event",
  sesong: "Sesong", baerekraft: "Bærekraft", nyhet: "Nyhet",
}
const SOURCE_BADGE = {
  instagram: { bg: "#FAE4FB", text: "#86198F", label: "Instagram" },
  facebook: { bg: "#D6C7FF", text: "#5B21B6", label: "Facebook" },
  website: { bg: "#E7E1E3", text: "#360817", label: "Nettside" },
}

function formatDate(dateStr) {
  if (!dateStr) return null
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  return d.toLocaleDateString("no-NO", { day: "numeric", month: "short", year: "numeric" })
}

export default function SuggestionCard({ suggestion, onUpdateStatus }) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(null)
  const [imgError, setImgError] = useState(false)
  const [showLightbox, setShowLightbox] = useState(false)
  const s = suggestion
  const store = s.stores
  const content = s.content
  const cat = CAT_STYLES[s.category] || CAT_STYLES.nyhet
  const channels = s.suggested_text || {}
  const isPublished = s.status === "published"
  const isDismissed = s.status === "dismissed"
  const imageUrl = content?.image_urls?.[0]
  const sourceUrl = content?.original_url
  const hasImage = imageUrl && !imgError
  const contentSource = content?.source || "website"
  const srcBadge = SOURCE_BADGE[contentSource] || SOURCE_BADGE.website
  const postedAt = content?.posted_at
  const displayDate = formatDate(postedAt) || new Date(s.created_at).toLocaleDateString("no-NO")
  const dateLabel = postedAt ? "Publisert" : ""

  function copyText(channel, text) {
    navigator.clipboard.writeText(text)
    setCopied(channel)
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

  if (isDismissed) return null

  return (
    <>
      <div className="overflow-hidden transition-all duration-200 hover:shadow-md"
        style={{ background: "white", borderRadius: "14px", border: "1px solid #E7E1E3", opacity: isPublished ? 0.6 : 1 }}>
        <div className="flex">
          <div className="flex-shrink-0 w-28 min-h-[7rem] relative" style={{ background: "#F9F5FA" }}>
            {hasImage ? (
              <img src={imageUrl} alt={store?.name || ""}
                className="w-28 h-full object-cover cursor-pointer transition-all duration-200 hover:opacity-90"
                style={{ aspectRatio: "1/1", maxHeight: "10rem" }}
                onClick={() => setShowLightbox(true)} onError={() => setImgError(true)} />
            ) : (
              <div className="w-28 h-full flex items-center justify-center" style={{ color: "#E7E1E3" }}>
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 p-5">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-9 h-9 flex items-center justify-center text-xs font-semibold flex-shrink-0"
                style={{ borderRadius: "10px", background: "#D6C7FF", color: "#360817" }}>
                {store?.name?.substring(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm" style={{ color: "#360817" }}>{store?.name}</span>
                  <span className="text-[10px] px-2.5 py-0.5 font-medium" style={{ borderRadius: "10px", background: cat.bg, color: cat.text }}>
                    {CAT_LABELS[s.category] || s.category}
                  </span>
                  <span className="text-[10px] px-2.5 py-0.5 font-medium" style={{ borderRadius: "10px", background: srcBadge.bg, color: srcBadge.text }}>
                    {srcBadge.label}
                  </span>
                </div>
                <p className="text-xs mt-0.5" style={{ color: "#360817", opacity: 0.4 }}>{dateLabel ? dateLabel + " " : ""}{displayDate}</p>
              </div>
              <span className="text-sm font-semibold flex-shrink-0" style={{ color: s.relevance_score >= 80 ? "#16a34a" : s.relevance_score >= 60 ? "#d97706" : "#9ca3af" }}>
                {s.relevance_score}/100
              </span>
            </div>

            <p className="text-sm leading-relaxed mb-3" style={{ color: "#360817", opacity: 0.7 }}>{content?.original_text}</p>

            <div className="flex items-center gap-3 mb-3">
              {sourceUrl && (
                <a href={sourceUrl} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium transition-all duration-200"
                  style={{ color: "#9333ea" }}>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  Se kilde
                </a>
              )}
              {hasImage && (
                <button onClick={downloadImage}
                  className="inline-flex items-center gap-1 text-xs transition-all duration-200"
                  style={{ color: "#360817", opacity: 0.4 }}>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Last ned bilde
                </button>
              )}
            </div>

            <button onClick={() => setExpanded(!expanded)}
              className="text-xs font-medium mb-3 block transition-all duration-200"
              style={{ color: "#9333ea" }}>
              {expanded ? "Skjul AI-forslag" : "Vis AI-forslag"}
            </button>

            {expanded && (
              <div className="p-4 mb-3 space-y-3" style={{ background: "#F9F5FA", borderRadius: "10px" }}>
                {Object.entries(channels).map(([ch, text]) => (
                  <div key={ch}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium uppercase" style={{ color: "#360817", opacity: 0.5 }}>{ch}</span>
                      <button onClick={() => copyText(ch, text)}
                        className="text-xs font-medium transition-all duration-200"
                        style={{ color: "#9333ea" }}>
                        {copied === ch ? "Kopiert!" : "Kopier"}
                      </button>
                    </div>
                    <p className="text-sm whitespace-pre-wrap" style={{ color: "#360817", opacity: 0.8 }}>{text}</p>
                  </div>
                ))}
              </div>
            )}

            {!isPublished && (
              <div className="flex gap-2 pt-1">
                <button onClick={() => onUpdateStatus(s.id, "published")}
                  className="px-4 py-2 text-xs font-medium transition-all duration-200"
                  style={{ borderRadius: "6px", background: "#360817", color: "#FAE4FB" }}>
                  Godkjenn og publiser
                </button>
                <button onClick={() => onUpdateStatus(s.id, "dismissed")}
                  className="px-4 py-2 text-xs transition-all duration-200"
                  style={{ borderRadius: "6px", color: "#360817", opacity: 0.4, background: "transparent" }}>
                  Avvis
                </button>
              </div>
            )}
            {isPublished && <span className="text-xs font-medium" style={{ color: "#16a34a" }}>{"✓"} Publisert</span>}
          </div>
        </div>
      </div>

      {showLightbox && hasImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(18,18,38,0.85)" }}
          onClick={() => setShowLightbox(false)}>
          <div className="relative max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img src={imageUrl} alt={store?.name || ""} className="max-w-full max-h-[85vh] object-contain" style={{ borderRadius: "14px" }} />
            <div className="absolute top-3 right-3 flex gap-2">
              <button onClick={downloadImage}
                className="p-2 shadow-lg transition-all duration-200"
                style={{ borderRadius: "10px", background: "rgba(255,255,255,0.9)", color: "#360817" }} title="Last ned">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              </button>
              <button onClick={() => setShowLightbox(false)}
                className="p-2 shadow-lg transition-all duration-200"
                style={{ borderRadius: "10px", background: "rgba(255,255,255,0.9)", color: "#360817" }} title="Lukk">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="text-sm text-center mt-2" style={{ color: "rgba(255,255,255,0.6)" }}>{store?.name}</p>
          </div>
        </div>
      )}
    </>
  )
}
