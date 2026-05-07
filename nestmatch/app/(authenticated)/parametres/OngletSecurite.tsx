"use client"
import { useState } from "react"
import { signOut } from "next-auth/react"
import ChangePasswordForm from "./ChangePasswordForm"

function SettingRow({ title, desc, action }: { title: string; desc: string; action: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 280px" }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: "#111", margin: "0 0 4px" }}>{title}</h3>
        <p style={{ fontSize: 13, color: "#8a8477", lineHeight: 1.55, margin: 0 }}>{desc}</p>
      </div>
      <div style={{ flexShrink: 0 }}>{action}</div>
    </div>
  )
}

export default function OngletSecurite() {
  const [showPwd, setShowPwd] = useState(false)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,500&display=swap');`}</style>
      <section style={{ background: "white", border: "1px solid #EAE6DF", borderRadius: 20, padding: 28, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
        <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, letterSpacing: "-0.3px", color: "#111", margin: "0 0 18px" }}>Authentification</h2>

        <SettingRow
          title="Mot de passe"
          desc="Utilisez un mot de passe unique, d'au moins 8 caractères, différent de ceux d'autres services."
          action={
            <button onClick={() => setShowPwd(v => !v)}
              style={{ background: "#F7F4EF", border: "1px solid #EAE6DF", color: "#111", borderRadius: 999, padding: "8px 18px", fontWeight: 600, fontSize: 11, cursor: "pointer", fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.3px" }}>
              {showPwd ? "Annuler" : "Modifier"}
            </button>
          }
        />
        {showPwd && <ChangePasswordForm onDone={() => setShowPwd(false)} />}

        <div style={{ height: 1, background: "#EAE6DF", margin: "20px 0" }} />

        <SettingRow
          title="Sessions actives"
          desc="Visualisation et révocation granulaire bientôt disponibles. En attendant, vous pouvez vous déconnecter de cet appareil."
          action={
            <button onClick={() => signOut({ callbackUrl: "/" })}
              style={{ background: "white", border: "1px solid #EAE6DF", color: "#111", borderRadius: 999, padding: "8px 18px", fontWeight: 600, fontSize: 11, cursor: "pointer", fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.3px" }}>
              Me déconnecter
            </button>
          }
        />
      </section>
    </div>
  )
}
