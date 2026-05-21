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

export default function SuggestionCard({ suggestion, onUpdateStatus }) {
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(null)
  const [imgError, setImgError] = useState(false)

  const s = suggestion
  const store = s.stores
  const content = s.content
  const cat = CAT_STYLES[s.category] || CAT_STYLES.nyhet
  const channels = s.suggested_text || {}
  const isPublished = s.status === "published"
  const isDismissed = s.status === "dismissed"

  const imageUrl = content?.image_urls?.[0]
  const sourceUrl = content?.original_url

  function copyText(channel, text) {
    navigator.clipboard.writeText(text)
    setCopied(channel)
    setTimeout(() => setCopied(null), 1500)
  }

  if (isDismissed) return null

  return (
    <div className={`bg-white rounded-xl border border-gray-100 overflow-hidden transition ${isPublished ? "opacity-60" : ""}`}>
      {imageUrl && !imgError && (
        <div className="relative w-full h-40 bg-gray-100">
          <img
            src={imageUrl}
            alt={store?.name || ""}
            className="w-full h-40 object-cover"
            onError={() => setImgError(true)}
          />
        </div>
      )}
      <div className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-9 h-9 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 text-xs font-semibold flex-shrink-0">
            {store?.name?.substring(0, 2).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{store?.name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${cat.bg} ${cat.text}`}>{CAT_LABELS[s.category] || s.category}</span>
            </div>
            <p className="text-xs text-gray-400">{content?.source || "nettside"} · {new Date(s.created_at).toLocaleDateString("no-NO")}</p>
          </div>
          <span className={`text-sm font-semibold flex-shrink-0 ${s.relevance_score >= 80 ? "text-green-600" : s.relevance_score >= 60 ? "text-amber-600" : "text-gray-400"}`}>{s.relevance_score}/100</span>
        </div>

        <p className="text-sm text-gray-600 mb-2 leading-relaxed">{content?.original_text}</p>

        {sourceUrl && (
          <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 mb-3">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
            Se kilde
          </a>
        )}

        <button onClick={() => setExpanded(!expanded)} className="text-xs text-blue-600 hover:text-blue-700 mb-2 block">{expanded ? "Skjul AI-forslag" : "Vis AI-forslag"}</button>

        {expanded && <div className="bg-gray-50 rounded-lg p-3 mb-3 space-y-3">{Object.entries(channels).map(([ch, text]) => (
          <div key={ch} className="text-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-gray-500 uppercase">{ch}</span>
              <button onClick={() => copyText(ch, text)} className="text-xs text-blue-600 hover:text-blue-700">{copied === ch ? "Kopiert!" : "Kopier"}</button>
            </div>
            <p className="text-gray-700 leading-relaxed whitespace-pre-wrap">{text}</p>
          </div>
        ))}</div>}

        {!isPublished && <div className="flex gap-2 pt-1">
          <button onClick={() => onUpdateStatus(s.id, "published")} className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg hover:bg-blue-700 transition">Godkjenn og publiser</button>
          <button onClick={() => onUpdateStatus(s.id, "dismissed")} className="px-3 py-1.5 text-gray-400 text-xs rounded-lg hover:bg-gray-100 transition">Avvis</button>
        </div>}

        {isPublished && <span className="text-xs text-green-600 font-medium">✓ Publisert</span>}
      </div>
    </div>
  )
}
