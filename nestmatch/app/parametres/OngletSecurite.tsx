"use client"
import { useState } from "react"
import { signOut, useSession } from "next-auth/react"
import ChangePasswordForm from "./ChangePasswordForm"

function SettingRow({ title, desc, action }: { title: string; desc: string; action: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, flexWrap: "wrap" }}>
      <div style={{ flex: "1 1 280px" }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{title}</h3>
        <p style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.5 }}>{desc}</p>
      </div>
      <div style={{ flexShrink: 0 }}>{action}</div>
    </div>
  )
}

export default function OngletSecurite() {
  const { data: session } = useSession()
  const email = session?.user?.email || null
  const [showPwd, setShowPwd] = useState(false)

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <section style={{ background: "white", borderRadius: 20, padding: 28 }}>
        <h2 style={{ fontSize: 18, fontWeight: 800, margin: "0 0 18px" }}>Authentification</h2>

        <SettingRow
          title="Mot de passe"
          desc="Utilisez un mot de passe unique, d'au moins 8 caractères, différent de ceux d'autres services."
          action={
            <button onClick={() => setShowPwd(v => !v)}
              style={{ background: "white", border: "1.5px solid #111", color: "#111", borderRadius: 999, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              {showPwd ? "Annuler" : "Modifier"}
            </button>
          }
        />
        {showPwd && <ChangePasswordForm onDone={() => setShowPwd(false)} />}

        <div style={{ height: 1, background: "#f3f4f6", margin: "20px 0" }} />

        <SettingRow
          title="Adresse e-mail"
          desc={email ? `Compte associé à ${email}. Le changement d'adresse est bientôt disponible.` : "Adresse non disponible."}
          action={
            <button disabled
              style={{ background: "#f3f4f6", border: "1.5px solid #e5e7eb", color: "#9ca3af", borderRadius: 999, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "not-allowed", fontFamily: "inherit" }}>
              Bientôt
            </button>
          }
        />

        <div style={{ height: 1, background: "#f3f4f6", margin: "20px 0" }} />

        <SettingRow
          title="Sessions actives"
          desc="Visualisation et révocation granulaire bientôt disponibles. En attendant, vous pouvez vous déconnecter de cet appareil."
          action={
            <button onClick={() => signOut({ callbackUrl: "/" })}
              style={{ background: "white", border: "1.5px solid #e5e7eb", color: "#111", borderRadius: 999, padding: "8px 18px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              Me déconnecter
            </button>
          }
        />
      </section>
    </div>
  )
}
