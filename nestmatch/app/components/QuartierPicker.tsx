"use client"

// V7.2 (Paul 2026-04-28) — picker Leaflet pour que le candidat pose un
// marker sur SON quartier favori. Sauvegarde lat/lng + label.
//
// V11.2 (Paul 2026-04-28) — refonte avec input adresse autocomplete
// Nominatim au-dessus de la map. User report : "je peux pas saisir
// d'adresse justement pour mettre ?". Pattern Google Maps search → tape
// "Bastille" → suggestions → click → marker + label remplis. Map reste
// disponible pour fine-tune via drag.

import { useEffect, useRef, useState } from "react"
import dynamic from "next/dynamic"
import { getCityCoords } from "../../lib/cityCoords"

const MapContainer = dynamic(() => import("react-leaflet").then(m => m.MapContainer), { ssr: false })
const TileLayer = dynamic(() => import("react-leaflet").then(m => m.TileLayer), { ssr: false })
const Marker = dynamic(() => import("react-leaflet").then(m => m.Marker), { ssr: false })

interface Props {
  ville?: string
  lat: number | null
  lng: number | null
  label: string | null
  onChange: (next: { lat: number; lng: number; label: string }) => void
  onClear: () => void
  isMobile: boolean
}

const PARIS_DEFAULT: [number, number] = [48.8566, 2.3522]

interface Suggestion {
  display_name: string
  lat: string
  lon: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  address?: any
}

// V11.2 — cache local des dernieres recherches (max 10) pour eviter de
// re-query Nominatim sur backspace+retype.
const SEARCH_CACHE = new Map<string, Suggestion[]>()

function buildShortLabel(s: Suggestion): string {
  const a = s.address || {}
  const quartier = a.suburb || a.neighbourhood || a.city_district || a.borough || a.quarter
  const cityName = a.city || a.town || a.village || ""
  if (quartier) return `${quartier}${cityName ? `, ${cityName}` : ""}`
  // Fallback : 2 premiers segments du display_name
  return s.display_name.split(",").slice(0, 2).map(p => p.trim()).join(", ")
}

