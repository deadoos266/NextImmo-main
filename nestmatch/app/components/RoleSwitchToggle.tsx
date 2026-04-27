"use client"
import { useEffect, useState } from "react"
import { useRoleSwitch, type ActiveRole } from "../hooks/useRoleSwitch"

/**
 * Toggle pill horizontal "Locataire ↔ Proprietaire" (pattern Airbnb).
 * Visible uniquement si l'user a les 2 roles disponibles (cf
 * useRoleSwitch.canSwitch).
 *
 * Variants :
 *   - "desktop" : pill compact 36px de haut, integre a la Navbar.
 *   - "mobile" : row pleine largeur dans le drawer mobile, sous le profil.
 *
 * Toast subtle bottom-center 3s a chaque switch ("Mode Proprietaire
 * active" / "Mode Locataire active").
 */
export default function RoleSwitchToggle({
  variant = "desktop",
  showLabel = true,
}: {
  variant?: "desktop" | "mobile"
  /** Affiche l'eyebrow "ESPACE ACTUEL" au-dessus du pill (mobile uniquement).
   *  Default true. False quand on insere dans le dropdown avatar (eyebrow
   *  redondant avec "Mon espace" qui suit). Paul 2026-04-27. */
  showLabel?: boolean
}) {
  const { canSwitch, currentRole, switchTo } = useRoleSwitch()
  const [toast, setToast] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  if (!canSwitch) return null

  function handleClick(role: ActiveRole) {
    if (role === currentRole) return
    switchTo(role)
    setToast(role === "proprietaire" ? "Mode Propriétaire activé" : "Mode Locataire activé")
  }

  const fontSize = variant === "desktop" ? 12 : 13
  const height = variant === "desktop" ? 36 : 40
  const padX = variant === "desktop" ? 14 : 18
  const containerStyle: React.CSSProperties = variant === "desktop"
    ? {
        display: "inline-flex",
        alignItems: "stretch",
        background: "transparent",
        border: "1px solid #EAE6DF",
        borderRadius: 999,
        height,
        padding: 2,
        gap: 2,
      }
    : {
        display: "flex",
        alignItems: "stretch",
        background: "transparent",
        border: "1px solid #EAE6DF",
        borderRadius: 999,
        height,
        padding: 2,
        gap: 2,
        margin: "8px",
        width: "calc(100% - 16px)",
      }

  function btnStyle(active: boolean): React.CSSProperties {
    return {
      flex: variant === "mobile" ? 1 : "0 0 auto",
      background: active ? "#111" : "transparent",
      color: active ? "#fff" : "#555",
      border: "none",
      borderRadius: 999,
      padding: `0 ${padX}px`,
      fontSize,
      fontWeight: active ? 600 : 500,
      cursor: active ? "default" : "pointer",
      fontFamily: "inherit",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      transition: "all 200ms cubic-bezier(0.4, 0, 0.2, 1)",
      WebkitTapHighlightColor: "transparent",
      whiteSpace: "nowrap",
    }
  }

  return (
    <>
      {variant === "mobile" && showLabel && (
        <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "0.5px", margin: "0 16px 4px", padding: "12px 0 0" }}>
          Espace actuel
        </p>
      )}
      <div role="group" aria-label="Choisir le mode d'utilisation" style={containerStyle}>
        <button
          type="button"
          onClick={() => handleClick("locataire")}
          aria-pressed={currentRole === "locataire"}
          style={btnStyle(currentRole === "locataire")}
        >
          Locataire
        </button>
        <button
          type="button"
          onClick={() => handleClick("proprietaire")}
          aria-pressed={currentRole === "proprietaire"}
          style={btnStyle(currentRole === "proprietaire")}
        >
          Propriétaire
        </button>
      </div>

      {/* Toast subtle bottom-center, fade-in/out 200ms */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            bottom: "calc(24px + env(safe-area-inset-bottom, 0px))",
            left: "50%",
            transform: "translateX(-50%)",
            background: "#111",
            color: "#fff",
            padding: "10px 22px",
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
            fontFamily: "'DM Sans', sans-serif",
            zIndex: 11000,
            boxShadow: "0 8px 28px rgba(0,0,0,0.25)",
            animation: "km-roleswitch-toast 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          {toast}
          <style>{`@keyframes km-roleswitch-toast { from { opacity: 0; transform: translate(-50%, 8px); } to { opacity: 1; transform: translate(-50%, 0); } }`}</style>
        </div>
      )}
    </>
  )
}
