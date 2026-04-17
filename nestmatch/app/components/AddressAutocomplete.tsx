"use client"
import { useState, useRef, useEffect } from "react"

/**
 * Autocomplete d'adresse via la Base Adresse Nationale (api-adresse.data.gouv.fr).
 * Gratuit, sans clé, rate-limit raisonnable (50 req/s IP).
 *
 * Retourne par onSelect l'adresse complète + ville + code postal + coords GPS
 * pour que le form parent puisse renseigner d'autres champs automatiquement.
 */

interface AddressResult {
  label: string      // adresse complète affichée (ex: "6 Rue de Rivoli 75001 Paris")
  street: string     // rue uniquement (ex: "6 Rue de Rivoli")
  city: string       // ville (ex: "Paris")
  postcode: string   // code postal
  lat: number | null
  lng: number | null
}

interface Props {
  value: string
  onChange: (v: string) => void
  /** Callback optionnel quand l'user sélectionne une adresse de la liste — permet au parent de remplir ville etc. */
  onSelect?: (a: AddressResult) => void
  /** Filtre sur une ville précise (limite les suggestions à cette ville) */
  city?: string
  placeholder?: string
  required?: boolean
  style?: React.CSSProperties
  id?: string
}

export default function AddressAutocomplete({ value, onChange, onSelect, city, placeholder, required, style, id }: Props) {
  const [query, setQuery] = useState(value)
  const [suggestions, setSuggestions] = useState<AddressResult[]>([])
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [loading, setLoading] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)
  const lastQuery = useRef<string>("")

  useEffect(() => { setQuery(value) }, [value])

  // Fetch debounced
  useEffect(() => {
    if (!query || query.trim().length < 3) { setSuggestions([]); return }
    if (query === lastQuery.current) return
    let cancelled = false
    const timer = setTimeout(async () => {
      lastQuery.current = query
      setLoading(true)
      try {
        const params = new URLSearchParams({ q: query, limit: "6", autocomplete: "1" })
        const res = await fetch(`https://api-adresse.data.gouv.fr/search/?${params.toString()}`)
        const data = await res.json()
        if (cancelled) return
        const raw = Array.isArray(data?.features) ? data.features : []
        const parsed: AddressResult[] = raw.map((f: any) => {
          const p = f.properties || {}
          const coords = f.geometry?.coordinates || [null, null]
          return {
            label: p.label || "",
            street: p.name || "",
            city: p.city || p.municipality || "",
            postcode: p.postcode || "",
            lat: coords[1] ?? null,
            lng: coords[0] ?? null,
          }
        }).filter((a: AddressResult) => a.label)
        // Filtre optionnel par ville
        const filtered = city
          ? parsed.filter(a => a.city.toLowerCase() === city.toLowerCase() || a.city.toLowerCase().includes(city.toLowerCase()))
          : parsed
        setSuggestions(filtered.length > 0 ? filtered : parsed)
      } catch {
        setSuggestions([])
      }
      setLoading(false)
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [query, city])

  // Fermeture clic extérieur
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handle)
    return () => document.removeEventListener("mousedown", handle)
  }, [])

  function pick(a: AddressResult) {
    onChange(a.label)
    setQuery(a.label)
    setOpen(false)
    if (onSelect) onSelect(a)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHighlight(h => Math.min(h + 1, suggestions.length - 1)) }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight(h => Math.max(h - 1, 0)) }
    else if (e.key === "Enter" && open && suggestions[highlight]) { e.preventDefault(); pick(suggestions[highlight]) }
    else if (e.key === "Escape") { setOpen(false) }
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
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); setHighlight(0) }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder || "Ex : 6 rue de Rivoli"}
        required={required}
        autoComplete="off"
        style={{ ...defaultStyle, ...style }}
      />
      {open && (suggestions.length > 0 || loading) && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 4px)",
          left: 0,
          right: 0,
          background: "white",
          border: "1.5px solid #e5e7eb",
          borderRadius: 10,
          maxHeight: 280,
          overflowY: "auto",
          zIndex: 100,
          boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
        }}>
          {loading && suggestions.length === 0 && (
            <div style={{ padding: "12px 14px", fontSize: 13, color: "#9ca3af" }}>Recherche d&apos;adresses…</div>
          )}
          {suggestions.map((a, i) => (
            <div
              key={i}
              onMouseDown={e => { e.preventDefault(); pick(a) }}
              onMouseEnter={() => setHighlight(i)}
              style={{
                padding: "10px 14px",
                cursor: "pointer",
                fontSize: 14,
                background: i === highlight ? "#f3f4f6" : "white",
                color: "#111",
                fontFamily: "'DM Sans', sans-serif",
                borderBottom: i < suggestions.length - 1 ? "1px solid #f9fafb" : "none",
              }}
            >
              <p style={{ margin: 0, fontWeight: 600 }}>{a.street || a.label}</p>
              <p style={{ margin: 0, fontSize: 12, color: "#6b7280" }}>
                {a.postcode}{a.postcode && a.city ? " · " : ""}{a.city}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
