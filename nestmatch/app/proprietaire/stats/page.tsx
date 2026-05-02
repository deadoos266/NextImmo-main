"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { supabase } from "../../../lib/supabase"
import { Suspense } from "react"
// jsPDF lazy-loaded pour alleger le bundle initial (voir genererQuittancePDF)
import { useResponsive } from "../../hooks/useResponsive"
import LocataireEmailField from "../../components/LocataireEmailField"
import { BRAND } from "../../../lib/brand"
import { drawLogoPDF } from "../../../lib/brandPDF"

// ─── SVG Bar Chart ──────────────────────────────────────────────────────────

function BarChart({
  items,
  refVal,
}: {
  items: { label: string; amount: number; confirmed: boolean }[]
  refVal: number
}) {
  if (items.every(d => d.amount === 0)) return (
    <div style={{ textAlign: "center", padding: "40px 0", color: "#8a8477" }}>
      <p style={{ fontSize: 13 }}>Aucun loyer enregistré sur cette période</p>
    </div>
  )

  const max = Math.max(...items.map(d => d.amount), refVal, 1)
  const BAR_W = Math.max(28, Math.min(56, Math.floor(640 / items.length) - 8))
  const GAP = 8
  const H = 150
  const totalW = items.length * (BAR_W + GAP)
  const refY = H - Math.round((refVal / max) * H)

  return (
    <div style={{ overflowX: "auto" }}>
      <svg
        width={Math.max(totalW, 400)}
        height={H + 52}
        style={{ display: "block" }}
      >
        {/* Y-axis gridlines */}
        {[0.25, 0.5, 0.75, 1].map(pct => (
          <line
            key={pct}
            x1={0} y1={H - pct * H}
            x2={totalW} y2={H - pct * H}
            stroke="#F7F4EF" strokeWidth={1}
          />
        ))}

        {/* Theoretical rent reference line */}
        {refVal > 0 && (
          <>
            <line
              x1={0} y1={refY}
              x2={totalW} y2={refY}
              stroke="#EAE6DF" strokeWidth={1} strokeDasharray="4 4"
            />
            <text x={4} y={refY - 4} fontSize={9} fill="#8a8477">
              loyer théorique {refVal.toLocaleString("fr-FR")} €
            </text>
          </>
        )}

        {items.map((d, i) => {
          const barH = d.amount > 0 ? Math.max(4, Math.round((d.amount / max) * H)) : 3
          const x = i * (BAR_W + GAP)
          const y = H - barH
          const color = d.amount === 0
            ? "#EAE6DF"
            : d.confirmed ? "#15803d" : "#f97316"

          return (
            <g key={i}>
              <rect x={x} y={y} width={BAR_W} height={barH} fill={color} rx={4} />
              {d.amount > 0 && barH > 20 && (
                <text
                  x={x + BAR_W / 2} y={y + 13}
                  textAnchor="middle" fontSize={9} fill="white" fontWeight="bold"
                >
                  {d.amount >= 1000
                    ? `${(d.amount / 1000).toFixed(1)}k`
                    : d.amount}
                </text>
              )}
              {d.amount > 0 && barH <= 20 && (
                <text
                  x={x + BAR_W / 2} y={y - 4}
                  textAnchor="middle" fontSize={9} fill={color} fontWeight="bold"
                >
                  {d.amount}
                </text>
              )}
              <text
                x={x + BAR_W / 2} y={H + 16}
                textAnchor="middle" fontSize={9} fill="#8a8477"
              >
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
      {/* Légende sous le graph — fidèle handoff (3) `pages.jsx` StatsScreen
          l. 819-822. Carrés couleur 10×10 + label, fontSize 11, gap 18. */}
      <div style={{ display: "flex", gap: 18, marginTop: 14, fontSize: 11, color: "#666" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span aria-hidden style={{ width: 10, height: 10, background: "#15803d", borderRadius: 2 }} />
          Confirmé
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span aria-hidden style={{ width: 10, height: 10, background: "#f97316", borderRadius: 2 }} />
          En attente
        </span>
      </div>
    </div>
  )
}

// ─── SVG Line Chart (cumulative / break-even) ───────────────────────────────

function LineChart({
  points,
  target,
  labels,
  unit = "",
}: {
  points: { actual: number | null; projected: number }[]
  target: number
  labels: string[]
  unit?: string
}) {
  const n = points.length
  if (n < 2) return (
    <div style={{ textAlign: "center", padding: "40px 0", color: "#8a8477" }}>
      <p style={{ fontSize: 13 }}>Pas encore assez de données</p>
    </div>
  )

  const maxV = Math.max(...points.map(p => Math.max(p.projected, p.actual ?? 0)), target > 0 ? target * 1.05 : 0, 1)
  const W = 600
  const H = 170

  const px = (i: number) => Math.round((i / (n - 1)) * W)
  const py = (v: number) => Math.round(H - (Math.max(0, v) / maxV) * H)

  const actualPts = points
    .map((p, i) => p.actual !== null ? { x: px(i), y: py(p.actual) } : null)
    .filter(Boolean) as { x: number; y: number }[]

  const actPath = actualPts.length > 1
    ? actualPts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ")
    : ""

  const projPath = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${px(i)},${py(p.projected)}`)
    .join(" ")

  const breakIdx = points.findIndex(p => p.projected >= target && target > 0)
  const targetY = target > 0 && target <= maxV ? py(target) : null

  // Show label at every Nth point so they don't overlap
  const labelStep = Math.max(1, Math.ceil(n / 10))

  return (
    <div style={{ overflowX: "auto" }}>
      <svg width={W} height={H + 52} style={{ display: "block" }}>
        {/* Gridlines */}
        {[0.25, 0.5, 0.75, 1].map(pct => (
          <line key={pct} x1={0} y1={py(maxV * pct)} x2={W} y2={py(maxV * pct)} stroke="#F7F4EF" strokeWidth={1} />
        ))}

        {/* Break-even target line */}
        {targetY !== null && (
          <>
            <line x1={0} y1={targetY} x2={W} y2={targetY} stroke="#b91c1c" strokeWidth={1.5} strokeDasharray="6 3" opacity={0.7} />
            <text x={4} y={targetY - 5} fontSize={9} fill="#b91c1c" fontWeight="600">
              Seuil — {unit ? `${target}${unit}` : target >= 1000 ? `${(target / 1000).toFixed(0)}k €` : `${target} €`}
            </text>
          </>
        )}

        {/* Projection line */}
        <path d={projPath} fill="none" stroke="#EAE6DF" strokeWidth={1.5} strokeDasharray="5 3" />

        {/* Actual area + line */}
        {actPath && (
          <>
            <path
              d={`${actPath} L${actualPts[actualPts.length - 1].x},${H} L${actualPts[0].x},${H} Z`}
              fill="#11111110"
            />
            <path d={actPath} fill="none" stroke="#111" strokeWidth={2} />
          </>
        )}

        {/* Break-even dot */}
        {breakIdx >= 0 && (
          <>
            <circle
              cx={px(breakIdx)} cy={py(points[breakIdx].projected)}
              r={7} fill="#15803d"
            />
            <text
              x={px(breakIdx)} y={py(points[breakIdx].projected) - 12}
              textAnchor="middle" fontSize={9} fill="#15803d" fontWeight="bold"
            >
              Rentable
            </text>
          </>
        )}

        {/* Actual data dots */}
        {actualPts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill="#111" />
        ))}

        {/* X axis labels */}
        {labels.map((l, i) => l && i % labelStep === 0 && (
          <text key={i} x={px(i)} y={H + 16} textAnchor="middle" fontSize={9} fill="#8a8477">
            {l}
          </text>
        ))}
      </svg>
    </div>
  )
}

// ─── Quittance PDF generator ─────────────────────────────────────────────────

async function genererQuittancePDF({
  nomProprietaire, emailProprietaire, emailLocataire,
  titreBien, villeBien, adresse, loyerHC, charges, moisLabel, bailSource
}: {
  nomProprietaire: string; emailProprietaire: string; emailLocataire: string
  titreBien: string; villeBien: string; adresse: string
  loyerHC: number; charges: number; moisLabel: string
  bailSource?: "platform" | "imported" | "imported_pending"
}) {
  const { default: jsPDF } = await import("jspdf")
  const doc = new jsPDF()
  const totalCC = loyerHC + charges
  const today = new Date().toLocaleDateString("fr-FR")

  drawLogoPDF(doc, { x: 20, y: 18, size: "medium" })
  doc.setFontSize(20); doc.setFont("helvetica", "bold")
  doc.text("QUITTANCE DE LOYER", 105, 34, { align: "center" })
  doc.setFontSize(11); doc.setFont("helvetica", "normal")
  doc.text(`Période : ${moisLabel}`, 105, 42, { align: "center" })
  doc.setDrawColor(200, 200, 200); doc.line(20, 48, 190, 48)

  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("BAILLEUR", 20, 58)
  doc.setFont("helvetica", "normal"); doc.setFontSize(9)
  doc.text(`Nom : ${nomProprietaire}`, 20, 65)
  doc.text(`Email : ${emailProprietaire}`, 20, 71)

  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("LOCATAIRE", 110, 58)
  doc.setFont("helvetica", "normal"); doc.setFontSize(9)
  doc.text(`Email : ${emailLocataire}`, 110, 65)

  doc.line(20, 78, 190, 78)
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("BIEN LOUÉ", 20, 86)
  doc.setFont("helvetica", "normal"); doc.setFontSize(9)
  doc.text(titreBien, 20, 93)
  doc.text(adresse || villeBien, 20, 99)

  doc.line(20, 106, 190, 106)
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("DÉTAIL DU RÈGLEMENT", 20, 114)
  doc.setFont("helvetica", "normal"); doc.setFontSize(9)
  doc.text("Loyer hors charges :", 20, 122)
  doc.text(`${loyerHC.toLocaleString("fr-FR")} €`, 170, 122, { align: "right" })
  doc.text("Charges locatives :", 20, 129)
  doc.text(`${charges.toLocaleString("fr-FR")} €`, 170, 129, { align: "right" })
  doc.line(100, 134, 190, 134)
  doc.setFont("helvetica", "bold"); doc.setFontSize(10)
  doc.text("TOTAL CHARGES COMPRISES :", 20, 142)
  doc.text(`${totalCC.toLocaleString("fr-FR")} €`, 170, 142, { align: "right" })

  doc.line(20, 149, 190, 149)
  doc.setFont("helvetica", "normal"); doc.setFontSize(8)
  const attestation = `Je soussigné(e), ${nomProprietaire}, bailleur du logement désigné ci-dessus, déclare avoir reçu de ${emailLocataire} la somme de ${totalCC.toLocaleString("fr-FR")} € correspondant au loyer et charges du mois de ${moisLabel}.`
  const lines = doc.splitTextToSize(attestation, 170)
  doc.text(lines, 20, 157)

  doc.setFontSize(9)
  doc.text(`Fait le ${today}`, 20, 183)
  doc.text("Signature du bailleur :", 110, 183)
  doc.line(110, 198, 185, 198)

  doc.setFontSize(7); doc.setTextColor(150, 150, 150)
  if (bailSource === "imported" || bailSource === "imported_pending") {
    doc.text(
      "Bail signé hors plateforme — KeyMatch est utilisé comme outil de gestion locative.",
      105, 280, { align: "center" }
    )
  }
  doc.text(`Document généré par ${BRAND.name} — ${BRAND.url.replace(/^https?:\/\//, "")}`, 105, 285, { align: "center" })

  doc.save(`quittance-${moisLabel.toLowerCase().replace(" ", "-")}.pdf`)
}

// ─── Main component ─────────────────────────────────────────────────────────

function StatsInner() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isMobile } = useResponsive()
  const bienId = searchParams.get("id")

  const [bien, setBien] = useState<any>(null)
  const [loyers, setLoyers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editOpen, setEditOpen] = useState(false)
  const [editForm, setEditForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const [savedOk, setSavedOk] = useState(false)
  const [zoomMois, setZoomMois] = useState<number>(0) // 0 = tout
  const [newLoyerMois, setNewLoyerMois] = useState("")
  const [newLoyerMontant, setNewLoyerMontant] = useState("")
  // Si coché, le loyer est enregistré directement en "confirmé" (dispense la
  // double saisie déclaration→confirmation quand le proprio sait déjà qu'il
  // a reçu le paiement). Déclenche aussi la quittance auto.
  const [newLoyerConfirme, setNewLoyerConfirme] = useState(false)
  const [savingLoyer, setSavingLoyer] = useState(false)
  const [travauxCout, setTravauxCout] = useState(0)
  const [edlStatut, setEdlStatut] = useState<string | null>(null)
  // Pipeline candidatures (5 étapes, count exact via head:true). Funnel
  // handoff (3) `pages.jsx` StatsScreen l. 825-848 — version vraie data
  // (vs handoff fictif 14/8/5/3/1).
  const [pipeline, setPipeline] = useState<{
    vues: number
    candidatures: number
    dossiers: number
    visites: number
    bail: number
  }>({ vues: 0, candidatures: 0, dossiers: 0, visites: 0, bail: 0 })

  // Erreur de chargement — affichée si au moins une query échoue.
  // Avant : silent failure dans Promise.all → setLoading(false) jamais
  // appelé → page bloquée sur "Chargement…" (audit 2026-04-26).
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth")
    if (session && bienId) loadData()
  }, [session, status, bienId])

  async function loadData() {
    setLoadError(null)
    setLoading(true)
    const me = (session?.user?.email || "").toLowerCase()
    try {
      const [
        bienRes, loyersRes, travauxRes, edlRes,
        vuesRes, candidaturesRes, dossiersRes, visitesRes, signaturesRes,
      ] = await Promise.all([
        // .maybeSingle() au lieu de .single() : ne throw plus si bien
        // introuvable (cas où l'URL ?id= pointe sur un bien supprimé ou
        // qui n'appartient pas au user). On gère le bien null après.
        supabase.from("annonces").select("*").eq("id", bienId).maybeSingle(),
        supabase.from("loyers").select("*").eq("annonce_id", bienId).order("mois"),
        supabase.from("carnet_entretien").select("cout").eq("annonce_id", bienId),
        supabase.from("etats_des_lieux").select("statut").eq("annonce_id", bienId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        // Pipeline funnel — head:true pour ne payer que le count, pas les rows.
        supabase.from("clics_annonces").select("annonce_id", { count: "exact", head: true }).eq("annonce_id", bienId),
        supabase.from("messages").select("id", { count: "exact", head: true }).eq("to_email", me).eq("annonce_id", bienId).eq("type", "candidature"),
        supabase.from("messages").select("id", { count: "exact", head: true }).eq("to_email", me).eq("annonce_id", bienId).like("contenu", "[DOSSIER_CARD]%"),
        supabase.from("visites").select("id", { count: "exact", head: true }).eq("annonce_id", bienId).in("statut", ["proposée", "confirmée", "effectuée"]),
        // V55.1b — bail_signatures via /api/bail/signatures (RLS Phase 5)
        fetch(`/api/bail/signatures?annonce_id=${bienId}`, { cache: "no-store" })
          .then(r => r.ok ? r.json() : { ok: false })
          .catch(() => ({ ok: false })),
      ])

      const b = bienRes.data
      if (!b) {
        setLoadError("Ce bien est introuvable ou n'est pas accessible avec votre compte.")
        return
      }

      const l = loyersRes.data
      const travaux = travauxRes.data
      const edlData = edlRes.data

      setEdlStatut(edlData?.statut || null)
      if (travaux) setTravauxCout(travaux.reduce((s: number, t: any) => s + (Number(t.cout) || 0), 0))

      const distinctRoles = new Set<string>()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sigArr = (signaturesRes as any)?.ok ? ((signaturesRes as any).signatures as Array<{ signataire_role?: string | null }>) : null
      if (Array.isArray(sigArr)) {
        sigArr.forEach((s) => {
          if (s.signataire_role) distinctRoles.add(s.signataire_role)
        })
      }
      const bailFullySigned = distinctRoles.has("bailleur") && distinctRoles.has("locataire") ? 1 : 0
      setPipeline({
        vues: vuesRes.count ?? 0,
        candidatures: candidaturesRes.count ?? 0,
        dossiers: dossiersRes.count ?? 0,
        visites: visitesRes.count ?? 0,
        bail: bailFullySigned,
      })
      setBien(b)
      setEditForm({
        titre: b.titre || "",
        prix: b.prix || "",
        charges: b.charges || "",
        valeur_bien: b.valeur_bien || "",
        mensualite_credit: b.mensualite_credit || "",
        duree_credit: b.duree_credit || "",
        date_debut_bail: b.date_debut_bail || "",
        locataire_email: b.locataire_email || "",
        statut: b.statut || "disponible",
        taxe_fonciere: b.taxe_fonciere || "",
        assurance_pno: b.assurance_pno || "",
        charges_copro_annuelles: b.charges_copro_annuelles || "",
      })
      if (l) setLoyers(l)
    } catch (err) {
      // Network, RLS, parse error... on log et on affiche un message.
      console.error("[stats] loadData failed", err)
      setLoadError("Impossible de charger les statistiques pour le moment. Vérifiez votre connexion et réessayez.")
    } finally {
      setLoading(false)
    }
  }

  async function ajouterOuMettreAJourLoyer() {
    if (!newLoyerMois || !newLoyerMontant || !bienId) return
    setSavingLoyer(true)
    const montant = Number(newLoyerMontant)
    const locataireEmail = (bien?.locataire_email || "").toLowerCase() || null
    const proprietaireEmail = (bien?.proprietaire_email || "").toLowerCase() || null
    const nowIso = new Date().toISOString()
    const statut = newLoyerConfirme ? "confirmé" : "déclaré"
    // V24.1 — via /api/loyers/save mode "upsert" (server-side, proprio-only)
    let data: any = null
    try {
      const res = await fetch("/api/loyers/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "upsert",
          annonce_id: Number(bienId),
          mois: newLoyerMois,
          montant,
          statut,
          date_confirmation: newLoyerConfirme ? nowIso : null,
          locataire_email: locataireEmail,
        }),
      })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.ok && json.loyer) data = json.loyer
    } catch { /* noop */ }
    if (data) {
      setLoyers(prev => [...prev.filter(l => l.mois !== newLoyerMois), data])
      // Si l'user a coche "confirme", on envoie directement la quittance par
      // messagerie (comme le flow confirmerLoyer existant). Evite la double
      // action "enregistrer puis confirmer".
      if (newLoyerConfirme && locataireEmail && proprietaireEmail && bien) {
        const payload = {
          loyerId: data.id,
          bienId: bien.id,
          bienTitre: bien.titre,
          mois: newLoyerMois,
          montant,
          dateConfirmation: nowIso,
        }
        await supabase.from("messages").insert([{
          from_email: proprietaireEmail,
          to_email: locataireEmail,
          contenu: `[QUITTANCE_CARD]${JSON.stringify(payload)}`,
          lu: false,
          annonce_id: bien.id,
          created_at: nowIso,
        }])
      }
    }
    setNewLoyerMois("")
    setNewLoyerMontant("")
    setNewLoyerConfirme(false)
    setSavingLoyer(false)
  }

  async function confirmerLoyer(id: string) {
    // 1. Passe le loyer en "confirmé". On vérifie l'erreur AVANT toute
    // mise à jour optimiste — sinon le proprio voit "confirmé" alors que
    // la DB est restée "en attente" (silent-failure-hunter HIGH#3).
    const nowIso = new Date().toISOString()
    // V24.1 — via /api/loyers/save mode "confirm"
    try {
      const res = await fetch("/api/loyers/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "confirm", id, statut: "confirmé", date_confirmation: nowIso }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json.ok) {
        console.error("[stats] confirmerLoyer: update failed", json.error || res.statusText)
        alert("Impossible de confirmer le loyer pour le moment. Vérifiez votre connexion et réessayez.")
        return
      }
    } catch (e) {
      console.error("[stats] confirmerLoyer: exception", e)
      alert("Impossible de confirmer le loyer pour le moment.")
      return
    }
    setLoyers(prev => prev.map(l => l.id === id ? { ...l, statut: "confirmé", date_confirmation: nowIso } : l))

    // 2. Envoie la quittance au locataire via la messagerie (card cliquable)
    const loyer = loyers.find(l => l.id === id)
    if (!loyer || !bien) return
    const locataireEmail = (bien.locataire_email || "").toLowerCase()
    const proprietaireEmail = (bien.proprietaire_email || "").toLowerCase()
    if (!locataireEmail) return

    const payload = {
      loyerId: id,
      bienId: bien.id,
      bienTitre: bien.titre,
      mois: loyer.mois,
      montant: loyer.montant,
      dateConfirmation: nowIso,
    }
    const { data: msg, error: msgErr } = await supabase.from("messages").insert([{
      from_email: proprietaireEmail,
      to_email: locataireEmail,
      contenu: `[QUITTANCE_CARD]${JSON.stringify(payload)}`,
      lu: false,
      annonce_id: bien.id,
      created_at: nowIso,
    }]).select().single()

    if (msgErr) {
      // Loyer confirmé mais quittance non envoyée — on alerte le proprio
      // pour qu'il puisse renvoyer manuellement plutôt que penser que
      // tout s'est passé.
      console.error("[stats] quittance message insert failed", msgErr)
      alert("Le loyer a été confirmé mais la quittance n'a pas pu être envoyée au locataire.")
      return
    }

    // 3. Trace l'envoi côté loyer
    if (msg?.id) {
      // V24.1 — via /api/loyers/save mode "confirm" (quittance fields)
      try {
        await fetch("/api/loyers/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "confirm", id,
            quittance_envoyee_at: nowIso,
            quittance_message_id: msg.id,
          }),
        })
      } catch { /* noop */ }
    }

    // 4. Génération PDF serveur + upload Storage + email Resend au locataire
    // (best-effort — si l'API échoue, la card chat reste OK et le proprio
    // peut toujours utiliser le bouton "Quittance PDF" en download client).
    fetch("/api/loyers/quittance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loyerId: id }),
    }).catch(err => console.error("[stats] quittance API failed", err))
  }

  async function sauvegarderBien() {
    setSaving(true)
    const updates: any = {
      titre: editForm.titre,
      prix: editForm.prix ? Number(editForm.prix) : null,
      charges: editForm.charges ? Number(editForm.charges) : null,
      valeur_bien: editForm.valeur_bien ? Number(editForm.valeur_bien) : null,
      mensualite_credit: editForm.mensualite_credit ? Number(editForm.mensualite_credit) : null,
      duree_credit: editForm.duree_credit ? Number(editForm.duree_credit) : null,
      date_debut_bail: editForm.date_debut_bail || null,
      locataire_email: editForm.locataire_email || null,
      statut: editForm.statut,
      taxe_fonciere: editForm.taxe_fonciere ? Number(editForm.taxe_fonciere) : null,
      assurance_pno: editForm.assurance_pno ? Number(editForm.assurance_pno) : null,
      charges_copro_annuelles: editForm.charges_copro_annuelles ? Number(editForm.charges_copro_annuelles) : null,
    }
    const { error } = await supabase.from("annonces").update(updates).eq("id", bienId)
    setSaving(false)
    if (error) {
      // Sans ce check, le bandeau "Enregistré" s'affichait même quand
      // la mise à jour avait échoué (silent-failure-hunter HIGH#4).
      console.error("[stats] sauvegarderBien: update failed", error)
      alert("Les modifications n'ont pas pu être enregistrées. Vérifiez votre connexion et réessayez.")
      return
    }
    setBien((prev: any) => ({ ...prev, ...updates }))
    setSavedOk(true)
    setTimeout(() => setSavedOk(false), 3000)
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontFamily: "'DM Sans', sans-serif", color: "#8a8477" }}>
      Chargement...
    </div>
  )
  if (loadError) return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#fff", border: "1px solid #F4C9C9", borderRadius: 20, padding: "32px 36px", maxWidth: 460, textAlign: "center", boxShadow: "0 1px 2px rgba(0,0,0,0.02)" }}>
        <p style={{ fontSize: 11, fontWeight: 700, color: "#b91c1c", textTransform: "uppercase", letterSpacing: "1.4px", margin: 0, marginBottom: 12 }}>Erreur de chargement</p>
        <p style={{ fontSize: 14, color: "#111", lineHeight: 1.55, margin: 0, marginBottom: 22 }}>{loadError}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={() => loadData()} style={{ background: "#111", color: "#fff", border: "none", borderRadius: 999, padding: "10px 22px", fontWeight: 700, fontSize: 12, cursor: "pointer", fontFamily: "inherit", letterSpacing: "0.3px" }}>
            Réessayer
          </button>
          <a href="/proprietaire" style={{ background: "#fff", color: "#111", border: "1px solid #EAE6DF", borderRadius: 999, padding: "10px 22px", fontWeight: 600, fontSize: 12, textDecoration: "none", fontFamily: "inherit", letterSpacing: "0.3px" }}>
            Retour au dashboard
          </a>
        </div>
      </div>
    </main>
  )
  if (!bien) return null

  // ─── Core figures ──────────────────────────────────────────────────────────

  const loyerMensuel     = Number(bien.prix) || 0
  const charges          = Number(bien.charges) || 0
  const revenuMensuel    = loyerMensuel + charges
  const valeurBien       = Number(bien.valeur_bien) || 0
  const mensualiteCredit = Number(bien.mensualite_credit) || 0
  const dureeCredit      = Number(bien.duree_credit) || 0  // en mois

  // Charges proprietaire annuelles
  const taxeFonciere           = Number(bien.taxe_fonciere) || 0
  const assurancePno           = Number(bien.assurance_pno) || 0
  const chargesCoproAnnuelles  = Number(bien.charges_copro_annuelles) || 0
  const totalChargesAnnuelles  = taxeFonciere + assurancePno + chargesCoproAnnuelles
  const chargesMensuelles      = Math.round(totalChargesAnnuelles / 12)

  const cashflowBrut     = revenuMensuel - mensualiteCredit
  const cashflowMensuel  = revenuMensuel - mensualiteCredit - chargesMensuelles

  // Actual revenue this year (from real loyer records — not theoretical)
  const currentYear = new Date().getFullYear()
  const loyersCetteAnnee = loyers.filter(l => l.mois?.startsWith(String(currentYear)))
  const revenuAnnuelReel = loyersCetteAnnee.reduce((s, l) => s + (l.montant || 0), 0)
  const revenuAnnuelTheorique = revenuMensuel * 12

  // Total confirmed receipts (all time)
  const totalEncaisse = loyers
    .filter(l => l.statut === "confirmé")
    .reduce((s, l) => s + (l.montant || 0), 0)

  // Gross & net yields
  const rentabiliteBrute = valeurBien > 0
    ? (revenuAnnuelTheorique / valeurBien) * 100
    : null

  // Net yield: rent - all annual charges (tax, insurance, copro) / bien value
  const revenuNetAnnuel = revenuAnnuelTheorique - totalChargesAnnuelles
  const rentabiliteNette = valeurBien > 0
    ? (revenuNetAnnuel / valeurBien) * 100
    : null

  // Net-net yield: after credit too
  const cashflowAnnuelNetNet = revenuNetAnnuel - (mensualiteCredit * 12)
  const rentabiliteNetteNette = valeurBien > 0 && mensualiteCredit > 0
    ? (cashflowAnnuelNetNet / valeurBien) * 100
    : null

  // Seuil de rentabilité = PER immobilier : valeur_bien / loyer_annuel_brut (hors charges)
  // Standard du marché : 15 ans = excellent, 20 ans = correct, 25+ ans = cher
  const loyerAnnuelBrut = loyerMensuel * 12
  const breakEvenAns = valeurBien > 0 && loyerAnnuelBrut > 0
    ? valeurBien / loyerAnnuelBrut
    : null
  const breakEvenMois = breakEvenAns ? Math.round(breakEvenAns * 12) : null

  const dateDebut = bien.date_debut_bail ? new Date(bien.date_debut_bail) : null
  const breakEvenDate = breakEvenMois && dateDebut
    ? new Date(dateDebut.getFullYear(), dateDebut.getMonth() + breakEvenMois, 1)
    : null

  // Occupancy rate
  const now = new Date()

  // Credit duration
  const dateFinCredit = dateDebut && dureeCredit > 0
    ? new Date(dateDebut.getFullYear(), dateDebut.getMonth() + dureeCredit, 1)
    : null
  const moisRestantsCredit = dateFinCredit
    ? Math.max(0, Math.round((dateFinCredit.getTime() - now.getTime()) / (1000 * 60 * 60 * 24 * 30.44)))
    : null
  const anneesRestantesCredit = moisRestantsCredit !== null ? moisRestantsCredit / 12 : null
  const creditTermine = moisRestantsCredit !== null && moisRestantsCredit <= 0
  const moisDepuisDebut = dateDebut
    ? Math.max(1, (now.getFullYear() - dateDebut.getFullYear()) * 12
        + (now.getMonth() - dateDebut.getMonth()) + 1)
    : 0
  const tauxOccupation = moisDepuisDebut > 0
    ? Math.min(100, Math.round((loyers.length / moisDepuisDebut) * 100))
    : null

  // ─── Bar chart: last 12 months ─────────────────────────────────────────────

  const last12Months: { label: string; amount: number; confirmed: boolean }[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const l = loyers.find(l => l.mois === key || l.mois?.startsWith(key))
    last12Months.push({
      label: d.toLocaleDateString("fr-FR", { month: "short" }).slice(0, 3)
        + " " + String(d.getFullYear()).slice(2),
      amount: l?.montant || 0,
      confirmed: l?.statut === "confirmé",
    })
  }

  // ─── PER progress chart (% de l'investissement récupéré via les loyers) ────
  // Y axis: 0–100 % (100 % = valeurBien remboursé par les loyers cumulés)
  // X axis: mois depuis début du bail jusqu'au PER (+ 1 an)

  const perPoints: { actual: number | null; projected: number }[] = []
  const perLabels: string[] = []

  if (dateDebut && loyerMensuel > 0 && valeurBien > 0) {
    const startDate = new Date(dateDebut.getFullYear(), dateDebut.getMonth(), 1)
    const perMois = breakEvenMois ?? 240 // fallback 20 ans si pas de valeur bien
    const endMonths = Math.min(perMois + 12, 360) // jusqu'au PER + 1 an, cap 30 ans

    let cumActualRents    = 0
    let cumProjectedRents = 0

    for (let i = 0; i < endMonths; i++) {
      const d    = new Date(startDate.getFullYear(), startDate.getMonth() + i, 1)
      const key  = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
      const isPast = d <= now
      const l = loyers.find(l => l.mois === key || l.mois?.startsWith(key))

      cumProjectedRents += loyerMensuel
      const projectedPct = Math.min(100, (cumProjectedRents / valeurBien) * 100)

      if (isPast) {
        cumActualRents += l?.montant || 0
        const actualPct = Math.min(100, (cumActualRents / valeurBien) * 100)
        perPoints.push({ actual: parseFloat(actualPct.toFixed(2)), projected: parseFloat(projectedPct.toFixed(2)) })
      } else {
        perPoints.push({ actual: null, projected: parseFloat(projectedPct.toFixed(2)) })
      }

      // Label visible seulement au début de chaque année
      perLabels.push(i % 12 === 0 ? String(d.getFullYear()) : "")
    }
  }

  // ─── Annual comparison data ────────────────────────────────────────────────

  const annualByYear = new Map<number, { total: number; confirmed: number }>()
  loyers.forEach(l => {
    const yr = parseInt(l.mois?.slice(0, 4))
    if (!yr) return
    const prev = annualByYear.get(yr) || { total: 0, confirmed: 0 }
    annualByYear.set(yr, {
      total: prev.total + (l.montant || 0),
      confirmed: prev.confirmed + (l.statut === "confirmé" ? (l.montant || 0) : 0),
    })
  })
  const annualData = Array.from(annualByYear.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, v]) => ({ year, ...v }))

  // ─── Styles ────────────────────────────────────────────────────────────────

  const card: any = { background: "white", borderRadius: 16, padding: "20px 24px" }

  const kpis = [
    {
      label: "Loyer mensuel",
      val: `${loyerMensuel.toLocaleString("fr-FR")} €`,
      sub: charges > 0 ? `+ ${charges} € charges = ${revenuMensuel} € CC` : "charges non incluses",
      color: "#111",
    },
    {
      label: `Revenus réels ${currentYear}`,
      val: `${revenuAnnuelReel.toLocaleString("fr-FR")} €`,
      sub: revenuAnnuelReel < revenuAnnuelTheorique
        ? `objectif: ${revenuAnnuelTheorique.toLocaleString("fr-FR")} €`
        : "objectif annuel atteint ✓",
      color: "#15803d",
    },
    {
      label: "Rentabilité brute",
      val: rentabiliteBrute ? `${rentabiliteBrute.toFixed(2)} %` : "—",
      sub: valeurBien
        ? `valeur bien: ${valeurBien.toLocaleString("fr-FR")} €`
        : "Renseignez la valeur du bien",
      color: rentabiliteBrute
        ? rentabiliteBrute >= 7 ? "#15803d"
        : rentabiliteBrute >= 5 ? "#a16207"
        : "#b91c1c"
        : "#8a8477",
    },
    {
      label: "Rentabilite nette",
      val: rentabiliteNette != null
        ? `${rentabiliteNette >= 0 ? "+" : ""}${rentabiliteNette.toFixed(2)} %`
        : "—",
      sub: totalChargesAnnuelles > 0
        ? `apres ${totalChargesAnnuelles.toLocaleString("fr-FR")} euros/an de charges`
        : "Renseignez taxe fonciere + assurance",
      color: rentabiliteNette != null
        ? rentabiliteNette >= 0 ? "#15803d" : "#b91c1c"
        : "#8a8477",
    },
    {
      label: "PER immobilier",
      val: breakEvenAns ? `${breakEvenAns.toFixed(1)} ans` : "—",
      sub: breakEvenAns
        ? breakEvenAns <= 15 ? "Excellent rendement"
        : breakEvenAns <= 20 ? "Rendement correct"
        : "Bien cher par rapport aux loyers"
        : "Renseignez la valeur du bien",
      color: breakEvenAns
        ? breakEvenAns <= 15 ? "#15803d"
        : breakEvenAns <= 20 ? "#a16207"
        : "#b91c1c"
        : "#8a8477",
    },
    {
      label: "Durée restante crédit",
      val: creditTermine
        ? "Terminé ✓"
        : anneesRestantesCredit !== null
        ? `${anneesRestantesCredit.toFixed(1)} ans`
        : "—",
      sub: dateFinCredit
        ? creditTermine
          ? `Soldé depuis ${dateFinCredit.toLocaleDateString("fr-FR", { month: "short", year: "numeric" })}`
          : `Fin : ${dateFinCredit.toLocaleDateString("fr-FR", { month: "short", year: "numeric" })} · ${moisRestantsCredit} mois`
        : dureeCredit > 0
        ? "Renseignez la date de début du bail"
        : "Renseignez la durée du crédit",
      color: creditTermine
        ? "#15803d"
        : anneesRestantesCredit !== null
        ? anneesRestantesCredit <= 5 ? "#a16207"
        : "#111"
        : "#8a8477",
    },
  ]

  // ─── Render ────────────────────────────────────────────────────────────────

  const pendingLoyers = loyers.filter(l => l.statut === "déclaré")
  const confirmedLoyers = loyers.filter(l => l.statut === "confirmé")
  const totalConfirmeAnnee = loyersCetteAnnee.filter(l => l.statut === "confirmé").reduce((s, l) => s + (l.montant || 0), 0)
  const pctObjectif = revenuAnnuelTheorique > 0 ? Math.round((revenuAnnuelReel / revenuAnnuelTheorique) * 100) : 0
  const cashflowRatio = revenuMensuel > 0 ? Math.min(100, Math.round((Math.abs(cashflowMensuel) / revenuMensuel) * 100)) : 0

  const statutMap: Record<string, { label: string; bg: string; color: string; border: string }> = {
    disponible: { label: "Disponible", bg: "#EEF3FB", color: "#1d4ed8", border: "#D7E3F4" },
    "en visite": { label: "En visite", bg: "#FBF6EA", color: "#a16207", border: "#EADFC6" },
    "réservé": { label: "Réservé", bg: "#FBF6EA", color: "#a16207", border: "#EADFC6" },
    "loué": { label: "Loué", bg: "#F0FAEE", color: "#15803d", border: "#C6E9C0" },
  }
  const statutBadge = statutMap[bien.statut] || statutMap.disponible

  // Payment calendar: last 12 months data
  const calendarMonths: { key: string; label: string; amount: number; status: "confirmé" | "déclaré" | "none" }[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
    const l = loyers.find(lr => lr.mois === key || lr.mois?.startsWith(key))
    calendarMonths.push({
      key,
      label: d.toLocaleDateString("fr-FR", { month: "short" }).slice(0, 3),
      amount: l?.montant || 0,
      status: l ? l.statut : "none",
    })
  }

  const cardStyle = {
    background: "white",
    borderRadius: 20,
    padding: isMobile ? "18px 16px" : "24px 28px",
    boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
  }

  const labelStyle = {
    fontSize: 10,
    fontWeight: 700,
    color: "#8a8477",
    textTransform: "uppercase" as const,
    letterSpacing: "0.5px",
    marginBottom: 6,
    display: "block",
  }

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: isMobile ? "24px 16px" : "32px 48px" }}>

        <Link href="/proprietaire" style={{ fontSize: 13, color: "#8a8477", textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 16 }}>&larr;</span> Retour au dashboard
        </Link>

        {/* ══════════════════════════════════════════════════════════════════════
            1. PROPERTY HERO CARD
           ══════════════════════════════════════════════════════════════════════ */}
        <div style={{ ...cardStyle, marginTop: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: isMobile ? "flex-start" : "center", flexDirection: isMobile ? "column" : "row", gap: isMobile ? 20 : 0 }}>
            {/* Left: property info */}
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
                <h1 style={{ fontSize: isMobile ? 22 : 26, fontWeight: 800, letterSpacing: "-0.5px", margin: 0 }}>
                  {bien.titre || "Mon bien"}
                </h1>
                <span style={{
                  background: statutBadge.bg, color: statutBadge.color,
                  border: `1px solid ${statutBadge.border}`,
                  fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 999,
                }}>
                  {statutBadge.label}
                </span>
              </div>
              <p style={{ fontSize: 14, color: "#8a8477", margin: 0, lineHeight: 1.6 }}>
                {bien.ville}{bien.surface ? ` \u00B7 ${bien.surface} m\u00B2` : ""}
                {bien.date_debut_bail && moisDepuisDebut > 0 ? ` \u00B7 Bail : ${moisDepuisDebut} mois` : ""}
              </p>
              {bien.locataire_email && (
                <p style={{ fontSize: 13, color: "#111", margin: "6px 0 0", fontWeight: 600 }}>
                  Locataire : {bien.locataire_email}
                </p>
              )}

              {/* Quick actions */}
              <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                <button onClick={() => setEditOpen(!editOpen)}
                  style={{
                    padding: "9px 18px", borderRadius: 999, fontWeight: 700, fontSize: 13,
                    cursor: "pointer", fontFamily: "inherit", border: "none",
                    background: editOpen ? "#111" : "#111", color: "white",
                  }}>
                  {editOpen ? "Fermer l'edition" : "\u270E Modifier les donnees"}
                </button>
                {bien.locataire_email && (
                  <Link href={`/messages?to=${bien.locataire_email}`}
                    style={{
                      padding: "9px 18px", border: "1px solid #EAE6DF", borderRadius: 999,
                      fontSize: 13, fontWeight: 700, color: "#111", textDecoration: "none",
                      background: "none", display: "inline-flex", alignItems: "center", gap: 6,
                    }}>
                    Contacter locataire
                  </Link>
                )}
                <Link href={`/annonces/${bienId}`}
                  style={{
                    padding: "9px 18px", border: "1px solid #EAE6DF", borderRadius: 999,
                    fontSize: 13, fontWeight: 700, color: "#8a8477", textDecoration: "none",
                    background: "none", display: "inline-flex", alignItems: "center",
                  }}>
                  Voir l&apos;annonce
                </Link>
                {/* Statut EDL affiché en read-only quand il existe (info legitime
                    sur une page stats). La création/gestion se fait depuis
                    /proprietaire onglet Locataires, plus besoin de dupliquer. */}
                {edlStatut && (
                  <span
                    style={{
                      padding: "9px 18px", borderRadius: 999,
                      fontSize: 13, fontWeight: 700,
                      display: "inline-flex", alignItems: "center", gap: 6,
                      ...(edlStatut === "valide"
                        ? { background: "#F0FAEE", color: "#15803d", border: "1px solid #C6E9C0" }
                        : edlStatut === "envoye"
                        ? { background: "#FBF6EA", color: "#a16207", border: "1px solid #EADFC6" }
                        : edlStatut === "conteste"
                        ? { background: "#FEECEC", color: "#b91c1c", border: "1px solid #F4C9C9" }
                        : { background: "#EEF3FB", color: "#1d4ed8", border: "1px solid #D7E3F4" }),
                  }}>
                    {edlStatut === "valide" ? "EDL validé ✓"
                      : edlStatut === "envoye" ? "EDL envoyé"
                      : edlStatut === "conteste" ? "EDL contesté"
                      : edlStatut === "brouillon" ? "EDL (brouillon)"
                      : "EDL en attente"}
                  </span>
                )}
              </div>
            </div>

            {/* Right: small occupation donut */}
            {tauxOccupation !== null && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flexShrink: 0 }}>
                <svg viewBox="0 0 36 36" width={72} height={72}>
                  <circle cx={18} cy={18} r={15.9} fill="none" stroke="#F7F4EF" strokeWidth={3.8} />
                  <circle cx={18} cy={18} r={15.9} fill="none"
                    stroke={tauxOccupation >= 90 ? "#15803d" : tauxOccupation >= 70 ? "#a16207" : "#b91c1c"}
                    strokeWidth={3.8}
                    strokeDasharray={`${tauxOccupation} ${100 - tauxOccupation}`}
                    strokeDashoffset={25} strokeLinecap="round"
                  />
                  <text x={18} y={20} textAnchor="middle" fontSize={8} fontWeight="bold" fill="#111">
                    {tauxOccupation}%
                  </text>
                </svg>
                <span style={{ fontSize: 11, color: "#8a8477", fontWeight: 600 }}>Occupation</span>
                <span style={{ fontSize: 10, color: "#8a8477" }}>{loyers.length}/{moisDepuisDebut} mois</span>
              </div>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            EDIT PANEL (collapsible)
           ══════════════════════════════════════════════════════════════════════ */}
        {editOpen && (
          <div style={{ ...cardStyle, marginBottom: 20, border: "1px solid #EAE6DF" }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 20 }}>Donnees du bien</h3>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 16, marginBottom: 16 }}>
              {[
                { k: "titre", l: "Titre" },
                { k: "prix", l: "Loyer mensuel (euros)" },
                { k: "charges", l: "Charges (euros)" },
                { k: "valeur_bien", l: "Valeur du bien (euros)" },
                { k: "mensualite_credit", l: "Mensualite credit (euros)" },
                { k: "duree_credit", l: "Duree credit (mois)" },
                { k: "date_debut_bail", l: "Date debut du bail", type: "date" },
                { k: "taxe_fonciere", l: "Taxe fonciere (euros/an)" },
                { k: "assurance_pno", l: "Assurance PNO (euros/an)" },
                { k: "charges_copro_annuelles", l: "Charges copro non recup. (euros/an)" },
              ].map(f => (
                <div key={f.k}>
                  <label style={labelStyle}>{f.l}</label>
                  <input
                    type={f.type || "text"}
                    value={editForm[f.k] ?? ""}
                    onChange={e => setEditForm((p: any) => ({ ...p, [f.k]: e.target.value }))}
                    style={{ width: "100%", padding: "9px 12px", border: "1px solid #EAE6DF", borderRadius: 10, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const }}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 20 }}>
              <LocataireEmailField
                value={editForm.locataire_email ?? ""}
                onChange={v => setEditForm((p: any) => ({ ...p, locataire_email: v }))}
                inputStyle={{ width: "100%", padding: "9px 12px", border: "1px solid #EAE6DF", borderRadius: 10, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" as const }}
              />
              <div>
                <label style={labelStyle}>Statut</label>
                <select value={editForm.statut ?? "disponible"} onChange={e => setEditForm((p: any) => ({ ...p, statut: e.target.value }))}
                  style={{ width: "100%", padding: "9px 12px", border: "1px solid #EAE6DF", borderRadius: 10, fontSize: 14, fontFamily: "inherit", outline: "none", background: "white", boxSizing: "border-box" as const }}>
                  <option value="disponible">Disponible</option>
                  <option value="en visite">En visite</option>
                  <option value="réservé">Réservé</option>
                  <option value="loué">Loué</option>
                </select>
              </div>
            </div>
            <button onClick={sauvegarderBien} disabled={saving}
              style={{ padding: "10px 24px", background: savedOk ? "#15803d" : saving ? "#8a8477" : "#111", color: "white", border: "none", borderRadius: 999, fontWeight: 700, fontSize: 14, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
              {saving ? "Sauvegarde..." : savedOk ? "Sauvegarde !" : "Sauvegarder"}
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            2. ALERT BANNER — pending loyers
           ══════════════════════════════════════════════════════════════════════ */}
        {pendingLoyers.length > 0 && (
          <div style={{
            background: "#FBF6EA", border: "1px solid #EADFC6", borderRadius: 14,
            padding: "12px 20px", marginBottom: 20,
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
            flexWrap: "wrap",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f97316", display: "inline-block", flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: "#9a3412" }}>
                {pendingLoyers.length} loyer{pendingLoyers.length > 1 ? "s" : ""} en attente de confirmation
              </span>
            </div>
            <button onClick={() => {
              const el = document.getElementById("gestion-loyers")
              if (el) el.scrollIntoView({ behavior: "smooth" })
            }}
              style={{
                padding: "6px 16px", borderRadius: 999, border: "1px solid #a16207",
                background: "none", color: "#a16207", fontWeight: 700, fontSize: 12,
                cursor: "pointer", fontFamily: "inherit",
              }}>
              Voir
            </button>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════════════
            3. THREE HERO KPI CARDS
           ══════════════════════════════════════════════════════════════════════ */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 16, marginBottom: 16 }}>

          {/* Cashflow mensuel */}
          <div style={cardStyle}>
            <p style={labelStyle}>Cashflow mensuel</p>
            <p style={{
              fontSize: isMobile ? 26 : 30, fontWeight: 800, letterSpacing: "-1px", lineHeight: 1.1, margin: "4px 0 10px",
              color: cashflowMensuel >= 0 ? "#15803d" : "#b91c1c",
            }}>
              {cashflowMensuel >= 0 ? "+" : ""}{cashflowMensuel.toLocaleString("fr-FR")} €
            </p>
            {/* Mini progress bar */}
            <div style={{ background: "#F7F4EF", borderRadius: 6, height: 6, overflow: "hidden", marginBottom: 6 }}>
              <div style={{
                height: "100%", borderRadius: 6,
                width: `${cashflowRatio}%`,
                background: cashflowMensuel >= 0 ? "#15803d" : "#b91c1c",
                transition: "width 0.3s",
              }} />
            </div>
            <p style={{ fontSize: 11, color: "#8a8477", margin: 0 }}>
              {mensualiteCredit > 0
                ? `${revenuMensuel.toLocaleString("fr-FR")} revenus - ${mensualiteCredit.toLocaleString("fr-FR")} credit`
                : "Pas de credit renseigne"}
            </p>
          </div>

          {/* Rentabilité brute */}
          <div style={cardStyle}>
            <p style={labelStyle}>Rentabilite brute</p>
            <p style={{
              fontSize: isMobile ? 26 : 30, fontWeight: 800, letterSpacing: "-1px", lineHeight: 1.1, margin: "4px 0 10px",
              color: rentabiliteBrute
                ? rentabiliteBrute >= 7 ? "#15803d" : rentabiliteBrute >= 5 ? "#a16207" : "#b91c1c"
                : "#8a8477",
            }}>
              {rentabiliteBrute ? `${rentabiliteBrute.toFixed(2)}%` : "\u2014"}
            </p>
            <p style={{ fontSize: 12, color: "#8a8477", margin: 0, fontWeight: 600 }}>
              {breakEvenAns ? `PER : ${breakEvenAns.toFixed(1)} ans` : "PER : \u2014"}
            </p>
            <p style={{ fontSize: 11, color: "#8a8477", margin: "4px 0 0" }}>
              {rentabiliteBrute
                ? rentabiliteBrute >= 7 ? "Excellent rendement" : rentabiliteBrute >= 5 ? "Rendement correct" : "Rendement faible"
                : "Renseignez la valeur du bien"}
            </p>
          </div>

          {/* Revenus réels année */}
          <div style={cardStyle}>
            <p style={labelStyle}>Revenus reels {currentYear}</p>
            <p style={{
              fontSize: isMobile ? 26 : 30, fontWeight: 800, letterSpacing: "-1px", lineHeight: 1.1, margin: "4px 0 10px",
              color: "#111",
            }}>
              {revenuAnnuelReel.toLocaleString("fr-FR")} €
            </p>
            {/* Progress toward annual target */}
            <div style={{ background: "#F7F4EF", borderRadius: 6, height: 6, overflow: "hidden", marginBottom: 6 }}>
              <div style={{
                height: "100%", borderRadius: 6,
                width: `${Math.min(100, pctObjectif)}%`,
                background: pctObjectif >= 90 ? "#15803d" : pctObjectif >= 60 ? "#a16207" : "#b91c1c",
                transition: "width 0.3s",
              }} />
            </div>
            <p style={{ fontSize: 11, color: "#8a8477", margin: 0 }}>
              {pctObjectif}% de l'objectif ({revenuAnnuelTheorique.toLocaleString("fr-FR")} €)
            </p>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            4. THREE SECONDARY KPIs (compact row)
           ══════════════════════════════════════════════════════════════════════ */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 16, marginBottom: 24 }}>
          {/* Loyer mensuel */}
          <div style={{ ...cardStyle, padding: isMobile ? "14px 16px" : "16px 22px" }}>
            <p style={{ ...labelStyle, marginBottom: 4 }}>Loyer mensuel</p>
            <p style={{ fontSize: 20, fontWeight: 800, color: "#111", margin: "2px 0", letterSpacing: "-0.5px" }}>
              {loyerMensuel.toLocaleString("fr-FR")} €
            </p>
            <p style={{ fontSize: 11, color: "#8a8477", margin: 0 }}>
              {charges > 0 ? `+ ${charges} charges = ${revenuMensuel} CC` : "charges non incluses"}
            </p>
          </div>

          {/* ROI net / an */}
          <div style={{ ...cardStyle, padding: isMobile ? "14px 16px" : "16px 22px" }}>
            <p style={{ ...labelStyle, marginBottom: 4 }}>ROI net / an</p>
            <p style={{
              fontSize: 20, fontWeight: 800, margin: "2px 0", letterSpacing: "-0.5px",
              color: rentabiliteNette != null ? (rentabiliteNette >= 0 ? "#15803d" : "#b91c1c") : "#8a8477",
            }}>
              {rentabiliteNette != null
                ? `${rentabiliteNette >= 0 ? "+" : ""}${rentabiliteNette.toFixed(2)}%`
                : "\u2014"}
            </p>
            <p style={{ fontSize: 11, color: "#8a8477", margin: 0 }}>
              {mensualiteCredit > 0 ? `cashflow: ${cashflowMensuel >= 0 ? "+" : ""}${cashflowMensuel.toLocaleString("fr-FR")} /mois` : "Renseignez le credit"}
            </p>
          </div>

          {/* Crédit restant */}
          <div style={{ ...cardStyle, padding: isMobile ? "14px 16px" : "16px 22px" }}>
            <p style={{ ...labelStyle, marginBottom: 4 }}>Credit restant</p>
            <p style={{
              fontSize: 20, fontWeight: 800, margin: "2px 0", letterSpacing: "-0.5px",
              color: creditTermine ? "#15803d" : anneesRestantesCredit !== null ? (anneesRestantesCredit <= 5 ? "#a16207" : "#111") : "#8a8477",
            }}>
              {creditTermine
                ? "Termine"
                : anneesRestantesCredit !== null
                ? `${anneesRestantesCredit.toFixed(1)} ans`
                : "\u2014"}
            </p>
            <p style={{ fontSize: 11, color: "#8a8477", margin: 0 }}>
              {dateFinCredit
                ? creditTermine
                  ? `Solde depuis ${dateFinCredit.toLocaleDateString("fr-FR", { month: "short", year: "numeric" })}`
                  : `Fin : ${dateFinCredit.toLocaleDateString("fr-FR", { month: "short", year: "numeric" })} (${moisRestantsCredit} mois)`
                : dureeCredit > 0 ? "Renseignez la date de debut" : "Renseignez la duree du credit"}
            </p>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            5. REVENUE BAR CHART (full width)
           ══════════════════════════════════════════════════════════════════════ */}
        <div style={{ ...cardStyle, marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
            <h3 style={{ fontSize: isMobile ? 14 : 15, fontWeight: 800, margin: 0 }}>Revenus mensuels — 12 derniers mois</h3>
            {!isMobile && (
              <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#8a8477" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: "#15803d", display: "inline-block" }} />
                  Confirme
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: "#f97316", display: "inline-block" }} />
                  Declare
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 18, height: 1, background: "#EAE6DF", display: "inline-block", borderTop: "1px dashed #EAE6DF" }} />
                  Loyer theorique
                </span>
              </div>
            )}
          </div>
          <BarChart items={last12Months} refVal={loyerMensuel} />

          {/* Summary row below chart */}
          <div style={{
            display: "flex", gap: isMobile ? 12 : 32, marginTop: 18, paddingTop: 14,
            borderTop: "1px solid #F7F4EF", flexWrap: "wrap",
          }}>
            <div>
              <p style={{ fontSize: 10, color: "#8a8477", fontWeight: 700, textTransform: "uppercase" as const, margin: "0 0 2px" }}>Total encaisse</p>
              <p style={{ fontSize: 16, fontWeight: 800, color: "#111", margin: 0 }}>{totalEncaisse.toLocaleString("fr-FR")} €</p>
            </div>
            <div>
              <p style={{ fontSize: 10, color: "#8a8477", fontWeight: 700, textTransform: "uppercase" as const, margin: "0 0 2px" }}>Confirme {currentYear}</p>
              <p style={{ fontSize: 16, fontWeight: 800, color: "#15803d", margin: 0 }}>{totalConfirmeAnnee.toLocaleString("fr-FR")} €</p>
            </div>
            <div>
              <p style={{ fontSize: 10, color: "#8a8477", fontWeight: 700, textTransform: "uppercase" as const, margin: "0 0 2px" }}>vs Objectif</p>
              <p style={{ fontSize: 16, fontWeight: 800, color: pctObjectif >= 90 ? "#15803d" : "#a16207", margin: 0 }}>{pctObjectif}%</p>
            </div>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            5b. PIPELINE CANDIDATURES — funnel handoff (3) `pages.jsx` l. 825-848
                Vraie data DB (vs handoff fictif 14/8/5/3/1).
                Largeur de barre normalisée sur le max de toutes les étapes.
           ══════════════════════════════════════════════════════════════════════ */}
        <div style={{ ...cardStyle, marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase" as const, letterSpacing: "1.6px", margin: 0, marginBottom: 6 }}>
                Pipeline candidatures
              </p>
              <h3 style={{ fontSize: isMobile ? 14 : 15, fontWeight: 800, margin: 0 }}>
                Du clic à la signature
              </h3>
            </div>
            {pipeline.candidatures > 0 && pipeline.vues > 0 && (
              <span style={{ fontSize: 11, color: "#8a8477", fontVariantNumeric: "tabular-nums" as const }}>
                Taux de conversion vues → candidatures :{" "}
                <strong style={{ color: "#111", fontWeight: 700 }}>
                  {Math.round((pipeline.candidatures / pipeline.vues) * 100)}%
                </strong>
              </span>
            )}
          </div>
          {(() => {
            // Pipeline étapes — chaque étape porte sa propre couleur sémantique.
            // Si vues > 0, on l'utilise comme dénominateur. Sinon on utilise
            // candidatures (cas où le tracking de clics n'a pas démarré).
            const steps: Array<{ label: string; count: number; bg: string; bar: string; fg: string }> = [
              { label: "Vues", count: pipeline.vues, bg: "#F7F4EF", bar: "#EAE6DF", fg: "#111" },
              { label: "Candidatures", count: pipeline.candidatures, bg: "#F0FAEE", bar: "#15803d", fg: "#15803d" },
              { label: "Dossiers reçus", count: pipeline.dossiers, bg: "#EEF3FB", bar: "#1d4ed8", fg: "#1d4ed8" },
              { label: "Visites programmées", count: pipeline.visites, bg: "#FBF6EA", bar: "#a16207", fg: "#a16207" },
              { label: "Bail signé", count: pipeline.bail, bg: "#111", bar: "#111", fg: "#fff" },
            ]
            const maxCount = Math.max(1, ...steps.map(s => s.count))
            return (
              <>
                {steps.map((s, i) => {
                  const widthPct = Math.round((s.count / maxCount) * 100)
                  const isInkBar = s.label === "Bail signé"
                  return (
                    <div key={s.label} style={{ marginBottom: i === steps.length - 1 ? 0 : 14 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                        <span style={{ fontWeight: 600, color: "#111" }}>{s.label}</span>
                        <span style={{ color: "#8a8477", fontVariantNumeric: "tabular-nums" as const, fontWeight: 700 }}>{s.count}</span>
                      </div>
                      <div style={{ height: 8, background: isInkBar ? "#F7F4EF" : "#F5F2EC", borderRadius: 999, overflow: "hidden" }}>
                        <div
                          style={{
                            width: `${widthPct}%`,
                            height: "100%",
                            background: s.bar,
                            borderRadius: 999,
                            transition: "width 600ms cubic-bezier(0.4, 0, 0.2, 1)",
                          }}
                        />
                      </div>
                    </div>
                  )
                })}
                {pipeline.vues === 0 && pipeline.candidatures === 0 && (
                  <p style={{ fontSize: 12, color: "#8a8477", marginTop: 14, marginBottom: 0, lineHeight: 1.5 }}>
                    Aucune activité enregistrée pour ce bien. Le pipeline se remplira dès que des locataires consulteront l&apos;annonce et candidateront.
                  </p>
                )}
              </>
            )
          })()}
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            6. TWO-COLUMN: Payment Calendar + Financial Analysis
           ══════════════════════════════════════════════════════════════════════ */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20, marginBottom: 24 }}>

          {/* LEFT: Payment calendar grid */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 16px" }}>Suivi des paiements</h3>
            <div style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : "repeat(4, 1fr)",
              gap: 10,
            }}>
              {calendarMonths.map(m => {
                const dotColor = m.status === "confirmé" ? "#15803d" : m.status === "déclaré" ? "#f97316" : "#EAE6DF"
                const dotBg = m.status === "confirmé" ? "#F0FAEE" : m.status === "déclaré" ? "#FBF6EA" : "#F7F4EF"
                return (
                  <div key={m.key} style={{
                    display: "flex", flexDirection: "column", alignItems: "center",
                    padding: "10px 6px", borderRadius: 12, background: dotBg,
                    border: `1px solid ${m.status === "none" ? "#F7F4EF" : dotColor}20`,
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase" as const, marginBottom: 6 }}>
                      {m.label}
                    </span>
                    <span style={{
                      width: 18, height: 18, borderRadius: "50%",
                      background: dotColor, display: "inline-block", marginBottom: 4,
                    }} />
                    {m.amount > 0 && (
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#111" }}>
                        {m.amount >= 1000 ? `${(m.amount / 1000).toFixed(1)}k` : m.amount}
                      </span>
                    )}
                    {m.amount === 0 && (
                      <span style={{ fontSize: 10, color: "#8a8477" }}>&mdash;</span>
                    )}
                  </div>
                )
              })}
            </div>
            {/* Legend */}
            <div style={{ display: "flex", gap: 14, marginTop: 14, fontSize: 10, color: "#8a8477", flexWrap: "wrap" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#15803d", display: "inline-block" }} /> Confirme
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#f97316", display: "inline-block" }} /> Declare
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#EAE6DF", display: "inline-block" }} /> Manquant
              </span>
            </div>
          </div>

          {/* RIGHT: Financial analysis table */}
          <div style={cardStyle}>
            <h3 style={{ fontSize: 15, fontWeight: 800, margin: "0 0 16px" }}>Analyse financiere</h3>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {[
                { label: "Loyer mensuel HC", val: `${loyerMensuel.toLocaleString("fr-FR")} \u20AC`, color: "#111", bold: false },
                { label: "Charges recuperables", val: `${charges.toLocaleString("fr-FR")} \u20AC`, color: "#111", bold: false },
                { label: "Revenu mensuel brut", val: `${revenuMensuel.toLocaleString("fr-FR")} \u20AC`, color: "#15803d", bold: true },
                ...(taxeFonciere ? [{ label: "Taxe fonciere", val: `-${Math.round(taxeFonciere / 12).toLocaleString("fr-FR")} \u20AC/mois`, color: "#b91c1c", bold: false }] : []),
                ...(assurancePno ? [{ label: "Assurance PNO", val: `-${Math.round(assurancePno / 12).toLocaleString("fr-FR")} \u20AC/mois`, color: "#b91c1c", bold: false }] : []),
                ...(chargesCoproAnnuelles ? [{ label: "Charges copro non recup.", val: `-${Math.round(chargesCoproAnnuelles / 12).toLocaleString("fr-FR")} \u20AC/mois`, color: "#b91c1c", bold: false }] : []),
                ...(totalChargesAnnuelles > 0 ? [{ label: "Total charges proprio", val: `-${chargesMensuelles.toLocaleString("fr-FR")} \u20AC/mois`, color: "#b91c1c", bold: true }] : []),
                { label: "Mensualite credit", val: mensualiteCredit ? `-${mensualiteCredit.toLocaleString("fr-FR")} \u20AC` : "Non renseigne", color: mensualiteCredit ? "#b91c1c" : "#8a8477", bold: false },
                { label: "Cashflow net mensuel", val: `${cashflowMensuel >= 0 ? "+" : ""}${cashflowMensuel.toLocaleString("fr-FR")} \u20AC`, color: cashflowMensuel >= 0 ? "#15803d" : "#b91c1c", bold: true },
                ...(travauxCout > 0 ? [{ label: "Total travaux (carnet)", val: `-${travauxCout.toLocaleString("fr-FR")} \u20AC`, color: "#a16207", bold: false }] : []),
                { label: `Revenus reels ${currentYear}`, val: `${revenuAnnuelReel.toLocaleString("fr-FR")} \u20AC`, color: "#111", bold: false },
                { label: "Total encaisse confirme", val: `${totalEncaisse.toLocaleString("fr-FR")} \u20AC`, color: "#15803d", bold: true },
              ].map((r, idx, arr) => (
                <div key={r.label} style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  padding: "9px 0",
                  borderBottom: idx < arr.length - 1 ? "1px solid #F7F4EF" : "none",
                }}>
                  <span style={{ fontSize: 13, color: "#8a8477" }}>{r.label}</span>
                  <span style={{ fontSize: 14, fontWeight: r.bold ? 800 : 600, color: r.color }}>{r.val}</span>
                </div>
              ))}
            </div>

            {!valeurBien && (
              <div style={{ marginTop: 14, background: "#fffbeb", border: "1px solid #EADFC6", borderRadius: 10, padding: "10px 14px" }}>
                <p style={{ fontSize: 12, color: "#a16207", fontWeight: 600, margin: 0 }}>
                  Ajoutez la valeur du bien et la mensualite credit pour voir le ROI et le seuil de rentabilite
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            7. BREAK-EVEN CHART (full width)
           ══════════════════════════════════════════════════════════════════════ */}
        <div style={{ ...cardStyle, marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4, flexWrap: "wrap", gap: 10 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0 }}>
              Progression vers la rentabilite
            </h3>
            <div style={{ display: "flex", gap: 4 }}>
              {([{ label: "5 ans", val: 60 }, { label: "10 ans", val: 120 }, { label: "15 ans", val: 180 }, { label: "Tout", val: 0 }] as const).map(z => (
                <button key={z.val} onClick={() => setZoomMois(z.val)}
                  style={{
                    padding: "4px 10px", border: "1px solid #EAE6DF", borderRadius: 999,
                    fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit",
                    background: zoomMois === z.val ? "#111" : "white",
                    color: zoomMois === z.val ? "white" : "#8a8477",
                    transition: "all 0.15s",
                  }}>
                  {z.label}
                </button>
              ))}
            </div>
          </div>
          <p style={{ fontSize: 12, color: "#8a8477", marginBottom: 16, marginTop: 8 }}>
            % de l'investissement recupere via les loyers ({valeurBien > 0 ? `${(valeurBien / 1000).toFixed(0)}k \u20AC` : "valeur non renseignee"}).
            Projection a {loyerMensuel > 0 ? `${loyerMensuel.toLocaleString("fr-FR")} \u20AC/mois` : "loyer non renseigne"}.
          </p>

          <LineChart
            points={zoomMois > 0 ? perPoints.slice(0, zoomMois) : perPoints}
            target={100}
            unit="%"
            labels={zoomMois > 0 ? perLabels.slice(0, zoomMois) : perLabels}
          />

          {perPoints.length >= 2 && (
            <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 11, color: "#8a8477", flexWrap: "wrap" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 20, height: 2, background: "#111", display: "inline-block" }} />
                Reel (loyers encaisses)
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 20, height: 1, borderTop: "2px dashed #EAE6DF", display: "inline-block" }} />
                Projection theorique
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 20, height: 1, borderTop: "2px dashed #b91c1c", display: "inline-block", opacity: 0.7 }} />
                100% — rentabilise
              </span>
            </div>
          )}

          {perPoints.length < 2 && (
            <div style={{ marginTop: 8, background: "#fffbeb", border: "1px solid #EADFC6", borderRadius: 10, padding: "10px 14px" }}>
              <p style={{ fontSize: 12, color: "#a16207", fontWeight: 600, margin: 0 }}>
                Renseignez la date de debut du bail et la valeur du bien pour voir ce graphique
              </p>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            8. GESTION DES LOYERS
           ══════════════════════════════════════════════════════════════════════ */}
        <div id="gestion-loyers" style={{ ...cardStyle, marginBottom: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 20, margin: "0 0 20px" }}>Gestion des loyers &amp; Quittances</h3>

          {/* Add loyer form */}
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 24, flexWrap: "wrap" }}>
            <div>
              <label style={labelStyle}>Mois</label>
              <input type="month" value={newLoyerMois} onChange={e => setNewLoyerMois(e.target.value)}
                style={{ padding: "8px 12px", border: "1px solid #EAE6DF", borderRadius: 10, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
            </div>
            <div>
              <label style={labelStyle}>Montant (euros)</label>
              <input type="number" value={newLoyerMontant} onChange={e => setNewLoyerMontant(e.target.value)}
                placeholder={String(loyerMensuel)}
                style={{ padding: "8px 12px", border: "1px solid #EAE6DF", borderRadius: 10, fontSize: 13, fontFamily: "inherit", outline: "none", width: 120 }} />
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, color: "#111", marginBottom: 10 }}>
              <input
                type="checkbox"
                checked={newLoyerConfirme}
                onChange={e => setNewLoyerConfirme(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: "#15803d", cursor: "pointer" }}
              />
              <span>Loyer déjà reçu — envoyer directement la quittance au locataire</span>
            </label>
            <button onClick={ajouterOuMettreAJourLoyer} disabled={!newLoyerMois || !newLoyerMontant || savingLoyer}
              style={{
                background: newLoyerMois && newLoyerMontant ? (newLoyerConfirme ? "#15803d" : "#111") : "#EAE6DF",
                color: newLoyerMois && newLoyerMontant ? "white" : "#8a8477",
                border: "none", borderRadius: 999, padding: "9px 20px",
                fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit",
              }}>
              {savingLoyer
                ? "Sauvegarde..."
                : newLoyerConfirme
                  ? "Enregistrer + envoyer la quittance"
                  : "Enregistrer le loyer (en attente)"}
            </button>
          </div>

          {/* Loyer list */}
          {loyers.length === 0 ? (
            <p style={{ fontSize: 13, color: "#8a8477", textAlign: "center", padding: "20px 0" }}>
              Aucun loyer enregistre. Ajoutez le premier loyer ci-dessus.
            </p>
          ) : isMobile ? (
            /* ── MOBILE: Card layout ── */
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[...loyers].sort((a, b) => b.mois.localeCompare(a.mois)).map(l => {
                const moisDate = new Date(l.mois + "-01")
                const moisLabel = moisDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
                const estConfirme = l.statut === "confirmé"
                return (
                  <div key={l.id} style={{
                    background: "#F7F4EF", borderRadius: 14, padding: "14px 16px",
                    border: "1px solid #F7F4EF",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, textTransform: "capitalize" as const }}>{moisLabel}</span>
                      <span style={{
                        background: estConfirme ? "#F0FAEE" : "#FBF6EA",
                        color: estConfirme ? "#15803d" : "#a16207",
                        border: `1px solid ${estConfirme ? "#C6E9C0" : "#EADFC6"}`,
                        padding: "2px 9px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                      }}>
                        {estConfirme ? "Confirme" : "En attente"}
                      </span>
                    </div>
                    <p style={{ fontSize: 20, fontWeight: 800, color: "#111", margin: "0 0 10px" }}>
                      {l.montant.toLocaleString("fr-FR")} €
                    </p>
                    <div style={{ display: "flex", gap: 8 }}>
                      {!estConfirme && (
                        <button onClick={() => confirmerLoyer(l.id)}
                          style={{ background: "#111", color: "white", border: "none", borderRadius: 999, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                          Confirmer
                        </button>
                      )}
                      {estConfirme && bien.locataire_email && (
                        <button onClick={() => genererQuittancePDF({
                          nomProprietaire: session?.user?.name || bien.proprietaire || "Proprietaire",
                          emailProprietaire: bien.proprietaire_email || session?.user?.email || "",
                          emailLocataire: bien.locataire_email,
                          titreBien: bien.titre || "",
                          villeBien: bien.ville || "",
                          adresse: bien.adresse || bien.ville || "",
                          loyerHC: Number(bien.prix) || 0,
                          charges: Number(bien.charges) || 0,
                          moisLabel,
                          bailSource: bien.bail_source,
                        })}
                          style={{ background: "#EEF3FB", color: "#1d4ed8", border: "1px solid #D7E3F4", borderRadius: 999, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                          Quittance PDF
                        </button>
                      )}
                      {estConfirme && !bien.locataire_email && (
                        <span style={{ fontSize: 11, color: "#8a8477", alignSelf: "center" }}>Email locataire manquant</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            /* ── DESKTOP: Grid table ── */
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 0 }}>
              <div style={{
                display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 0,
                background: "#111", borderRadius: "12px 12px 0 0", padding: "10px 16px",
              }}>
                {["Mois", "Montant", "Statut", "Confirmer", "Quittance"].map(h => (
                  <span key={h} style={{ fontSize: 10, fontWeight: 700, color: "white", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>{h}</span>
                ))}
              </div>
              {[...loyers].sort((a, b) => b.mois.localeCompare(a.mois)).map((l, i) => {
                const moisDate = new Date(l.mois + "-01")
                const moisLabel = moisDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
                const estConfirme = l.statut === "confirmé"
                return (
                  <div key={l.id} style={{
                    display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 0,
                    padding: "12px 16px", borderBottom: "1px solid #F7F4EF",
                    background: i % 2 === 0 ? "white" : "#F7F4EF", alignItems: "center",
                  }}>
                    <span style={{ fontSize: 13, fontWeight: 600, textTransform: "capitalize" as const }}>{moisLabel}</span>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{l.montant.toLocaleString("fr-FR")} €</span>
                    <span style={{ display: "inline-flex" }}>
                      <span style={{
                        background: estConfirme ? "#F0FAEE" : "#FBF6EA",
                        color: estConfirme ? "#15803d" : "#a16207",
                        border: `1px solid ${estConfirme ? "#C6E9C0" : "#EADFC6"}`,
                        padding: "2px 9px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                      }}>
                        {estConfirme ? "Confirme" : "En attente"}
                      </span>
                    </span>
                    <span>
                      {!estConfirme && (
                        <button onClick={() => confirmerLoyer(l.id)}
                          style={{ background: "#111", color: "white", border: "none", borderRadius: 999, padding: "4px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                          Confirmer
                        </button>
                      )}
                    </span>
                    <span>
                      {estConfirme && bien.locataire_email && (
                        <button onClick={() => genererQuittancePDF({
                          nomProprietaire: session?.user?.name || bien.proprietaire || "Proprietaire",
                          emailProprietaire: bien.proprietaire_email || session?.user?.email || "",
                          emailLocataire: bien.locataire_email,
                          titreBien: bien.titre || "",
                          villeBien: bien.ville || "",
                          adresse: bien.adresse || bien.ville || "",
                          loyerHC: Number(bien.prix) || 0,
                          charges: Number(bien.charges) || 0,
                          moisLabel,
                          bailSource: bien.bail_source,
                        })}
                          style={{ background: "#EEF3FB", color: "#1d4ed8", border: "1px solid #D7E3F4", borderRadius: 999, padding: "4px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                          PDF
                        </button>
                      )}
                      {estConfirme && !bien.locataire_email && (
                        <span style={{ fontSize: 10, color: "#8a8477" }}>Email locataire manquant</span>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════════════════════
            9. COMPARAISON ANNUELLE (only with 2+ years)
           ══════════════════════════════════════════════════════════════════════ */}
        {annualData.length >= 2 && (
          <div style={{ ...cardStyle, marginBottom: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 20, margin: "0 0 20px" }}>Comparaison annuelle</h3>
            <div style={{ display: "flex", gap: 20, alignItems: "flex-end" }}>
              {(() => {
                const maxYr = Math.max(...annualData.map(y => y.total), revenuAnnuelTheorique, 1)
                const BAR_H = 120
                return (
                  <>
                    {annualData.map(yr => {
                      const hTotal = Math.round((yr.total / maxYr) * BAR_H)
                      const hConf  = Math.round((yr.confirmed / maxYr) * BAR_H)
                      const pct    = revenuAnnuelTheorique > 0
                        ? Math.round((yr.total / revenuAnnuelTheorique) * 100)
                        : null
                      return (
                        <div key={yr.year} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                          <p style={{ fontSize: 12, fontWeight: 800, margin: 0 }}>{yr.total.toLocaleString("fr-FR")} €</p>
                          {pct !== null && (
                            <p style={{ fontSize: 10, color: pct >= 90 ? "#15803d" : "#a16207", margin: 0 }}>{pct}% objectif</p>
                          )}
                          <div style={{ width: "100%", display: "flex", alignItems: "flex-end", height: BAR_H, gap: 4, justifyContent: "center" }}>
                            <div style={{ width: 28, height: hTotal, background: "#EAE6DF", borderRadius: "4px 4px 0 0" }} title="Total declare" />
                            <div style={{ width: 28, height: hConf, background: "#15803d", borderRadius: "4px 4px 0 0" }} title="Confirme" />
                          </div>
                          <p style={{ fontSize: 12, color: "#8a8477", fontWeight: 700, margin: 0 }}>{yr.year}</p>
                          <p style={{ fontSize: 10, color: "#15803d", margin: 0 }}>{yr.confirmed.toLocaleString("fr-FR")} €</p>
                        </div>
                      )
                    })}
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                      <p style={{ fontSize: 12, fontWeight: 800, color: "#8a8477", margin: 0 }}>
                        {revenuAnnuelTheorique.toLocaleString("fr-FR")} €
                      </p>
                      <p style={{ fontSize: 10, color: "#8a8477", margin: 0 }}>100% objectif</p>
                      <div style={{ width: "100%", display: "flex", alignItems: "flex-end", height: BAR_H, justifyContent: "center" }}>
                        <div style={{ width: 28, height: BAR_H, background: "transparent", borderRadius: "4px 4px 0 0", border: "2px dashed #EAE6DF" }} />
                      </div>
                      <p style={{ fontSize: 12, color: "#8a8477", fontWeight: 700, margin: 0 }}>Objectif</p>
                      <p style={{ fontSize: 10, color: "#8a8477", margin: 0 }}>theorique</p>
                    </div>
                  </>
                )
              })()}
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 16, fontSize: 11, color: "#8a8477" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: "#EAE6DF", display: "inline-block" }} />
                Total declare
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: "#15803d", display: "inline-block" }} />
                Confirme
              </span>
            </div>
          </div>
        )}

        {/* Footer raccourcis bail/EDL/modifier (commit 6 du flow plan).
            Le proprio peut accéder aux pages connexes du même bien sans
            détour par /proprietaire. */}
        {bienId && (
          <div style={{ marginTop: 32, padding: "20px 24px", background: "#fff", border: "1px solid #EAE6DF", borderRadius: 16, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <div>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase" as const, letterSpacing: "1.4px", margin: 0, marginBottom: 4 }}>Aller plus loin sur ce bien</p>
              <p style={{ fontSize: 13, color: "#666", margin: 0 }}>Bail, EDL et modifications de l&apos;annonce</p>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <a
                href={`/proprietaire/bail/${bienId}`}
                style={{ background: "#fff", color: "#111", border: "1px solid #EAE6DF", borderRadius: 999, padding: "9px 16px", textDecoration: "none", fontSize: 12, fontWeight: 600, letterSpacing: "0.3px" }}
              >
                Bail →
              </a>
              <a
                href={`/proprietaire/edl/${bienId}?type=entree`}
                style={{ background: "#fff", color: "#111", border: "1px solid #EAE6DF", borderRadius: 999, padding: "9px 16px", textDecoration: "none", fontSize: 12, fontWeight: 600, letterSpacing: "0.3px" }}
              >
                EDL entrée →
              </a>
              <a
                href={`/proprietaire/edl/${bienId}?type=sortie`}
                style={{ background: "#fff", color: "#111", border: "1px solid #EAE6DF", borderRadius: 999, padding: "9px 16px", textDecoration: "none", fontSize: 12, fontWeight: 600, letterSpacing: "0.3px" }}
              >
                EDL sortie →
              </a>
              <a
                href={`/proprietaire/modifier/${bienId}`}
                style={{ background: "#111", color: "#fff", border: "none", borderRadius: 999, padding: "9px 16px", textDecoration: "none", fontSize: 12, fontWeight: 700, letterSpacing: "0.3px" }}
              >
                Modifier l&apos;annonce →
              </a>
            </div>
          </div>
        )}

      </div>
    </main>
  )
}

export default function Stats() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
        Chargement...
      </div>
    }>
      <StatsInner />
    </Suspense>
  )
}
