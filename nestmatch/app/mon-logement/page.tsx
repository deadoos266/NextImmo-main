"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { supabase } from "../../lib/supabase"
import { getDateDebutBailFr } from "../../lib/bailDates"
import { useResponsive } from "../hooks/useResponsive"
import { joursRetardLoyer } from "../../lib/loyerHelpers"
import { BRAND } from "../../lib/brand"
import { drawLogoPDF } from "../../lib/brandPDF"
import { computeBailTimeline } from "../../lib/bailTimeline"
import { projeterEcheancierBail, prochaineEcheance } from "../../lib/loyersProjection"
import BailTimeline from "../components/ui/BailTimeline"
import BailSignatureModal from "../components/BailSignatureModal"
import IntegrityBadge from "../components/bail/IntegrityBadge"
import PreavisModal from "../components/bail/PreavisModal"
import AvenantCard, { type Avenant } from "../components/bail/AvenantCard"
import { joursAvantFinPreavis, formatJoursRestants, LOCATAIRE_MOTIFS, PROPRIETAIRE_MOTIFS } from "../../lib/preavis"
import { genererPreavisPDF } from "../../lib/preavisPDF"
import { estZoneTendue } from "../../lib/bailDefaults"
import type { BailData, BailSignatureEntry } from "../../lib/bailPDF"

/**
 * Mon logement actuel — vue dédiée locataire après bail signé.
 *
 * Critère de détection : `annonces.locataire_email === session.email`
 *   AND (statut = "loué" OU date_debut_bail renseignée).
 *
 * Si aucun bail, redirige vers /mes-candidatures.
 */

