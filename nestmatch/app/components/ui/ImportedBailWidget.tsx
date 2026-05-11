"use client"
/**
 * V89.7 — Widget de remplacement pour BailTimeline quand le bail est importé.
 *
 * Pour un bail importé (signé hors plateforme), la timeline "4 étapes" n'a
 * pas de sens : tout est déjà fait historiquement (signature, premier loyer,
 * peut-être EDL hors plateforme). On affiche à la place un résumé "Bail
 * importé · gestion locative active" + 3 CTAs concrets.
 *
 * Props minimales — pas de dépendance lib/bailTimeline.
 */

import Link from "next/link"

export type ImportedBailWidgetProps = {
  bienId: number | string
  dateDebut: string | null       // ISO ou YYYY-MM-DD, peut être null
  bailPdfUrl: string | null
  hasEdlEntree: boolean          // au moins un EDL d'entrée existant
  hasLoyerConfirme: boolean      // au moins un loyer confirmé
  // Role de l'utilisateur — on adapte les CTAs (proprio voit "Faire l'EDL",
  // locataire voit "Voir l'EDL").
  role: "locataire" | "proprietaire"
}

function formatDateFr(iso: string | null | undefined): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
  } catch {
    return null
  }
}

export default function ImportedBailWidget(props: ImportedBailWidgetProps) {
  const { bienId, dateDebut, bailPdfUrl, hasEdlEntree, hasLoyerConfirme, role } = props
  const dateDebutFr = formatDateFr(dateDebut)

  return (
    <section
      aria-label="Bail importé"
      style={{
        background: "#fff",
        border: "1px solid #EAE6DF",
        borderRadius: 20,
        padding: 26,
        fontFamily: "'DM Sans', sans-serif",
        boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
        marginBottom: 24,
      }}
    >
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,500&display=swap');`}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <p style={{ fontSize: 10, fontWeight: 700, color: "#1d4ed8", textTransform: "uppercase", letterSpacing: "1.4px", margin: 0 }}>
            Bail importé · Gestion locative active
          </p>
          <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, letterSpacing: "-0.3px", color: "#111", margin: "6px 0 0" }}>
            {dateDebutFr ? `Bail effectif depuis le ${dateDebutFr}` : "Bail effectif"}
          </h2>
          <p style={{ fontSize: 13, color: "#8a8477", margin: "6px 0 0", lineHeight: 1.55 }}>
            {role === "locataire"
              ? "Le bail a été signé hors plateforme avant votre arrivée sur KeyMatch. Vous pouvez désormais utiliser tous les outils de gestion locative (EDL, quittances, IRL, messagerie)."
              : "Vous avez importé un bail déjà signé. Vous pouvez désormais utiliser tous les outils de gestion locative (EDL, quittances, IRL, messagerie)."}
          </p>
        </div>
      </div>

      {/* Mini-checklist : ce qui est fait / ce qui reste à faire */}
      <div style={{ background: "#F7F4EF", borderRadius: 14, padding: "14px 16px", marginBottom: 14 }}>
        <ChecklistItem done label="Bail signé (hors plateforme)" />
        <ChecklistItem done={hasEdlEntree} label={hasEdlEntree ? "État des lieux d'entrée enregistré" : "État des lieux d'entrée — à faire si pas encore réalisé"} />
        <ChecklistItem
          done={hasLoyerConfirme}
          label={hasLoyerConfirme ? "Au moins un loyer confirmé sur KeyMatch" : "Aucun loyer enregistré sur KeyMatch pour l'instant"}
        />
      </div>

      {/* CTAs */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {bailPdfUrl && (
          <a
            href={bailPdfUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={ctaPrimary}
          >
            Voir le bail (PDF)
          </a>
        )}
        {!hasEdlEntree && (
          <Link href={role === "proprietaire" ? `/proprietaire/edl/${bienId}` : `/edl/${bienId}`} style={ctaGhost}>
            {role === "proprietaire" ? "Faire l'EDL d'entrée →" : "Voir l'EDL d'entrée →"}
          </Link>
        )}
        {role === "proprietaire" && (
          <Link href={`/proprietaire?annonce=${bienId}#loyers`} style={ctaGhost}>
            Saisir un loyer →
          </Link>
        )}
        {role === "locataire" && (
          <Link href="/mes-quittances" style={ctaGhost}>
            Mes quittances →
          </Link>
        )}
      </div>
    </section>
  )
}

function ChecklistItem({ done, label }: { done: boolean; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: done ? "#15803d" : "#8a8477", padding: "4px 0" }}>
      <span
        aria-hidden
        style={{
          width: 18,
          height: 18,
          borderRadius: "50%",
          background: done ? "#DCF5E4" : "#fff",
          border: `1px solid ${done ? "#C6E9C0" : "#EAE6DF"}`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
          color: done ? "#15803d" : "#8a8477",
        }}
      >
        {done ? (
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        ) : (
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#EAE6DF" }} />
        )}
      </span>
      <span style={{ lineHeight: 1.4 }}>{label}</span>
    </div>
  )
}

const ctaPrimary: React.CSSProperties = {
  display: "inline-block",
  background: "#111",
  color: "#fff",
  padding: "9px 18px",
  borderRadius: 999,
  textDecoration: "none",
  fontSize: 11,
  fontWeight: 700,
  fontFamily: "inherit",
  textTransform: "uppercase",
  letterSpacing: "0.4px",
}

const ctaGhost: React.CSSProperties = {
  display: "inline-block",
  background: "#fff",
  color: "#111",
  border: "1px solid #EAE6DF",
  padding: "9px 18px",
  borderRadius: 999,
  textDecoration: "none",
  fontSize: 11,
  fontWeight: 700,
  fontFamily: "inherit",
  textTransform: "uppercase",
  letterSpacing: "0.4px",
}
