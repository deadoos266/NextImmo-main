import ReviewsBlock from "../../../components/reviews/ReviewsBlock"

/**
 * V97.35 P3-3 — /profil/[email]
 *
 * Page profil publique d'un user (locataire ou proprio). Pour l'instant
 * minimaliste : email masqué + bloc reviews reçues (publiques uniquement,
 * publication double-aveugle gérée côté API).
 *
 * Pas d'index Google car en pré-launch + données quasi-personnelles. Une
 * vraie page profil enrichie (bio, photo, statistiques bail) viendra plus
 * tard si la feature reviews prend.
 */

interface Params {
  email: string
}

export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { email } = await params
  const decoded = decodeURIComponent(email).toLowerCase()
  const local = decoded.split("@")[0] || "Membre"
  return {
    title: `${local.slice(0, 2)}*** · Profil KeyMatch`,
    description: "Avis publiés sur ce membre KeyMatch (avis double-aveugle, vérifiés post-bail).",
    robots: { index: false, follow: false },
  }
}

export const dynamic = "force-dynamic"

function maskEmail(email: string): string {
  if (!email || !email.includes("@")) return "anonyme"
  const [local, domain] = email.split("@")
  if (local.length <= 2) return `${local[0]}***@${domain}`
  return `${local.slice(0, 2)}***@${domain}`
}

export default async function ProfilPublicPage({ params }: { params: Promise<Params> }) {
  const { email } = await params
  const target_email = decodeURIComponent(email).toLowerCase().trim()
  const masked = maskEmail(target_email)

  if (!target_email || !target_email.includes("@")) {
    return (
      <main style={{ minHeight: "60vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", padding: "48px 16px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
          <p style={{ fontSize: 14, color: "#666" }}>Email invalide.</p>
        </div>
      </main>
    )
  }

  return (
    <main style={{ minHeight: "60vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", padding: "48px 16px" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,500&display=swap');`}</style>

      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 8px" }}>
          Profil membre KeyMatch
        </p>
        <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 38, color: "#111", margin: "0 0 8px", lineHeight: 1.1 }}>
          {masked}
        </h1>
        <p style={{ fontSize: 13, color: "#666", margin: "0 0 32px", lineHeight: 1.55, maxWidth: 540 }}>
          Avis publiés par les bailleurs et locataires avec qui ce membre a partagé un bail signé sur KeyMatch.
          Publication double-aveugle : les avis n&apos;apparaissent qu&apos;une fois que les 2 parties ont noté.
        </p>

        <ReviewsBlock target_email={target_email} compact={false} />

        <p style={{ fontSize: 11, color: "#8a8477", marginTop: 24, lineHeight: 1.5, fontStyle: "italic" }}>
          L&apos;email exact du membre est masqué pour des raisons de confidentialité.
          Les avis sont reliés à un bail signé ou clos sur KeyMatch — pas de review anonyme possible.
        </p>
      </div>
    </main>
  )
}
