"use client"
import { useState, useRef, useEffect } from "react"
import { CITY_NAMES, normalizeCityKey } from "../../lib/cityCoords"

/**
 * Combobox de sélection de ville/commune française.
 *
 * - Recherche par NOM (« paris », « saint-é… ») : API `communes?nom=…`
 * - Recherche par CODE POSTAL (« 75001 », « 13 » → prefix) : API `communes?codePostal=…`
 * - Toutes les 35 000 communes FR via geo.api.gouv.fr (gratuit, sans clé)
 * - Fallback local `CITY_NAMES` pour les suggestions vides (rapide au focus)
 * - Affiche le code postal dans chaque suggestion
 * - Stocke le nom de la ville uniquement (pas le CP) dans `value` pour compat
 * - Callback optionnel `onSelect` pour récupérer le CP si le parent en a besoin
 */

export interface CityResult {
  nom: string
  codePostal: string
}

interface Props {
  value: string
  onChange: (ville: string) => void
  onSelect?: (c: CityResult) => void
  placeholder?: string
  required?: boolean
  style?: React.CSSProperties
  id?: string
}

interface Suggestion {
  nom: string
  codePostaux: string[]
}

// Utilise normalizeCityKey de lib/cityCoords pour cohérence avec le reste du code
const normalize = normalizeCityKey

function isNumericQuery(q: string): boolean {
  return /^\d+$/.test(q.trim())
}

function displayCP(codes: string[]): string {
  if (codes.length === 0) return ""
  if (codes.length === 1) return codes[0]
  // Paris : 75001-75020
  const sorted = [...codes].sort()
  return `${sorted[0]}–${sorted[sorted.length - 1]}`
}

export default function CityAutocomplete({ value, onChange, onSelect, placeholder, required, style, id }: Props) {
  const [query, setQuery] = useState(value)
  const [open, setOpen] = useState(false)
  const [highlight, setHighlight] = useState(0)
  const [remote, setRemote] = useState<Suggestion[]>([])
  const [loading, setLoading] = useState(false)
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
  }, [])

  const trimmed = query.trim()
  const qNorm = normalize(trimmed)

  // Au focus (champ vide), on propose les plus grandes villes FR en tête pour
  // guider l'utilisateur sans pour autant "sélectionner" Paris par défaut.
  // Ces suggestions disparaissent dès qu'il tape un caractère.
  const TOP_CITIES = [
    "Paris", "Lyon", "Marseille", "Toulouse", "Nice", "Nantes",
    "Montpellier", "Strasbourg", "Bordeaux", "Lille", "Rennes", "Reims",
  ]
  const localFallback: Suggestion[] = TOP_CITIES.map(nom => ({ nom, codePostaux: [] }))

  // Recherche distante : par code postal (numérique) ou par nom
  useEffect(() => {
    if (trimmed.length < 2) { setRemote([]); return }
    let cancelled = false
    setLoading(true)
    const timer = setTimeout(async () => {
      try {
        const numeric = isNumericQuery(trimmed)
        const param = numeric ? `codePostal=${encodeURIComponent(trimmed)}` : `nom=${encodeURIComponent(trimmed)}`
        const url = `https://geo.api.gouv.fr/communes?${param}&fields=nom,codesPostaux&boost=population&limit=15`
        const res = await fetch(url)
        const data = await res.json()
        if (cancelled) return
        const parsed: Suggestion[] = Array.isArray(data)
          ? data.map((c: any) => ({
              nom: c.nom || "",
              codePostaux: Array.isArray(c.codesPostaux) ? c.codesPostaux : [],
            })).filter((s: Suggestion) => s.nom)
          : []
        setRemote(parsed)
      } catch {
        if (!cancelled) setRemote([])
      }
      if (!cancelled) setLoading(false)
    }, 200)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [trimmed])

  // Fusion locale + distante en dédupliquant par nom normalisé
  const suggestions: Suggestion[] = (() => {
    if (!trimmed) return localFallback
    if (remote.length > 0) return remote.slice(0, 15)
    // Si pas encore de réponse distante, proposer les villes locales qui matchent
    const localMatches = CITY_NAMES
      .filter(n => normalize(n).includes(qNorm))
      .slice(0, 8)
      .map(n => ({ nom: n, codePostaux: [] }))
    return localMatches
  })()

  function select(s: Suggestion) {
    onChange(s.nom)
    setQuery(s.nom)
    setOpen(false)
    if (onSelect) {
      onSelect({
        nom: s.nom,
        codePostal: s.codePostaux[0] || "",
      })
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setOpen(true)
      setHighlight(h => Math.min(h + 1, suggestions.length - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setHighlight(h => Math.max(h - 1, 0))
    } else if (e.key === "Enter") {
      if (open && suggestions[highlight]) {
        e.preventDefault()
        select(suggestions[highlight])
      }
    } else if (e.key === "Escape") {
      setOpen(false)
    }
  }

  const defaultStyle: React.CSSProperties = {
    width: "100%",
    padding: "11px 14px",
    border: "1px solid #EAE6DF",
    borderRadius: 10,
    fontSize: 14,
    outline: "none",
    boxSizing: "border-box",
    fontFamily: "inherit",
    background: "white",
    color: "#111",
  }

  const showEmpty = open && trimmed.length >= 2 && suggestions.length === 0 && !loading

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
        placeholder={placeholder || "Ville ou code postal"}
        required={required}
        autoComplete="off"
        inputMode={isNumericQuery(trimmed) ? "numeric" : "text"}
        style={{ ...defaultStyle, ...style }}
      />
      {open && suggestions.length > 0 && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 4px)",
          left: 0,
          right: 0,
          background: "white",
          border: "1px solid #EAE6DF",
          borderRadius: 10,
          maxHeight: 280,
          overflowY: "auto",
          zIndex: 100,
          boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
        }}>
          {suggestions.map((s, i) => (
            <div
              key={`${s.nom}-${i}`}
              onMouseDown={e => { e.preventDefault(); select(s) }}
              onMouseEnter={() => setHighlight(i)}
              style={{
                padding: "10px 14px",
                cursor: "pointer",
                fontSize: 14,
                background: i === highlight ? "#F7F4EF" : "white",
                color: "#111",
                fontFamily: "'DM Sans', sans-serif",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 10,
                borderBottom: i < suggestions.length - 1 ? "1px solid #F7F4EF" : "none",
              }}
            >
              <span style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {s.nom}
              </span>
              {s.codePostaux.length > 0 && (
                <span style={{ fontSize: 12, color: "#8a8477", fontWeight: 500, flexShrink: 0 }}>
                  {displayCP(s.codePostaux)}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {showEmpty && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 4px)",
          left: 0,
          right: 0,
          background: "white",
          border: "1px solid #EAE6DF",
          borderRadius: 10,
          zIndex: 100,
          padding: "12px 14px",
          fontSize: 13,
          color: "#8a8477",
          boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
        }}>
          Aucune commune trouvée. {isNumericQuery(trimmed) ? "Vérifiez le code postal." : "Essayez un autre nom ou un code postal."}
        </div>
      )}
      {open && loading && suggestions.length === 0 && trimmed.length >= 2 && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 4px)",
          left: 0,
          right: 0,
          background: "white",
          border: "1px solid #EAE6DF",
          borderRadius: 10,
          zIndex: 100,
          padding: "12px 14px",
          fontSize: 13,
          color: "#8a8477",
          boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
        }}>
          Recherche…
        </div>
      )}
    </div>
  )
}