type Bien = {
  id: number
  titre: string
  ville: string | null
  adresse: string | null
  prix: number | null
  charges: number | null
  surface: number | null
  pieces: number | null
  photos: string[] | null
  proprietaire_email: string
  statut: string | null
  date_debut_bail: string | null
  bail_genere_at: string | null
  bail_signe_locataire_at?: string | null
  bail_signe_bailleur_at?: string | null
  bail_relance_locataire_at?: string | null
  meuble?: boolean | null
  // V34.5 — Préavis
  preavis_donne_par?: "locataire" | "proprietaire" | null
  preavis_date_envoi?: string | null
  preavis_motif?: string | null
  preavis_motif_detail?: string | null
  preavis_fin_calculee?: string | null
  dpe: string | null
  auto_paiement_actif?: boolean | null
  auto_paiement_confirme_at?: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Edl = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loyer = any

export default function MonLogement() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { isMobile } = useResponsive()
  const [bien, setBien] = useState<Bien | null>(null)
  const [loading, setLoading] = useState(true)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [downloadingBail, setDownloadingBail] = useState(false)
  const [visitesAVenir, setVisitesAVenir] = useState<number>(0)
  const [edls, setEdls] = useState<Edl[]>([])
  const [loyers, setLoyers] = useState<Loyer[]>([])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [bailPayload, setBailPayload] = useState<any | null>(null)
  const [bailFichierUrl, setBailFichierUrl] = useState<string | null>(null)
  const [signatures, setSignatures] = useState<BailSignatureEntry[]>([])
  const [signModalOpen, setSignModalOpen] = useState(false)
  const [preavisOpen, setPreavisOpen] = useState(false)
  // V36.3 — Avenants liés au bail courant
  const [avenants, setAvenants] = useState<Avenant[]>([])

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth")
      return
    }
    if (!session?.user?.email) return

    const email = session.user.email.toLowerCase()
    async function load() {
      const { data: biens } = await supabase
        .from("annonces")
        .select("*")
        .ilike("locataire_email", email)
        .order("id", { ascending: false })
        .limit(1)

      const b = biens?.[0]
      if (!b) {
        setLoading(false)
        return
      }
      setBien(b as Bien)

      // Docs du logement + bail payload + signatures
      const [vRes, edlRes, loyRes, bailMsgRes, sigRes] = await Promise.all([
        supabase.from("visites").select("id", { count: "exact", head: true })
          .eq("annonce_id", b.id).ilike("locataire_email", email).eq("statut", "confirmée"),
        supabase.from("etats_des_lieux")
          .select("id, type, date_edl, statut, created_at")
          .eq("annonce_id", b.id)
          .order("created_at", { ascending: false }),
        supabase.from("loyers")
          .select("id, mois, montant, statut, date_confirmation, quittance_envoyee_at")
          .eq("annonce_id", b.id)
          .order("mois", { ascending: false })
          .limit(24),
        // Dernier [BAIL_CARD] pour ce bien — source du payload téléchargeable
        supabase.from("messages")
          .select("contenu")
          .eq("annonce_id", b.id)
          .ilike("contenu", "[BAIL_CARD]%")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        // Signatures pour affichage du statut
        supabase.from("bail_signatures")
          .select("signataire_role, signataire_nom, signature_png, signe_at, mention, ip_address")
          .eq("annonce_id", b.id),
      ])
      setVisitesAVenir(vRes.count ?? 0)
      setEdls(edlRes.data || [])
      setLoyers(loyRes.data || [])

      // Parse bail payload
      if (bailMsgRes.data?.contenu) {
        try {
          const payload = JSON.parse(
            (bailMsgRes.data.contenu as string).slice("[BAIL_CARD]".length),
          )
          setBailPayload(payload)
          if (payload.fichierUrl) setBailFichierUrl(payload.fichierUrl)
        } catch {
          /* ignore */
        }
      }

      // Signatures
      if (sigRes.data) {
        setSignatures(
          sigRes.data.map(s => ({
            role: s.signataire_role as "bailleur" | "locataire" | "garant",
            nom: s.signataire_nom,
            png: s.signature_png,
            signeAt: s.signe_at,
            mention: s.mention,
            ipAddress: s.ip_address,
          })),
        )
      }

      // V36.3 — fetch avenants liés au bail (audit V35 R35.1).
      try {
        const avRes = await fetch(`/api/bail/avenant?annonceId=${b.id}`)
        if (avRes.ok) {
          const json = await avRes.json() as { ok: boolean; avenants?: Avenant[] }
          if (json.ok && json.avenants) setAvenants(json.avenants)
        }
      } catch { /* silent fail — pas bloquant */ }

      setLoading(false)
    }
    load()
  }, [session, status, router])

  async function refreshAvenants() {
    if (!bien) return
    try {
      const res = await fetch(`/api/bail/avenant?annonceId=${bien.id}`)
      if (res.ok) {
        const json = await res.json() as { ok: boolean; avenants?: Avenant[] }
        if (json.ok && json.avenants) setAvenants(json.avenants)
      }
    } catch { /* silent */ }
  }

  async function telechargerBail() {
    if (!bailPayload || downloadingBail) return
    setDownloadingBail(true)
    try {
      // Si bail externe (URL fichier) → téléchargement direct
      if (bailFichierUrl) {
        window.open(bailFichierUrl, "_blank")
        return
      }
      const { genererBailPDF } = await import("../../lib/bailPDF")
      await genererBailPDF({ ...bailPayload, signatures } as BailData)
    } finally {
      setDownloadingBail(false)
    }
  }

  async function onSigned() {
    // Recharge les signatures après signing
    if (!bien) return
    const { data: sigRes } = await supabase
      .from("bail_signatures")
      .select("signataire_role, signataire_nom, signature_png, signe_at, mention, ip_address")
      .eq("annonce_id", bien.id)
    if (sigRes) {
      setSignatures(
        sigRes.map(s => ({
          role: s.signataire_role as "bailleur" | "locataire" | "garant",
          nom: s.signataire_nom,
          png: s.signature_png,
          signeAt: s.signe_at,
          mention: s.mention,
          ipAddress: s.ip_address,
        })),
      )
    }
    // Statut mis à jour (bail_envoye → loué) — refetch le bien
    const { data: b } = await supabase.from("annonces").select("*").eq("id", bien.id).single()
    if (b) setBien(b as Bien)
  }

  // Realtime : sync auto annonces + signatures + edls + loyers pour ce bien
  useEffect(() => {
    if (!bien?.id) return
    const channel = supabase.channel(`mon-logement-${bien.id}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "annonces" }, (payload) => {
        const a = payload.new as { id?: number }
        if (a?.id === bien.id) setBien(prev => prev ? ({ ...prev, ...a } as Bien) : prev)
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "bail_signatures" }, (payload) => {
        const s = payload.new as { annonce_id?: number }
        if (s?.annonce_id !== bien.id) return
        void onSigned()
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "etats_des_lieux" }, (payload) => {
        const e = payload.new as { annonce_id?: number }
        if (e?.annonce_id === bien.id) setEdls(prev => [...prev, e])
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "etats_des_lieux" }, (payload) => {
        const e = payload.new as { id?: string; annonce_id?: number }
        if (e?.annonce_id !== bien.id) return
        setEdls(prev => prev.map(x => x.id === e.id ? { ...x, ...e } : x))
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "loyers" }, (payload) => {
        const l = payload.new as { annonce_id?: number }
        if (l?.annonce_id === bien.id) setLoyers(prev => [l, ...prev])
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "loyers" }, (payload) => {
        const l = payload.new as { id?: number; annonce_id?: number }
        if (l?.annonce_id !== bien.id) return
        setLoyers(prev => prev.map(x => x.id === l.id ? { ...x, ...l } : x))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bien?.id])

  async function demanderAutoPaiement() {
    if (!bien || !session?.user?.email) return
    const locataireEmail = session.user.email.toLowerCase()
    const proprietaireEmail = (bien.proprietaire_email || "").toLowerCase()
    const now = new Date().toISOString()
    const payload = { annonceId: bien.id, declaredAt: now }
    const { error } = await supabase.from("messages").insert([{
      from_email: locataireEmail,
      to_email: proprietaireEmail,
      contenu: `[AUTO_PAIEMENT_DEMANDE]${JSON.stringify(payload)}`,
      lu: false,
      annonce_id: bien.id,
      created_at: now,
    }])
    if (error) {
      alert(`Erreur : ${error.message}`)
      return
    }
    alert("✓ Demande d'auto-paiement envoyée au propriétaire. Vous serez notifié à sa confirmation.")
  }

  // Auto-création du loyer du mois en cours si auto_paiement_actif et pas
  // encore de loyer pour ce mois. Appelé sur chaque chargement de page.
  useEffect(() => {
    if (!bien?.auto_paiement_actif || !bien?.id || !session?.user?.email) return
    const moisCourant = new Date().toISOString().slice(0, 7)
    const dejaExiste = loyers.find(l => l.mois === moisCourant)
    if (dejaExiste) return
    const montant = (Number(bien.prix) || 0) + (Number(bien.charges) || 0)
    const now = new Date().toISOString()
    // V24.1 — via /api/loyers/save (server-side, mode upsert proprio)
    // NB : auto-paiement déclenche ici mais signe le loyer "confirmé"
    // d'office. Le serveur vérifiera que session = locataire.
    void fetch("/api/loyers/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "declare",
        annonce_id: bien.id,
        mois: moisCourant,
        montant,
        remarque: "auto-paiement",
      }),
    }).then(async (res) => {
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.ok && json.loyer) {
        setLoyers(prev => [json.loyer, ...prev])
      }
    }).catch(() => {})
    void now // suppress unused
  }, [bien, loyers, session?.user?.email])

  async function declarerPaiement(mois: string) {
    if (!bien || !session?.user?.email) return
    const montantAttendu = (Number(bien.prix) || 0) + (Number(bien.charges) || 0)
    const locataireEmail = session.user.email.toLowerCase()
    const proprietaireEmail = (bien.proprietaire_email || "").toLowerCase()
    const now = new Date().toISOString()
    // Upsert loyer : si existe déjà en "déclaré", on ne l'écrase pas.
    // Si n'existe pas, on le crée en "déclaré" (attente confirmation proprio).
    const existant = loyers.find(l => l.mois === mois)
    if (existant?.statut === "confirmé") {
      alert("Ce loyer a déjà été confirmé par votre propriétaire.")
      return
    }
    if (!existant) {
      // V24.1 — via /api/loyers/save mode "declare" (server-side, locataire-only)
      try {
        const res = await fetch("/api/loyers/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "declare",
            annonce_id: bien.id,
            mois,
            montant: montantAttendu,
          }),
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json.ok) {
          // Tolerate duplicate (race) silently
          if (!/duplicate|already exists/i.test(json.error || "")) {
            alert(`Erreur : ${json.error || res.statusText}`)
            return
          }
        }
        if (json.loyer) setLoyers(prev => [json.loyer, ...prev.filter(l => l.mois !== mois)])
      } catch (e) {
        alert(`Erreur réseau : ${e instanceof Error ? e.message : "inconnue"}`)
        return
      }
    }
    void locataireEmail; void proprietaireEmail; void now; // suppress unused after migration
    // Message card + notif au proprio
    const moisLabel = new Date(mois + "-01T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
    if (proprietaireEmail) {
      const payload = JSON.stringify({ mois, montant: montantAttendu, bienTitre: bien.titre || "" })
      await supabase.from("messages").insert([{
        from_email: locataireEmail,
        to_email: proprietaireEmail,
        contenu: `[LOYER_PAYE]${payload}`,
        lu: false,
        annonce_id: bien.id,
        created_at: now,
      }])
      void fetch("/api/notifications/new-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to: proprietaireEmail, preview: `Loyer ${moisLabel} payé` }),
      }).catch(() => { /* silent */ })
    }
    alert(`✓ Paiement du loyer de ${moisLabel} signalé à votre propriétaire.`)
  }

  async function exportHistoriqueLoyersPDF() {
    if (!bien || loyers.length === 0) return
    setExportingPdf(true)
    try {
      const { default: jsPDF } = await import("jspdf")
      const doc = new jsPDF()
      const now = new Date().toLocaleDateString("fr-FR")
      drawLogoPDF(doc, { x: 20, y: 18, size: "medium" })
      doc.setFontSize(18); doc.setFont("helvetica", "bold")
      doc.text("Historique des loyers", 105, 30, { align: "center" })
      doc.setFontSize(10); doc.setFont("helvetica", "normal")
      doc.text(`Édité le ${now}`, 105, 36, { align: "center" })
      doc.setDrawColor(200, 200, 200); doc.line(20, 42, 190, 42)

      doc.setFont("helvetica", "bold"); doc.setFontSize(11)
      doc.text("BIEN", 20, 52)
      doc.setFont("helvetica", "normal"); doc.setFontSize(9)
      doc.text(bien.titre || "", 20, 59)
      if (bien.adresse) doc.text(bien.adresse, 20, 65)
      if (bien.ville) doc.text(bien.ville, 20, bien.adresse ? 71 : 65)

      const locataireEmail = session?.user?.email || ""
      doc.setFont("helvetica", "bold"); doc.setFontSize(11)
      doc.text("LOCATAIRE", 110, 52)
      doc.setFont("helvetica", "normal"); doc.setFontSize(9)
      doc.text(locataireEmail, 110, 59)

      // Table
      let y = 88
      doc.line(20, y - 4, 190, y - 4)
      doc.setFont("helvetica", "bold"); doc.setFontSize(10)
      doc.text("Mois", 22, y)
      doc.text("Montant", 90, y)
      doc.text("Statut", 130, y)
      doc.text("Confirmé le", 165, y)
      y += 4
      doc.line(20, y, 190, y)
      y += 6
      doc.setFont("helvetica", "normal"); doc.setFontSize(9)

      const loyersTries = [...loyers].sort((a, b) => (a.mois || "").localeCompare(b.mois || ""))
      let totalConfirme = 0
      for (const l of loyersTries) {
        if (y > 270) { doc.addPage(); y = 30 }
        const moisLabel = l.mois
          ? new Date(l.mois + "-01T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
          : "—"
        const montant = Number(l.montant) || 0
        if (l.statut === "confirmé") totalConfirme += montant
        const statut = l.statut === "confirmé" ? "Payé" : "En attente"
        const dateConf = l.date_confirmation
          ? new Date(l.date_confirmation).toLocaleDateString("fr-FR")
          : "—"
        doc.text(moisLabel.charAt(0).toUpperCase() + moisLabel.slice(1), 22, y)
        doc.text(`${montant.toLocaleString("fr-FR")} €`, 90, y)
        doc.text(statut, 130, y)
        doc.text(dateConf, 165, y)
        y += 7
      }

      if (y > 260) { doc.addPage(); y = 30 }
      doc.line(20, y, 190, y); y += 8
      doc.setFont("helvetica", "bold"); doc.setFontSize(11)
      doc.text(`Total loyers confirmés : ${totalConfirme.toLocaleString("fr-FR")} €`, 20, y)

      doc.setFontSize(8); doc.setFont("helvetica", "italic"); doc.setTextColor(120, 120, 120)
      doc.text(`Document généré depuis ${BRAND.name} — à valeur indicative.`, 105, 290, { align: "center" })

      const ts = new Date().toISOString().slice(0, 10)
      doc.save(`historique-loyers-${ts}.pdf`)
    } catch {
      alert("Export PDF impossible. Réessayez.")
    }
    setExportingPdf(false)
  }

  if (status === "loading" || loading) {
    return (
      <main style={{ minHeight: "60vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'DM Sans', sans-serif", color: "#8a8477" }}>
        Chargement...
      </main>
    )
  }

  if (!bien) {
    return (
      <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", padding: isMobile ? "32px 16px" : "48px 24px" }}>
        <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,500&display=swap');`}</style>
        <div style={{ maxWidth: 720, margin: "0 auto", background: "#fff", border: "1px solid #EAE6DF", borderRadius: 20, padding: isMobile ? 32 : 48, textAlign: "center", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
          <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: isMobile ? 26 : 32, lineHeight: 1.15, letterSpacing: "-0.4px", color: "#111", marginBottom: 12 }}>
            Aucun logement actif
          </h1>
          <p style={{ fontSize: 14, color: "#8a8477", lineHeight: 1.6, marginBottom: 28, maxWidth: 480, margin: "0 auto 28px" }}>
            Vous n&apos;avez pas encore signé de bail via {BRAND.name}. Retrouvez vos candidatures en cours pour suivre leur avancement.
          </p>
          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <Link href="/mes-candidatures" style={{ background: "#111", color: "#fff", padding: "12px 26px", borderRadius: 999, textDecoration: "none", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.3px" }}>
              Mes candidatures
            </Link>
            <Link href="/annonces" style={{ background: "#fff", border: "1px solid #EAE6DF", color: "#111", padding: "12px 26px", borderRadius: 999, textDecoration: "none", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.3px" }}>
              Parcourir les annonces
            </Link>
          </div>
        </div>
      </main>
    )
  }

  const photoPrincipale = Array.isArray(bien.photos) && bien.photos.length > 0 ? bien.photos[0] : null
  const loyerTotal = (Number(bien.prix) || 0) + (Number(bien.charges) || 0)
  const timelineSteps = computeBailTimeline({
    annonce: {
      id: bien.id,
      statut: bien.statut,
      bail_genere_at: bien.bail_genere_at,
      date_debut_bail: bien.date_debut_bail,
      // V33.3 — sous-états signature pour wording locataire ("Vous avez signé").
      bail_signe_locataire_at: (bien as { bail_signe_locataire_at?: string | null }).bail_signe_locataire_at ?? null,
      bail_signe_bailleur_at: (bien as { bail_signe_bailleur_at?: string | null }).bail_signe_bailleur_at ?? null,
    },
    edls: edls as any,
    loyers: loyers as any,
    role: "locataire",
  })

  // V33.4 — Sous-état du bail pour adapter hero + CTA "Rappel bailleur".
  // 4 cas distincts : pas-encore-envoye / envoye-pas-signe / signe-locataire-seul / actif.
  const sigLocAt = bien.bail_signe_locataire_at || null
  const sigPropAt = bien.bail_signe_bailleur_at || null
  const bailEnvoye = !!bien.bail_genere_at
  const bailDoubleSigne = !!sigLocAt && !!sigPropAt
  let bailSousEtat: "pas_envoye" | "envoye_pas_signe_loc" | "signe_loc_attente_prop" | "actif"
  if (bailDoubleSigne) bailSousEtat = "actif"
  else if (sigLocAt) bailSousEtat = "signe_loc_attente_prop"
  else if (bailEnvoye) bailSousEtat = "envoye_pas_signe_loc"
  else bailSousEtat = "pas_envoye"

  // Calcule jours d'attente pertinent au sous-état
  const baseDateForJoursAttente = bailSousEtat === "signe_loc_attente_prop" && sigLocAt
    ? new Date(sigLocAt).getTime()
    : bien.bail_genere_at
      ? new Date(bien.bail_genere_at).getTime()
      : bien.date_debut_bail
        ? new Date(bien.date_debut_bail).getTime()
        : Date.now()
  const joursAttente = Math.max(0, Math.floor((Date.now() - baseDateForJoursAttente) / (24 * 60 * 60 * 1000)))
  const peutRelancerBailleur =
    (bailSousEtat === "pas_envoye" || bailSousEtat === "signe_loc_attente_prop") &&
    joursAttente >= 3
  // Rate-limit 24h cliquable côté client
  const dernierRappel = bien.bail_relance_locataire_at ? new Date(bien.bail_relance_locataire_at).getTime() : 0
  const peutCliquerRappel = peutRelancerBailleur && (Date.now() - dernierRappel >= 24 * 60 * 60 * 1000)

  // Hero adapté (eyebrow + titre + sous-titre)
  const heroEyebrow =
    bailSousEtat === "actif" ? "Bail actif"
    : bailSousEtat === "signe_loc_attente_prop" ? "Vous avez signé · en attente bailleur"
    : bailSousEtat === "envoye_pas_signe_loc" ? "Bail à signer"
    : "Invitation acceptée"
  const heroEyebrowColor =
    bailSousEtat === "actif" ? "#15803d"
    : bailSousEtat === "envoye_pas_signe_loc" ? "#9a3412"
    : "#a16207"
  const heroTitle =
    bailSousEtat === "actif" ? "Mon logement actuel"
    : bailSousEtat === "signe_loc_attente_prop" ? "Bail signé, en attente du bailleur"
    : bailSousEtat === "envoye_pas_signe_loc" ? "Votre bail est arrivé"
    : "Bail en préparation"
  const heroBody =
    bailSousEtat === "actif" ? "Retrouvez ici votre logement, votre propriétaire, et tous vos documents."
    : bailSousEtat === "signe_loc_attente_prop" ? "Vous avez signé le bail. Votre bailleur doit maintenant le contresigner pour finaliser. Une fois fait, vous recevrez le PDF complet par email."
    : bailSousEtat === "envoye_pas_signe_loc" ? "Votre bailleur vous a envoyé le bail. Ouvrez votre messagerie pour le lire intégralement et le signer."
    : "Vous avez accepté l'invitation de votre bailleur. Il prépare actuellement le bail PDF. Vous serez notifié dès qu'il vous l'envoie."

  async function relancerBailleur() {
    if (!bien) return
    try {
      const res = await fetch("/api/bail/relance-bailleur", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ annonceId: bien.id }),
      })
      const json = (await res.json()) as { ok: boolean; error?: string; sent?: boolean; skipped?: string }
      if (!res.ok || !json.ok) {
        alert(json.error || "Erreur — réessayez plus tard")
        return
      }
      window.dispatchEvent(new CustomEvent("km:toast", {
        detail: {
          type: "success",
          title: json.skipped === "no_resend_key" ? "Rappel enregistré (email désactivé en local)" : "Rappel envoyé au bailleur",
          body: "Une notification + un message viennent d'être envoyés.",
        },
      }))
      // Refresh bien pour update bail_relance_locataire_at
      setBien(prev => prev ? { ...prev, bail_relance_locataire_at: new Date().toISOString() } : prev)
    } catch (err) {
      alert(`Erreur : ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", padding: isMobile ? "24px 16px" : "40px 24px" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,500&display=swap');`}</style>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>

        {/* En-tête — V33.4 adaptatif selon sous-état du bail */}
        <p style={{ fontSize: 11, fontWeight: 700, color: heroEyebrowColor, textTransform: "uppercase", letterSpacing: "1.4px", marginBottom: 10 }}>
          {heroEyebrow}
        </p>
        <h1 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: isMobile ? 32 : 40, lineHeight: 1.1, letterSpacing: "-0.6px", color: "#111", margin: "0 0 10px" }}>
          {heroTitle}
        </h1>
        <p style={{ fontSize: 14, color: "#8a8477", marginBottom: 24, maxWidth: 600, lineHeight: 1.6 }}>
          {heroBody}
        </p>

        {/* V33.4 — Bouton "Renvoyer un rappel au bailleur" si > 3j attente */}
        {peutRelancerBailleur && (
          <div style={{ background: "#FBF6EA", border: "1px solid #EADFC6", borderRadius: 14, padding: "14px 18px", marginBottom: 20, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ flex: 1, minWidth: 200 }}>
              <p style={{ fontWeight: 700, color: "#9a3412", margin: 0, fontSize: 13 }}>
                {joursAttente} jour{joursAttente > 1 ? "s" : ""} sans nouvelles
              </p>
              <p style={{ fontSize: 12, color: "#a16207", margin: "2px 0 0", lineHeight: 1.5 }}>
                {bailSousEtat === "pas_envoye"
                  ? "Votre bailleur n'a pas encore envoyé le bail."
                  : "Votre bailleur n'a pas encore contresigné."}
              </p>
            </div>
            <button
              type="button"
              onClick={relancerBailleur}
              disabled={!peutCliquerRappel}
              title={!peutCliquerRappel ? "Un rappel a déjà été envoyé dans les 24 dernières heures" : "Envoyer un rappel par email + notif au bailleur"}
              style={{
                background: peutCliquerRappel ? "#9a3412" : "#EAE6DF",
                color: peutCliquerRappel ? "#fff" : "#8a8477",
                border: "none",
                borderRadius: 999,
                padding: "10px 18px",
                fontSize: 12,
                fontWeight: 700,
                cursor: peutCliquerRappel ? "pointer" : "not-allowed",
                fontFamily: "inherit",
                whiteSpace: "nowrap",
              }}
            >
              🔔 Renvoyer un rappel au bailleur
            </button>
          </div>
        )}

        <div style={{ marginBottom: 24 }}>
          <BailTimeline steps={timelineSteps} />
        </div>

        {/* V36.3 — Section Avenants (audit V35 R35.1). Affiche les avenants
            actifs/proposés/signés. Filtré : on cache les "annule" (sauf si
            l'user veut les voir, à activer plus tard). */}
        {avenants.filter(a => a.statut !== "annule").length > 0 && (
          <section style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12, gap: 10, flexWrap: "wrap" }}>
              <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, margin: 0, letterSpacing: "-0.3px", color: "#111" }}>
                Modifications du bail
              </h2>
              <p style={{ fontSize: 11, color: "#8a8477", margin: 0, letterSpacing: "0.3px" }}>
                {avenants.filter(a => a.statut !== "annule").length} avenant{avenants.filter(a => a.statut !== "annule").length > 1 ? "s" : ""}
              </p>
            </div>
            {avenants
              .filter(a => a.statut !== "annule")
              .map(a => (
                <AvenantCard
                  key={a.id}
                  avenant={a}
                  myRole="locataire"
                  myEmail={(session?.user?.email || "").toLowerCase()}
                  onRefreshed={refreshAvenants}
                />
              ))}
          </section>
        )}

        {/* V34.5 — Préavis : countdown si donné, ou bouton "Donner congé" si bail actif */}
        {bailSousEtat === "actif" && bien.preavis_donne_par && bien.preavis_fin_calculee && (() => {
          const jours = joursAvantFinPreavis(bien.preavis_fin_calculee)
          const par = bien.preavis_donne_par === "locataire" ? "vous" : "votre bailleur"
          const dateFr = new Date(bien.preavis_fin_calculee).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
          const urgent = jours <= 30
          return (
            <div style={{
              background: urgent ? "#FEECEC" : "#FBF6EA",
              border: `1px solid ${urgent ? "#F4C9C9" : "#EADFC6"}`,
              borderRadius: 14, padding: "16px 20px", marginBottom: 20,
            }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: urgent ? "#b91c1c" : "#9a3412", textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 6px" }}>
                Préavis donné par {par}
              </p>
              <p style={{ fontSize: 14, color: "#111", margin: "0 0 6px", lineHeight: 1.55 }}>
                Fin de bail le <strong>{dateFr}</strong>
                {jours > 0 ? ` — ${formatJoursRestants(jours)}` : jours === 0 ? " — aujourd'hui" : ` — passé de ${Math.abs(jours)} jour${Math.abs(jours) > 1 ? "s" : ""}`}
              </p>
              {bien.preavis_motif_detail && (
                <p style={{ fontSize: 12, color: "#6b6559", margin: 0, fontStyle: "italic" }}>
                  « {bien.preavis_motif_detail} »
                </p>
              )}
              {/* V38.5 — Bouton download PDF lettre congé (audit V37 R37.6). */}
              <button
                type="button"
                onClick={async () => {
                  const motifList = bien.preavis_donne_par === "locataire" ? LOCATAIRE_MOTIFS : PROPRIETAIRE_MOTIFS
                  const motifEntry = motifList.find(m => m.code === (bien.preavis_motif as string))
                  const auteurEstLoc = bien.preavis_donne_par === "locataire"
                  const myEmail = (session?.user?.email || "").toLowerCase()
                  try {
                    await genererPreavisPDF({
                      qui: bien.preavis_donne_par as "locataire" | "proprietaire",
                      nomAuteur: auteurEstLoc ? (session?.user?.name || myEmail || "Locataire") : (bien.proprietaire_email || "Bailleur"),
                      adresseAuteur: auteurEstLoc ? "" : "",
                      nomDestinataire: auteurEstLoc ? (bien.proprietaire_email || "Bailleur") : (myEmail || "Locataire"),
                      adresseDestinataire: bien.adresse || "",
                      titreBien: bien.titre || "Logement",
                      adresseBien: bien.adresse || bien.titre || "",
                      villeBien: bien.ville || "",
                      motif: (bien.preavis_motif || "autre") as never,
                      motifLabel: motifEntry?.label || (bien.preavis_motif as string) || "",
                      motifDetail: bien.preavis_motif_detail || undefined,
                      dateEnvoi: bien.preavis_date_envoi ? bien.preavis_date_envoi.slice(0, 10) : new Date().toISOString().slice(0, 10),
                      delaiMois: 0,
                      dateFinEffective: bien.preavis_fin_calculee || new Date().toISOString().slice(0, 10),
                    })
                  } catch (e) {
                    alert(`Erreur PDF : ${e instanceof Error ? e.message : String(e)}`)
                  }
                }}
                style={{ marginTop: 10, background: "#fff", color: urgent ? "#b91c1c" : "#9a3412", border: `1px solid ${urgent ? "#F4C9C9" : "#EADFC6"}`, borderRadius: 999, padding: "8px 16px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.3px" }}
              >
                📄 Télécharger la lettre de congé (PDF)
              </button>
            </div>
          )
        })()}
        {bailSousEtat === "actif" && !bien.preavis_donne_par && (
          <div style={{ marginBottom: 20 }}>
            <button
              type="button"
              onClick={() => setPreavisOpen(true)}
              style={{
                background: "#fff", color: "#9a3412",
                border: "1px solid #EADFC6", borderRadius: 999,
                padding: "10px 22px", fontSize: 12, fontWeight: 700,
                cursor: "pointer", fontFamily: "inherit",
                textTransform: "uppercase", letterSpacing: "0.3px",
              }}
            >
              ✉️ Donner congé
            </button>
          </div>
        )}

        {/* Hero unifié — 1 seul card avec photo 380px gauche + infos flex droite,
            mini-stats inline Loyer / Charges / Surface / DPE.
            Fidèle handoff (3) pages.jsx l. 322-340. Avant : 2 cards séparées. */}
        <div style={{ background: "#fff", border: "1px solid #EAE6DF", borderRadius: 20, overflow: "hidden", marginBottom: 20, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "380px 1fr", gap: 0 }}>
            {/* Photo gauche — fixe 380px desktop, full mobile */}
            <div style={{
              backgroundImage: photoPrincipale
                ? `url(${photoPrincipale})`
                : "linear-gradient(135deg, #F7F4EF, #EAE6DF)",
              backgroundSize: "cover",
              backgroundPosition: "center",
              minHeight: isMobile ? 220 : 280,
            }} />
            {/* Infos droite — eyebrow + titre + adresse + mini-stats row + CTA */}
            <div style={{ padding: isMobile ? "22px 22px" : "28px 32px", display: "flex", flexDirection: "column" }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 10px" }}>Votre adresse</p>
              <h2 style={{ fontSize: 26, fontWeight: 500, letterSpacing: "-0.6px", margin: 0, marginBottom: 4, color: "#111" }}>{bien.titre}</h2>
              <p style={{ fontSize: 14, color: "#8a8477", marginBottom: 20, margin: "0 0 20px" }}>
                {bien.adresse ? <>{bien.adresse} </> : ""}{bien.ville}
              </p>
              <div style={{ display: "flex", gap: isMobile ? 16 : 24, fontSize: 13, paddingTop: 18, borderTop: "1px solid #EAE6DF", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" as const, letterSpacing: "-0.4px", color: "#111" }}>{bien.prix} €</div>
                  <div style={{ fontSize: 10, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1px", fontWeight: 700, marginTop: 2 }}>Loyer</div>
                </div>
                {bien.charges ? (
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" as const, letterSpacing: "-0.4px", color: "#111" }}>+{bien.charges} €</div>
                    <div style={{ fontSize: 10, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1px", fontWeight: 700, marginTop: 2 }}>Charges</div>
                  </div>
                ) : null}
                {bien.surface ? (
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 700, fontVariantNumeric: "tabular-nums" as const, letterSpacing: "-0.4px", color: "#111" }}>{bien.surface} m²</div>
                    <div style={{ fontSize: 10, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1px", fontWeight: 700, marginTop: 2 }}>{bien.pieces ? `${bien.pieces} ${bien.pieces > 1 ? "pièces" : "pièce"}` : "Surface"}</div>
                  </div>
                ) : null}
                {bien.dpe ? (
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.4px", color: "#111", display: "inline-flex", alignItems: "center", gap: 6 }}>
                      {bien.dpe}
                      <span style={{ fontSize: 10, background: "#FCD34D", color: "#78350F", padding: "2px 7px", borderRadius: 4, fontWeight: 700 }}>DPE</span>
                    </div>
                    <div style={{ fontSize: 10, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1px", fontWeight: 700, marginTop: 2 }}>Énergie</div>
                  </div>
                ) : null}
              </div>
              {/* V25.1 — single source via helper (annonces > import_metadata) */}
              {(() => {
                const dateFr = getDateDebutBailFr(bien)
                return dateFr ? (
                  <p style={{ fontSize: 12, color: "#8a8477", margin: "16px 0 0" }}>
                    Bail signé le <strong style={{ color: "#111", fontWeight: 600 }}>{dateFr}</strong>
                  </p>
                ) : null
              })()}
              <div style={{ marginTop: "auto", paddingTop: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link
                  href={`/messages?with=${encodeURIComponent(bien.proprietaire_email)}`}
                  style={{ background: "#111", color: "#fff", borderRadius: 999, padding: "11px 22px", textDecoration: "none", fontWeight: 700, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.4px" }}
                >
                  Contacter mon propriétaire
                </Link>
                <Link
                  href={`/annonces/${bien.id}`}
                  style={{ background: "#fff", color: "#111", border: "1px solid #EAE6DF", borderRadius: 999, padding: "11px 22px", textDecoration: "none", fontWeight: 600, fontSize: 12, textTransform: "uppercase", letterSpacing: "0.3px" }}
                >
                  Voir la fiche
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* Raccourcis */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
          <QuickLink href="/visites" title="Visites à venir" value={String(visitesAVenir)} bg="#EEF3FB" border="#D7E3F4" color="#1d4ed8" />
          <QuickLink href="/carnet" title="Carnet d'entretien" value="Accéder" bg="#FBF6EA" border="#EADFC6" color="#a16207" />
          <QuickLink href={`/annonces/${bien.id}`} title="Fiche du bien" value="Consulter" bg="#F7F4EF" border="#EAE6DF" color="#111" />
          <QuickLink href="/dossier" title="Mon dossier" value="Mettre à jour" bg="#F0FAEE" border="#C6E9C0" color="#15803d" />
        </div>

        {/* ─── V53.11 — Mes documents (vue centralisée) ───────────────────
            Aggregation de TOUS les documents du logement : bail, EDL,
            quittances, préavis. User constraint V53 : "n'oublie pas le
            stockage des docs dans les conversations et également on a
            un onglet documents donc ne l'oublie".

            Lit en lecture seule depuis les sources existantes :
            - Bail : bailPayload (=[BAIL_CARD]) + bailFichierUrl si externe
            - EDL : edls[] (table etats_des_lieux)
            - Quittances : loyers[] avec statut="confirmé" + quittance_envoyee_at
            - Préavis : bien.preavis_donne_par + preavis_date_envoi

            Pas de nouveau bucket à créer — tout est déjà persisté ailleurs.
            Cette section ne fait QUE l'aggregation et le linking. */}
        {(() => {
          const docs: Array<{
            categorie: "bail" | "edl" | "quittance" | "preavis"
            label: string
            sub: string
            href: string
            badge?: { text: string; tone: "ok" | "warn" | "neutral" }
          }> = []

          // 1. Bail
          if (bailPayload || bailFichierUrl) {
            const sigCount = signatures.length
            const hasLoc = signatures.some(s => s.role === "locataire")
            const hasBail = signatures.some(s => s.role === "bailleur")
            const isFullySigned = hasLoc && hasBail
            docs.push({
              categorie: "bail",
              label: `Bail · ${bien.titre || "Logement"}`,
              sub: isFullySigned
                ? `Signé · ${sigCount} signature${sigCount > 1 ? "s" : ""}`
                : sigCount > 0
                  ? `En attente · ${sigCount} signature${sigCount > 1 ? "s" : ""} sur 2`
                  : "Non signé",
              href: "#mon-bail",
              badge: isFullySigned
                ? { text: "Actif", tone: "ok" }
                : sigCount > 0
                  ? { text: "En cours", tone: "warn" }
                  : { text: "À signer", tone: "warn" },
            })
          }

          // 2. EDL — un par entrée/sortie
          for (const e of edls) {
            const typeLabel = e.type === "sortie" ? "sortie" : "entrée"
            const dateLabel = e.date_edl
              ? new Date(e.date_edl).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })
              : ""
            const statutLabel = e.statut === "valide"
              ? "Validé par les 2 parties"
              : e.statut === "conteste"
                ? "Contesté"
                : e.statut === "envoye"
                  ? "Envoyé · à signer"
                  : "Brouillon"
            const badgeTone: "ok" | "warn" | "neutral" =
              e.statut === "valide" ? "ok"
              : e.statut === "conteste" || e.statut === "envoye" ? "warn"
              : "neutral"
            docs.push({
              categorie: "edl",
              label: `État des lieux ${typeLabel}${dateLabel ? ` · ${dateLabel}` : ""}`,
              sub: statutLabel,
              href: `/edl/consulter/${e.id}`,
              badge: { text: statutLabel.split(" ·")[0], tone: badgeTone },
            })
          }

          // 3. Quittances confirmées avec PDF disponible
          const quittancesEnvoyees = loyers
            .filter(l => l.statut === "confirmé" && l.quittance_envoyee_at)
            .slice(0, 6)
          for (const q of quittancesEnvoyees) {
            const moisLabel = q.mois
              ? new Date(q.mois + "-01T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
              : ""
            docs.push({
              categorie: "quittance",
              label: `Quittance ${moisLabel}`,
              sub: typeof q.montant === "number" ? `${q.montant.toLocaleString("fr-FR")} €` : "—",
              href: "/mes-quittances",
              badge: { text: "Disponible", tone: "ok" },
            })
          }

          // 4. Préavis donné
          if (bien.preavis_donne_par) {
            const par = bien.preavis_donne_par === "locataire" ? "vous" : "votre bailleur"
            const dateEnvoi = bien.preavis_date_envoi
              ? new Date(bien.preavis_date_envoi).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
              : ""
            const dateFin = bien.preavis_fin_calculee
              ? new Date(bien.preavis_fin_calculee).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
              : ""
            docs.push({
              categorie: "preavis",
              label: `Préavis donné par ${par}`,
              sub: dateEnvoi
                ? `Notifié le ${dateEnvoi}${dateFin ? ` · fin de bail le ${dateFin}` : ""}`
                : "Préavis en cours",
              href: "#mon-bail",
              badge: { text: "En cours", tone: "warn" },
            })
          }

          if (docs.length === 0) return null

          const toneStyle = (t: "ok" | "warn" | "neutral") =>
            t === "ok"
              ? { bg: "#F0FAEE", border: "#C6E9C0", color: "#15803d" }
              : t === "warn"
                ? { bg: "#FBF6EA", border: "#EADFC6", color: "#a16207" }
                : { bg: "#F7F4EF", border: "#EAE6DF", color: "#8a8477" }

          const iconByCat = (c: typeof docs[number]["categorie"]) => {
            // Petites icônes SVG inline, hairline
            const stroke = "#111"
            switch (c) {
              case "bail":
                return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`
              case "edl":
                return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11H7v8h10V11h-2"/><path d="M9 7h6v4H9z"/><path d="M12 3v4"/></svg>`
              case "quittance":
                return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8"/><path d="M12 6v2m0 8v2"/></svg>`
              case "preavis":
                return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s-8-4.5-8-12V5l8-3 8 3v5c0 7.5-8 12-8 12z"/></svg>`
            }
          }

          return (
            <section style={{ background: "#fff", border: "1px solid #EAE6DF", borderRadius: 20, padding: isMobile ? 22 : 26, marginBottom: 16, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
                <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, margin: 0, letterSpacing: "-0.3px", color: "#111" }}>
                  Mes documents
                </h2>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#8a8477", background: "#F7F4EF", border: "1px solid #EAE6DF", padding: "4px 12px", borderRadius: 999, textTransform: "uppercase" as const, letterSpacing: "1.2px" }}>
                  {docs.length} document{docs.length > 1 ? "s" : ""}
                </span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: 10 }}>
                {docs.map((d, i) => {
                  const t = d.badge ? toneStyle(d.badge.tone) : { bg: "#F7F4EF", border: "#EAE6DF", color: "#8a8477" }
                  const isAnchor = d.href.startsWith("#")
                  const Tag: typeof Link | "a" = isAnchor ? "a" : Link
                  return (
                    <Tag key={i} href={d.href} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: "#fff", border: `1px solid ${t.border}`, borderRadius: 14, textDecoration: "none", color: "inherit" }}>
                      <div style={{ width: 36, height: 36, borderRadius: 10, background: t.bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }} dangerouslySetInnerHTML={{ __html: iconByCat(d.categorie) || "" }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#111", letterSpacing: "-0.1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.label}</div>
                        <div style={{ fontSize: 11, color: "#8a8477", marginTop: 2, letterSpacing: "0.1px" }}>{d.sub}</div>
                      </div>
                      {d.badge && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: t.color, background: t.bg, border: `1px solid ${t.border}`, padding: "3px 8px", borderRadius: 999, textTransform: "uppercase" as const, letterSpacing: "1.1px", whiteSpace: "nowrap" }}>
                          {d.badge.text}
                        </span>
                      )}
                    </Tag>
                  )
                })}
              </div>
              <p style={{ fontSize: 11, color: "#8a8477", margin: "14px 0 0", lineHeight: 1.5 }}>
                Cliquez sur un document pour l'ouvrir. Les versions PDF sont également disponibles via les sections détaillées ci-dessous.
              </p>
            </section>
          )
        })()}

        {/* ─── États des lieux ─── */}
        <div style={{ background: "#fff", border: "1px solid #EAE6DF", borderRadius: 20, padding: isMobile ? 22 : 26, marginBottom: 16, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 12, flexWrap: "wrap" }}>
            <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, margin: 0, letterSpacing: "-0.3px", color: "#111" }}>États des lieux</h2>
            {edls.some(e => e.statut === "envoye") && (
              <span style={{ background: "#FBF6EA", color: "#a16207", border: "1px solid #EADFC6", padding: "4px 12px", borderRadius: 999, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px" }}>
                Action requise
              </span>
            )}
          </div>
          {edls.length === 0 ? (
            <p style={{ fontSize: 13, color: "#8a8477", margin: 0 }}>Aucun état des lieux pour l&apos;instant.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {edls.map(e => {
                const typeLabel = e.type === "entree" ? "Entrée" : "Sortie"
                const dateStr = e.date_edl ? new Date(e.date_edl).toLocaleDateString("fr-FR") : ""
                const statutStyle = e.statut === "valide"
                  ? { bg: "#F0FAEE", color: "#15803d", border: "#C6E9C0", label: "Validé" }
                  : e.statut === "conteste"
                  ? { bg: "#FEECEC", color: "#b91c1c", border: "#F4C9C9", label: "Contesté" }
                  : e.statut === "envoye"
                  ? { bg: "#FBF6EA", color: "#a16207", border: "#EADFC6", label: "À valider" }
                  : { bg: "#F7F4EF", color: "#6b6559", border: "#EAE6DF", label: e.statut }
                return (
                  <Link key={e.id} href={`/edl/consulter/${e.id}`}
                    style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", border: "1px solid #EAE6DF", borderRadius: 14, textDecoration: "none", color: "#111", gap: 10, background: "#fff" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: "#111" }}>EDL {typeLabel}</span>
                      <span style={{ color: "#EAE6DF" }}>·</span>
                      <span style={{ color: "#8a8477", fontSize: 12 }}>{dateStr}</span>
                    </div>
                    <span style={{ background: statutStyle.bg, color: statutStyle.color, border: `1px solid ${statutStyle.border}`, padding: "3px 10px", borderRadius: 999, fontSize: 10, fontWeight: 700, flexShrink: 0, textTransform: "uppercase", letterSpacing: "1.2px" }}>{statutStyle.label}</span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>

        {/* ─── Quittances / Loyers ─── */}
        {(() => {
          const retards = loyers
            .map(l => ({ l, jours: joursRetardLoyer(l.mois, l.statut) }))
            .filter(x => x.jours > 0)
          const retardMax = retards.reduce((m, x) => x.jours > m.jours ? x : m, { l: null as any, jours: 0 })
          return (
            <div style={{ background: "#fff", border: "1px solid #EAE6DF", borderRadius: 20, padding: isMobile ? 22 : 26, marginBottom: 16, boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, gap: 10, flexWrap: "wrap" }}>
                <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, margin: 0, letterSpacing: "-0.3px", color: "#111" }}>Mes loyers</h2>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  {retards.length > 0 && (
                    <span style={{ background: "#FEECEC", border: "1px solid #F4C9C9", color: "#b91c1c", padding: "4px 12px", borderRadius: 999, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px" }}>
                      {retards.length} en retard
                    </span>
                  )}
                  {loyers.length > 0 && (
                    <button type="button" onClick={exportHistoriqueLoyersPDF} disabled={exportingPdf}
                      style={{ background: "#fff", border: "1px solid #EAE6DF", borderRadius: 999, padding: "7px 16px", fontSize: 11, fontWeight: 600, color: "#111", cursor: exportingPdf ? "wait" : "pointer", fontFamily: "inherit", opacity: exportingPdf ? 0.6 : 1, textTransform: "uppercase", letterSpacing: "0.3px" }}>
                      {exportingPdf ? "Export…" : "Télécharger PDF"}
                    </button>
                  )}
                </div>
              </div>
              {retardMax.l && (
                <div style={{ background: "#FEECEC", border: "1px solid #F4C9C9", borderRadius: 14, padding: "12px 16px", marginBottom: 12, fontSize: 13, color: "#b91c1c", lineHeight: 1.5 }}>
                  <strong style={{ fontWeight: 600 }}>Retard de paiement</strong> — votre loyer {new Date(retardMax.l.mois + "-01T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })} est en retard de {retardMax.jours} jour{retardMax.jours > 1 ? "s" : ""}. Contactez votre propriétaire dès que possible.
                </div>
              )}

              {/* Auto-paiement actif → badge info */}
              {bien.auto_paiement_actif && (
                <div style={{ background: "#F0FAEE", border: "1px solid #C6E9C0", borderRadius: 14, padding: "12px 16px", marginBottom: 12, fontSize: 13, color: "#15803d", fontWeight: 500, display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ width: 22, height: 22, borderRadius: "50%", background: "#DCF5E4", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  </span>
                  Virement automatique actif — vos loyers sont confirmés automatiquement chaque mois.
                </div>
              )}

              {/* Déclarer un paiement / Mettre en place auto-paiement */}
              {(() => {
                const moisCourant = new Date().toISOString().slice(0, 7)
                const dejaCree = loyers.find(l => l.mois === moisCourant)
                const dejaConfirme = dejaCree?.statut === "confirmé"
                const dejaDeclare = dejaCree?.statut === "déclaré"
                const moisLabel = new Date(moisCourant + "-01T12:00:00").toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
                // Si auto-paiement actif : rien à afficher, le mois est déjà auto-créé
                if (bien.auto_paiement_actif || dejaConfirme) return null
                return (
                  <div style={{ background: "#EEF3FB", border: "1px solid #D7E3F4", borderRadius: 14, padding: "14px 18px", marginBottom: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
                      <div style={{ flex: 1, minWidth: 160 }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: "#1d4ed8", margin: "0 0 4px", textTransform: "uppercase", letterSpacing: "1.2px" }}>
                          Loyer de {moisLabel}
                        </p>
                        <p style={{ fontSize: 13, color: "#1d4ed8", margin: 0 }}>
                          {dejaDeclare
                            ? "Paiement signalé — en attente de confirmation par votre propriétaire."
                            : "Signalez votre paiement."}
                        </p>
                      </div>
                      {!dejaDeclare && (
                        <button
                          onClick={() => declarerPaiement(moisCourant)}
                          style={{ background: "#111", color: "#fff", border: "none", borderRadius: 999, padding: "9px 18px", fontWeight: 600, fontSize: 11, cursor: "pointer", fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.3px" }}
                        >
                          J&apos;ai payé
                        </button>
                      )}
                    </div>
                    <div style={{ borderTop: "1px solid #D7E3F4", paddingTop: 10 }}>
                      <button
                        onClick={demanderAutoPaiement}
                        style={{ background: "transparent", border: "1px dashed #1d4ed8", color: "#1d4ed8", borderRadius: 999, padding: "8px 14px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit", width: "100%", textTransform: "uppercase", letterSpacing: "0.3px" }}
                      >
                        J&apos;ai mis en place un virement automatique
                      </button>
                    </div>
                  </div>
                )
              })()}
              {/* V33.5 — Échéancier projection complète : merge loyers DB + mois futurs */}
              {(() => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const dureeBail = Number((bailPayload as any)?.duree) || 36
                const loyerCC = Number(bien.prix || 0) + Number(bien.charges || 0)
                const echeancier = projeterEcheancierBail({
                  dateDebutBail: bien.date_debut_bail,
                  dureeMois: dureeBail,
                  loyerCC,
                  loyersExistants: loyers,
                })
                const next = prochaineEcheance(echeancier)
                if (echeancier.length === 0) {
                  return <p style={{ fontSize: 13, color: "#8a8477", margin: 0 }}>Aucun loyer enregistré pour l&apos;instant.</p>
                }
                return (
                  <>
                    {next && next.statut !== "paye" && (
                      <div style={{
                        background: next.statut === "imminent" ? "#FBF6EA" : next.statut === "retard" ? "#FEECEC" : "#EEF3FB",
                        border: `1px solid ${next.statut === "imminent" ? "#EADFC6" : next.statut === "retard" ? "#F4C9C9" : "#D7E3F4"}`,
                        borderRadius: 14, padding: "12px 16px", marginBottom: 12, fontSize: 13, lineHeight: 1.55,
                        color: next.statut === "imminent" ? "#a16207" : next.statut === "retard" ? "#b91c1c" : "#1d4ed8",
                      }}>
                        <strong>Prochaine échéance</strong> — {new Date(next.echeanceIso).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}
                        {next.joursAvantEcheance > 0 ? ` (dans ${next.joursAvantEcheance} jour${next.joursAvantEcheance > 1 ? "s" : ""})` : next.joursAvantEcheance === 0 ? " (aujourd'hui)" : ` (en retard de ${Math.abs(next.joursAvantEcheance)} jour${Math.abs(next.joursAvantEcheance) > 1 ? "s" : ""})`}
                        {" — "}{next.montant.toLocaleString("fr-FR")} €
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {echeancier.map(e => {
                        const moisLabel = new Date(e.echeanceIso).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
                        const isPaye = e.statut === "paye"
                        const isRetard = e.statut === "retard" || e.statut === "passe_inconnu"
                        const isImminent = e.statut === "imminent"
                        const isFutur = e.statut === "futur"
                        const isDeclare = e.statut === "declare"
                        const rowBg = isPaye ? "#F0FAEE" : isRetard ? "#FEECEC" : isImminent ? "#FBF6EA" : isDeclare ? "#EEF3FB" : "#fff"
                        const rowBorder = isPaye ? "#C6E9C0" : isRetard ? "#F4C9C9" : isImminent ? "#EADFC6" : isDeclare ? "#D7E3F4" : "#EAE6DF"
                        const chipColor = isPaye ? "#15803d" : isRetard ? "#b91c1c" : isImminent ? "#a16207" : isDeclare ? "#1d4ed8" : "#8a8477"
                        const chipLabel =
                          isPaye ? "Payé"
                          : e.statut === "retard" ? `Retard ${Math.abs(e.joursAvantEcheance)} j`
                          : e.statut === "passe_inconnu" ? "À déclarer"
                          : isImminent ? `Dans ${e.joursAvantEcheance} j`
                          : isDeclare ? "Déclaré"
                          : "Futur"
                        return (
                          <div key={e.mois} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", border: `1px solid ${rowBorder}`, borderRadius: 14, gap: 10, background: rowBg, opacity: isFutur ? 0.78 : 1 }}>
                            <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 }}>
                              <span style={{ fontWeight: 600, fontSize: 13, textTransform: "capitalize", color: "#111" }}>{moisLabel}</span>
                              <span style={{ color: "#8a8477", fontSize: 12 }}>{e.montant.toLocaleString("fr-FR")} €</span>
                            </div>
                            <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                              <span style={{ background: "#fff", color: chipColor, border: `1px solid ${rowBorder}`, padding: "3px 10px", borderRadius: 999, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px" }}>
                                {chipLabel}
                              </span>
                              {e.quittanceDispo && (
                                <Link href="/messages" style={{ fontSize: 10, color: "#111", fontWeight: 600, textDecoration: "none", textTransform: "uppercase", letterSpacing: "0.3px" }}>Quittance →</Link>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )
              })()}
            </div>
          )
        })()}

        {/* Bail actif */}
        {bailPayload && (() => {
          const sigLocataire = signatures.find(s => s.role === "locataire")
          const sigBailleur = signatures.find(s => s.role === "bailleur")
          const dejaSigne = !!sigLocataire
          const doubleSigne = !!sigLocataire && !!sigBailleur
          return (
            <div id="mon-bail" style={{ background: "#fff", border: "1px solid #EAE6DF", borderRadius: 20, padding: isMobile ? 22 : 26, marginBottom: 16, boxShadow: "0 1px 2px rgba(0,0,0,0.02)", scrollMarginTop: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10, flexWrap: "wrap" }}>
                <h2 style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 22, margin: 0, letterSpacing: "-0.3px", color: "#111" }}>Mon bail</h2>
                <div style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {/* V34.2 — Badge intégrité SHA-256 (caché si no_signature ou legacy) */}
                  {dejaSigne && <IntegrityBadge annonceId={bien.id} />}
                  {doubleSigne ? (
                    <span style={{ background: "#F0FAEE", color: "#15803d", border: "1px solid #C6E9C0", padding: "4px 12px", borderRadius: 999, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px" }}>
                      Signé par les deux parties
                    </span>
                  ) : dejaSigne ? (
                    <span style={{ background: "#F0FAEE", color: "#15803d", border: "1px solid #C6E9C0", padding: "4px 12px", borderRadius: 999, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px" }}>
                      Signé — en attente du propriétaire
                    </span>
                  ) : (
                    <span style={{ background: "#FBF6EA", color: "#a16207", border: "1px solid #EADFC6", padding: "4px 12px", borderRadius: 999, fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "1.2px" }}>
                      Action requise — signer
                    </span>
                  )}
                </div>
              </div>
              {/* V25.1 — helper getDateDebutBailFr */}
              {(() => {
                const dateFr = getDateDebutBailFr(bien)
                return dateFr ? (
                  <p style={{ fontSize: 13, color: "#8a8477", margin: "0 0 14px" }}>
                    Bail du {dateFr}{bailFichierUrl ? " — document fourni par votre propriétaire" : " — généré via KeyMatch"}.
                  </p>
                ) : null
              })()}

              {/* Résumé signatures */}
              {signatures.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
                  {sigLocataire && (
                    <div style={{ fontSize: 13, color: "#15803d", fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 20, height: 20, borderRadius: "50%", background: "#DCF5E4", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      </span>
                      Vous avez signé le {new Date(sigLocataire.signeAt).toLocaleDateString("fr-FR")}
                    </div>
                  )}
                  {sigBailleur && (
                    <div style={{ fontSize: 13, color: "#15803d", fontWeight: 500, display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 20, height: 20, borderRadius: "50%", background: "#DCF5E4", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#15803d" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      </span>
                      Votre propriétaire a signé le {new Date(sigBailleur.signeAt).toLocaleDateString("fr-FR")}
                    </div>
                  )}
                </div>
              )}

              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {!dejaSigne && bien && (
                  <button
                    onClick={() => setSignModalOpen(true)}
                    style={{ background: "#111", color: "#fff", border: "none", borderRadius: 999, padding: "11px 24px", fontWeight: 600, fontSize: 12, cursor: "pointer", fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.3px" }}
                  >
                    Signer le bail
                  </button>
                )}
                <button
                  onClick={telechargerBail}
                  disabled={downloadingBail}
                  style={{ background: "#fff", border: "1px solid #EAE6DF", color: "#111", borderRadius: 999, padding: "11px 24px", fontWeight: 600, fontSize: 12, cursor: downloadingBail ? "wait" : "pointer", fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.3px" }}
                >
                  {downloadingBail ? "Téléchargement…" : "Télécharger le bail (PDF)"}
                </button>
              </div>

              {doubleSigne && edls.length === 0 && (
                <div style={{ marginTop: 16, padding: "14px 18px", background: "#EEF3FB", border: "1px solid #D7E3F4", borderRadius: 14, fontSize: 13, color: "#1d4ed8", lineHeight: 1.6 }}>
                  <strong style={{ fontWeight: 600 }}>Prochaine étape :</strong> état des lieux d&apos;entrée avec votre propriétaire.
                  Vous le retrouverez ici dès qu&apos;il sera créé.
                </div>
              )}
            </div>
          )
        })()}
      </div>

      {signModalOpen && bailPayload && bien && (
        <BailSignatureModal
          open={signModalOpen}
          onClose={() => setSignModalOpen(false)}
          onSigned={() => { setSignModalOpen(false); void onSigned() }}
          bailData={bailPayload as BailData}
          annonceId={bien.id}
          role="locataire"
          nomDefaut={session?.user?.name || ""}
        />
      )}

      {/* V34.5 — Modale "Donner congé" côté locataire */}
      {bien && (
        <PreavisModal
          open={preavisOpen}
          onClose={() => setPreavisOpen(false)}
          onSubmitted={() => {
            // Refresh bien pour récup preavis_*
            const email = session?.user?.email?.toLowerCase()
            if (!email) return
            void supabase
              .from("annonces")
              .select("*")
              .eq("id", bien.id)
              .single()
              .then(({ data }) => { if (data) setBien(data as Bien) })
          }}
          role="locataire"
          annonceId={bien.id}
          meuble={!!bien.meuble}
          zoneTendue={estZoneTendue(bien.ville || "")}
        />
      )}
    </main>
  )
}

function QuickLink({ href, title, value, bg, border, color }: { href: string; title: string; value: string; bg: string; border: string; color: string }) {
  return (
    <Link href={href} style={{ background: bg, border: `1px solid ${border}`, borderRadius: 16, padding: "16px 18px", textDecoration: "none", display: "block" }}>
      <p style={{ fontSize: 10, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "1.2px", margin: "0 0 6px" }}>{title}</p>
      <p style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "#111", letterSpacing: "-0.2px" }}>{value}</p>
    </Link>
  )
}

// Stat helper retiré — remplacé par les sections EDL / Quittances / Bail
