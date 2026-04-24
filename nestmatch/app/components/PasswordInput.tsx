"use client"
import { useState } from "react"

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  required?: boolean
  minLength?: number
  autoComplete?: string
  name?: string
  id?: string
}

/**
 * Input de mot de passe avec icone oeil (toggle visibilite).
 * Style aligne sur les inputs existants du projet (inline styles, radius 10).
 */
export default function PasswordInput({ value, onChange, placeholder, required, minLength, autoComplete, name, id }: Props) {
  const [visible, setVisible] = useState(false)

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <input
        type={visible ? "text" : "password"}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        minLength={minLength}
        autoComplete={autoComplete}
        name={name}
        id={id}
        style={{
          width: "100%",
          padding: "12px 44px 12px 16px",
          border: "1px solid #EAE6DF",
          borderRadius: 10,
          fontSize: 15,
          outline: "none",
          boxSizing: "border-box",
          fontFamily: "inherit",
          background: "white",
          color: "#111",
        }}
      />
      <button
        type="button"
        onClick={() => setVisible(v => !v)}
        aria-label={visible ? "Masquer le mot de passe" : "Afficher le mot de passe"}
        tabIndex={-1}
        style={{
          position: "absolute",
          right: 6,
          top: "50%",
          transform: "translateY(-50%)",
          width: 32,
          height: 32,
          background: "transparent",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: 0,
          color: visible ? "#111" : "#8a8477",
          transition: "color 0.15s",
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = "#111" }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = visible ? "#111" : "#8a8477" }}
      >
        {visible ? (
          // Icone oeil ouvert (visible)
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
          </svg>
        ) : (
          // Icone oeil barre (cache)
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
          </svg>
        )}
      </button>
    </div>
  )
}