export default function QuartierPicker({ ville, lat, lng, label, onChange, onClear, isMobile }: Props) {
  const [open, setOpen] = useState(lat !== null && lng !== null)
  const [resolvedLabel, setResolvedLabel] = useState<string | null>(label)

  // V11.2 — autocomplete state
  const [query, setQuery] = useState("")
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [searching, setSearching] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // Centrage initial : marker existant > coords ville profil > Paris
  const center: [number, number] = (lat !== null && lng !== null)
    ? [lat, lng]
    : (ville ? getCityCoords(ville) ?? PARIS_DEFAULT : PARIS_DEFAULT)

  useEffect(() => { setResolvedLabel(label) }, [label])

  // Autofocus input quand on ouvre la card
  useEffect(() => {
    if (open && inputRef.current && lat === null) {
      const t = setTimeout(() => inputRef.current?.focus(), 100)
      return () => clearTimeout(t)
    }
  }, [open, lat])

  // V11.2 — debounce 300ms autocomplete Nominatim
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.trim().length < 2) {
      setSuggestions([])
      return
    }
    const cached = SEARCH_CACHE.get(query.trim().toLowerCase())
    if (cached) {
      setSuggestions(cached)
      setShowSuggestions(true)
      return
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&countrycodes=fr`,
          { headers: { "Accept-Language": "fr" } }
        )
        if (!res.ok) {
          setSuggestions([])
          return
        }
        const data = await res.json() as Suggestion[]
        const arr = Array.isArray(data) ? data.slice(0, 5) : []
        SEARCH_CACHE.set(query.trim().toLowerCase(), arr)
        // Trim cache to last 10
        if (SEARCH_CACHE.size > 10) {
          const firstKey = SEARCH_CACHE.keys().next().value
          if (firstKey) SEARCH_CACHE.delete(firstKey)
        }
        setSuggestions(arr)
        setShowSuggestions(true)
      } catch {
        setSuggestions([])
      } finally {
        setSearching(false)
      }
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  function selectSuggestion(s: Suggestion) {
    const sLat = Number(s.lat)
    const sLng = Number(s.lon)
    if (!Number.isFinite(sLat) || !Number.isFinite(sLng)) return
    const lbl = buildShortLabel(s)
    setQuery("")
    setSuggestions([])
    setShowSuggestions(false)
    setResolvedLabel(lbl)
    onChange({ lat: sLat, lng: sLng, label: lbl })
  }

  // V7.2 — Reverse-geocode au dragend (label se met a jour). Garde V11.2.
  useEffect(() => {
    if (lat === null || lng === null) return
    if (resolvedLabel && resolvedLabel.length > 0) return
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16&addressdetails=1`, {
          headers: { "Accept-Language": "fr" },
        })
        const data = await res.json()
        const addr = data.address || {}
        const quartier = addr.suburb || addr.neighbourhood || addr.city_district || addr.borough || addr.quarter
        const cityName = addr.city || addr.town || addr.village || ""
        const lbl = quartier ? `${quartier}${cityName ? `, ${cityName}` : ""}` : (data.display_name || "").split(",")[0]
        if (lbl) {
          setResolvedLabel(lbl)
          onChange({ lat, lng, label: lbl })
        }
      } catch { /* swallow */ }
    }, 600)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng])

  if (!open) {
    return (
      <div style={{
        marginTop: 14, padding: "16px 18px",
        background: "#F7F4EF", border: "1px solid #EAE6DF", borderRadius: 14,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: "#111", margin: 0 }}>
              Quartier de prédilection
            </p>
            <p style={{ fontSize: 11, color: "#8a8477", margin: "4px 0 0", lineHeight: 1.5 }}>
              Cherche une adresse ou pose un marker sur ton quartier favori pour scorer la proximité réelle.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            style={{
              background: "#111", color: "#fff", border: "none",
              borderRadius: 999, padding: "10px 18px",
              fontSize: 11, fontWeight: 700, fontFamily: "inherit",
              textTransform: "uppercase" as const, letterSpacing: "0.4px",
              cursor: "pointer", whiteSpace: "nowrap",
              minHeight: 44,
              WebkitTapHighlightColor: "transparent",
              touchAction: "manipulation",
            }}
          >
            Ouvrir
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      marginTop: 14, padding: 14,
      background: "#F7F4EF", border: "1px solid #EAE6DF", borderRadius: 14,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
        <label style={{ fontSize: 13, fontWeight: 600, color: "#111" }}>
          Quartier de prédilection
        </label>
        <span style={{ fontSize: 11, color: "#8a8477" }}>
          {resolvedLabel ? <>📍 <strong style={{ color: "#111" }}>{resolvedLabel}</strong></> : "Cherche un quartier ou drag le marker."}
        </span>
      </div>

      {/* V11.2 — Search input avec autocomplete Nominatim */}
      <div style={{ position: "relative", marginBottom: 10 }}>
        <div style={{ position: "relative" }}>
          <span aria-hidden="true" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "#8a8477", fontSize: 14, pointerEvents: "none" }}>
            🔍
          </span>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true) }}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="Cherche un quartier ou une adresse…"
            style={{
              width: "100%",
              padding: "11px 14px 11px 38px",
              border: "1px solid #EAE6DF",
              borderRadius: 10,
              fontSize: isMobile ? 16 : 14,
              fontFamily: "inherit",
              outline: "none",
              boxSizing: "border-box",
              background: "#fff",
              color: "#111",
            }}
          />
        </div>
        {showSuggestions && (suggestions.length > 0 || searching || (query.trim().length >= 2 && !searching)) && (
          <div style={{
            position: "absolute", top: "100%", left: 0, right: 0,
            marginTop: 4,
            background: "#fff",
            border: "1px solid #EAE6DF",
            borderRadius: 10,
            boxShadow: "0 8px 24px rgba(0,0,0,0.1)",
            zIndex: 50,
            maxHeight: 240,
            overflowY: "auto",
          }}>
            {searching && (
              <div style={{ padding: "10px 14px", fontSize: 12, color: "#8a8477" }}>Recherche…</div>
            )}
            {!searching && suggestions.length === 0 && query.trim().length >= 2 && (
              <div style={{ padding: "10px 14px", fontSize: 12, color: "#8a8477" }}>
                Aucun résultat. Essaie un nom de quartier ou une adresse plus spécifique.
              </div>
            )}
            {suggestions.map((s, i) => (
              <button
                key={`${s.lat}-${s.lon}-${i}`}
                type="button"
                onMouseDown={e => { e.preventDefault(); selectSuggestion(s) }}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left" as const,
                  padding: "10px 14px",
                  background: "transparent",
                  border: "none",
                  borderBottom: i < suggestions.length - 1 ? "1px solid #F0EAE0" : "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: 13,
                  color: "#111",
                  lineHeight: 1.4,
                  WebkitTapHighlightColor: "transparent",
                  minHeight: 44,
                  boxSizing: "border-box",
                }}
              >
                <div style={{ fontWeight: 600 }}>{buildShortLabel(s)}</div>
                <div style={{ fontSize: 11, color: "#8a8477", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {s.display_name}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{
        height: isMobile ? 200 : 260,
        borderRadius: 12,
        overflow: "hidden",
        border: "1px solid #EAE6DF",
      }}>
        <MapContainer
          key={`${center[0]},${center[1]}`}
          center={center}
          zoom={lat !== null ? 14 : 12}
          scrollWheelZoom
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png"
          />
          <Marker
            position={(lat !== null && lng !== null) ? [lat, lng] : center}
            draggable
            eventHandlers={{
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              dragend: (e: any) => {
                const ll = e.target.getLatLng()
                setResolvedLabel(null) // trigger reverse-geocode
                onChange({ lat: ll.lat, lng: ll.lng, label: "" })
              },
            }}
          />
        </MapContainer>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, gap: 8 }}>
        <button
          type="button"
          onClick={() => { onClear(); setResolvedLabel(null); setQuery(""); setSuggestions([]); setOpen(false) }}
          style={{
            background: "transparent", color: "#8a8477", border: "1px solid #EAE6DF",
            borderRadius: 999, padding: "8px 14px",
            fontSize: 11, fontWeight: 600, fontFamily: "inherit",
            cursor: "pointer", whiteSpace: "nowrap",
            minHeight: 44, WebkitTapHighlightColor: "transparent", touchAction: "manipulation",
          }}
        >
          Effacer
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{
            background: "#111", color: "#fff", border: "none",
            borderRadius: 999, padding: "8px 18px",
            fontSize: 11, fontWeight: 700, fontFamily: "inherit",
            textTransform: "uppercase" as const, letterSpacing: "0.4px",
            cursor: "pointer",
            minHeight: 44, WebkitTapHighlightColor: "transparent", touchAction: "manipulation",
          }}
        >
          Replier
        </button>
      </div>
    </div>
  )
}
