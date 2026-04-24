"use client"
import { useState, useEffect } from "react"

/**
 * Input téléphone international avec sélecteur d'indicatif pays.
 * Stocke la valeur au format "+XX numéro" dans un seul champ.
 * Usage : <PhoneInput value={form.telephone} onChange={v => setForm({...form, telephone: v})} />
 */

interface Country {
  code: string    // indicatif téléphonique (ex: "+33")
  label: string   // label court (ex: "FR")
  name: string    // nom complet (ex: "France")
  flag: string    // emoji drapeau (pas rendu si restriction no-emoji)
}

// Liste courte des indicatifs les plus courants en France
const COUNTRIES: Country[] = [
  { code: "+33",  label: "FR", name: "France",          flag: "🇫🇷" },
  { code: "+32",  label: "BE", name: "Belgique",        flag: "🇧🇪" },
  { code: "+41",  label: "CH", name: "Suisse",          flag: "🇨🇭" },
  { code: "+352", label: "LU", name: "Luxembourg",      flag: "🇱🇺" },
  { code: "+44",  label: "UK", name: "Royaume-Uni",     flag: "🇬🇧" },
  { code: "+49",  label: "DE", name: "Allemagne",       flag: "🇩🇪" },
  { code: "+34",  label: "ES", name: "Espagne",         flag: "🇪🇸" },
  { code: "+39",  label: "IT", name: "Italie",          flag: "🇮🇹" },
  { code: "+351", label: "PT", name: "Portugal",        flag: "🇵🇹" },
  { code: "+31",  label: "NL", name: "Pays-Bas",        flag: "🇳🇱" },
  { code: "+1",   label: "US", name: "Etats-Unis / CA", flag: "🇺🇸" },
  { code: "+212", label: "MA", name: "Maroc",           flag: "🇲🇦" },
  { code: "+213", label: "DZ", name: "Algérie",         flag: "🇩🇿" },
  { code: "+216", label: "TN", name: "Tunisie",         flag: "🇹🇳" },
  { code: "+221", label: "SN", name: "Sénégal",         flag: "🇸🇳" },
  { code: "+225", label: "CI", name: "Côte d'Ivoire",   flag: "🇨🇮" },
  { code: "+237", label: "CM", name: "Cameroun",        flag: "🇨🇲" },
  { code: "+971", label: "AE", name: "Emirats",         flag: "🇦🇪" },
  { code: "+972", label: "IL", name: "Israël",          flag: "🇮🇱" },
  { code: "+852", label: "HK", name: "Hong Kong",       flag: "🇭🇰" },
  { code: "+81",  label: "JP", name: "Japon",           flag: "🇯🇵" },
  { code: "+86",  label: "CN", name: "Chine",           flag: "🇨🇳" },
  { code: "+91",  label: "IN", name: "Inde",            flag: "🇮🇳" },
  { code: "+61",  label: "AU", name: "Australie",       flag: "🇦🇺" },
  { code: "+55",  label: "BR", name: "Brésil",          flag: "🇧🇷" },
]

const DEFAULT_COUNTRY = COUNTRIES[0]

// Parse une valeur stockée : "+33 06 12 34 56 78" → { country: FR, number: "06 12 34 56 78" }
function parseValue(value: string): { country: Country; number: string } {
  if (!value) return { country: DEFAULT_COUNTRY, number: "" }
  const trimmed = value.trim()
  // Cherche l'indicatif le plus long qui match (ex: +212 avant +2)
  const sorted = [...COUNTRIES].sort((a, b) => b.code.length - a.code.length)
  for (const c of sorted) {
    if (trimmed.startsWith(c.code)) {
      return { country: c, number: trimmed.slice(c.code.length).trim() }
    }
  }
  return { country: DEFAULT_COUNTRY, number: trimmed }
}

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}

export default function PhoneInput({ value, onChange, placeholder }: Props) {
  const initial = parseValue(value)
  const [country, setCountry] = useState<Country>(initial.country)
  const [number, setNumber] = useState(initial.number)
  const [open, setOpen] = useState(false)

  // Sync quand la valeur externe change (ex: load depuis DB)
  useEffect(() => {
    const parsed = parseValue(value)
    setCountry(parsed.country)
    setNumber(parsed.number)
  }, [value])

  function update(newCountry: Country, newNumber: string) {
    const full = newNumber.trim() ? `${newCountry.code} ${newNumber.trim()}` : ""
    onChange(full)
  }

  return (
    <div style={{ display: "flex", gap: 0, width: "100%", position: "relative" }}>
      {/* Sélecteur d'indicatif */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          padding: "10px 14px",
          border: "1px solid #EAE6DF",
          borderRight: "none",
          borderRadius: "10px 0 0 10px",
          background: "white",
          cursor: "pointer",
          fontFamily: "inherit",
          fontSize: 14,
          fontWeight: 600,
          color: "#111",
          whiteSpace: "nowrap",
          flexShrink: 0,
        }}
      >
        <span>{country.label}</span>
        <span style={{ color: "#8a8477", fontSize: 13 }}>{country.code}</span>
        <span style={{ fontSize: 10, color: "#8a8477" }}>▾</span>
      </button>

      {/* Input numéro */}
      <input
        type="tel"
        value={number}
        onChange={e => {
          const n = e.target.value
          setNumber(n)
          update(country, n)
        }}
        placeholder={placeholder || "6 12 34 56 78"}
        style={{
          flex: 1,
          padding: "10px 14px",
          border: "1px solid #EAE6DF",
          borderRadius: "0 10px 10px 0",
          fontSize: 14,
          outline: "none",
          boxSizing: "border-box",
          fontFamily: "inherit",
          background: "white",
          color: "#111",
          minWidth: 0,
        }}
      />

      {/* Dropdown des pays */}
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 150 }} />
          <div style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            background: "white",
            border: "1px solid #EAE6DF",
            borderRadius: 10,
            width: 260,
            maxHeight: 320,
            overflowY: "auto",
            zIndex: 200,
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
          }}>
            {COUNTRIES.map(c => (
              <button
                key={c.label + c.code}
                type="button"
                onClick={() => {
                  setCountry(c)
                  update(c, number)
                  setOpen(false)
                }}
                style={{
                  width: "100%",
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 14px",
                  border: "none",
                  background: country.code === c.code ? "#F7F4EF" : "white",
                  cursor: "pointer",
                  fontFamily: "inherit",
                  fontSize: 13,
                  textAlign: "left",
                  color: "#111",
                }}
                onMouseEnter={e => { if (country.code !== c.code) (e.currentTarget as HTMLButtonElement).style.background = "#F7F4EF" }}
                onMouseLeave={e => { if (country.code !== c.code) (e.currentTarget as HTMLButtonElement).style.background = "white" }}
              >
                <span style={{ fontWeight: 700, minWidth: 30 }}>{c.label}</span>
                <span style={{ color: "#8a8477", minWidth: 50 }}>{c.code}</span>
                <span style={{ color: "#111", flex: 1 }}>{c.name}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
