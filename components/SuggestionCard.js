"use client"
import { useState } from "react"

const CAT_STYLES = {
  kampanje: { bg: "bg-red-50", text: "text-red-700" },
  produktlansering: { bg: "bg-blue-50", text: "text-blue-700" },
  event: { bg: "bg-purple-50", text: "text-purple-700" },
  sesong: { bg: "bg-amber-50", text: "text-amber-700" },
  baerekraft: { bg: "bg-emerald-50", text: "text-emerald-700" },
  nyhet: { bg: "bg-gray-100", text: "text-gray-700" },
}

const CAT_LABELS = {
  kampanje: "Kampanje",
  produktlansering: "Produktlansering",
  event: "Event",
  sesong: "Sesong",
  baerekraft: "Bærekraft",
  nyhet: "Nyhet",
}

const SOURCE_BADGE = {
  instagram: { bg: "bg-pink-50", text: "text-pink-600", label: "Instagram" },
  facebook: { bg: "bg-blue-50", text: "text-blue-600", label: "Facebook" },
  website: { bg: "bg-gray-50", text: "text-gray-500", label: "Nettside" },
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
    } catch {
      window.open(imageUrl, "_blank")
    }
  }

  if (isDismissed) return null

  return (
    <>
      <div className={`bg-white rounded-xl border border-gray-100 overflow-hidden transition ${isPublished ? "opacity-60" : ""}`}>
        <div className="flex">
          <div className="flex-shrink-0 w-28 min-h-[7rem] bg-gray-50 relative">
            {hasImage ? (
              <img
                src={imageUrl}
                alt={store?.name || ""}
                className="w-28 h-full object-cover cursor-pointer hover:opacity-90 transition"
                style={{ aspectRatio: "1/1", maxHeight: "10rem" }}
                onClick={() => setShowLightbox(true)}
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="w-28 h-full flex items-center justify-center text-gray-300">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0 p-4">
            <div className="flex items-start gap-3 mb-3">
              <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 text-xs font-semibold flex-shrink-0">
                {store?.name?.substring(0, 2).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{store?.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${cat.bg} ${cat.text}`}>{CAT_LABELS[s.category] || s.category}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${srcBadge.bg} ${srcBadge.text}`}>{srcBadge.label}</span>
                </div>
                <p className="text-xs text-gray-400">{new Date(s.created_at).toLocaleDateString("no-NO")}</p>
              </div>
              <span className={`text-sm font-semibold flex-shrink-0 ${s.relevance_score >= 80 ? "text-green-600" : s.relevance_score >= 60 ? "text-amber-600" : "text-gray-400"}`}>{s.relevance_score}/100</span>
            </div>

            <p className="text-sm text-gray-600 mb-2 leading-relaxed">{content?.original_text}</p>

            <div className="flex items-center gap-3 mb-3">
              {sourceUrl && (
                <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                  Se kilde
                </a>
              )}
              {hasImage && (
                <button onClick={downloadImage} className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                  Last ned bilde
                </button>
              )}
            </div>

            <button onClick={() => setExpanded(!expanded)} className="text-xs text-blue-600 hover:text-blue-700 mb-2 block">
              {expanded ? "Skjul AI-forslag" : "Vis AI-forslag"}
            </button>

            {expanded && (
              <div className="bg-gray-50 rounded-lg p-3 mb-3 space-y-3">
                {Object.entries(channels).map(([ch, text]) => (
                  <div key={ch}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-500 uppercase">{ch}</span>
                      <button onClick={() => copyText(ch, text)} className="text-xs text-blue-500 hover:text-blue-700">
                        {copied === ch ? "Kopiert!" : "Kopier"}
                      </button>
                    </div>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{text}</p>
                  </div>
                ))}
              </div>
            )}

            {!isPublished && (
              <div className="flex gap-2 pt-1">
                <button onClick={() => onUpdateStatus(s.id, "published")} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition">Godkjenn og publiser</button>
                <button onClick={() => onUpdateStatus(s.id, "dismissed")} className="px-3 py-1.5 text-gray-400 text-xs rounded-lg hover:bg-gray-100 transition">Avvis</button>
              </div>
            )}
            {isPublished && <span className="text-xs text-green-600 font-medium">\u2713 Publisert</span>}
          </div>
        </div>
      </div>

      {showLightbox && hasImage && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setShowLightbox(false)}>
          <div className="relative max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img src={imageUrl} alt={store?.name || ""} className="max-w-full max-h-[85vh] object-contain rounded-lg" />
            <div className="absolute top-3 right-3 flex gap-2">
              <button onClick={downloadImage} className="bg-white/90 hover:bg-white text-gray-700 rounded-full p-2 shadow-lg transition" title="Last ned">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
              </button>
              <button onClick={() => setShowLightbox(false)} className="bg-white/90 hover:bg-white text-gray-700 rounded-full p-2 shadow-lg transition" title="Lukk">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <p className="text-white/70 text-sm text-center mt-2">{store?.name}</p>
          </div>
        </div>
      )}
    </>
  )
}
