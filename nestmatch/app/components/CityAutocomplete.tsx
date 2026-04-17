"use client"
import { useState, useRef, useEffect } from "react"
import { CITY_NAMES } from "../../lib/cityCoords"

/**
 * Combobox de sélection de ville.
 * - Filtre sur la liste locale `CITY_NAMES` (principales villes FR + cityCoords)
 * - Complète avec l'API officielle geo.api.gouv.fr (toutes les communes françaises)
 *   quand la recherche dépasse 2 caractères et ne match rien localement.
 * Empêche les fautes en exigeant une sélection depuis la liste.
 */
interface Props {
  value: string
  onChange: (ville: string) => void
  placeholder?: string
  required?: boolean
  style?: React.CSSProperties
  id?: string
}

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

export default function CityAutocomplete({ value, onChange, placeholder, required, style, id }: Props) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [remote, setRemote] = useState<string[]>([])
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setQuery(value) }, [value])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [query, value])

  const qNorm = normalize(query)
  const local = query
    ? CITY_NAMES.filter(c => normalize(c).includes(qNorm)).slice(0, 6)
    : CITY_NAMES.slice(0, 8)

  // Complément API gouv : quand local < 6 suggestions et query >= 2 chars
  useEffect(() => {
    if (!query || query.trim().length < 2) { setRemote([]); return }
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`https://geo.api.gouv.fr/communes?nom=${encodeURIComponent(query.trim())}&fields=nom,codesPostaux&boost=population&limit=12`)
        const data = await res.json()
        if (cancelled) return
        const names = Array.isArray(data)
          ? data.map((c: any) => c.nom).filter((n: string) => !local.some(l => normalize(l) === normalize(n)))
          : []
        setRemote(names.slice(0, 8))
      } catch {
        setRemote([])
      }
    }, 250)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [query])

  const filtered = [...local, ...remote].slice(0, 12)

  function select(ville: string) {
    onChange(ville)
    setQuery(ville)
    setOpen(false)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setOpen(true)
      setHighlight(h => Math.min(h + 1, filtered.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlight(h => Math.max(h - 1, 0))
    } else if (e.key === "Enter") {
      if (open && filtered[highlight]) {
        e.preventDefault()
        select(filtered[highlight])
      }
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  const defaultStyle: React.CSSProperties = {
    width: "100%",
    padding: "11px 14px",
    border: "1.5px solid #e5e7eb",
    borderRadius: 10,
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
    background: "white",
    color: "#111",
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", width: "100%" }}>
      <input
        id={id}
        type="text"
        value={query}
        onChange={e => {
          setQuery(e.target.value)
          setOpen(true)
          setHighlight(0)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder || "Tapez une ville..."}
        required={required}
        autoComplete="off"
        style={{ ...defaultStyle, ...style }}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 4px)",
          left: 0,
          right: 0,
          background: "white",
          border: "1.5px solid #e5e7eb",
          borderRadius: 10,
          maxHeight: 240,
          overflowY: "auto",
          zIndex: 100,
          boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
        }}>
          {filtered.map((c, i) => (
            <div
              key={c}
              onMouseDown={e => { e.preventDefault(); select(c) }}
              onMouseEnter={() => setHighlight(i)}
              style={{
                padding: "10px 14px",
                cursor: "pointer",
                fontSize: 14,
                background: i === highlight ? "#f3f4f6" : "white",
                color: "#111",
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              {c}
            </div>
          ))}
        </div>
      )}
      {open && filtered.length === 0 && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 4px)",
          left: 0,
          right: 0,
          background: "white",
          border: "1.5px solid #e5e7eb",
          borderRadius: 10,
          zIndex: 100,
          padding: "12px 14px",
          fontSize: 13,
          color: "#6b7280",
          boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
        }}>
          Aucune ville trouvée. Essayez une autre recherche.
        </div>
      )}
    </div>
  )
}
