"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { supabase } from "../../../lib/supabase"
import { Suspense } from "react"
import jsPDF from "jspdf"
import { useResponsive } from "../../hooks/useResponsive"

// ─── SVG Bar Chart ──────────────────────────────────────────────────────────

function BarChart({
  items,
  refVal,
}: {
  items: { label: string; amount: number; confirmed: boolean }[]
  refVal: number
}) {
  if (items.every(d => d.amount === 0)) return (
    <div style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af" }}>
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
            stroke="#f3f4f6" strokeWidth={1}
          />
        ))}

        {/* Theoretical rent reference line */}
        {refVal > 0 && (
          <>
            <line
              x1={0} y1={refY}
              x2={totalW} y2={refY}
              stroke="#d1d5db" strokeWidth={1} strokeDasharray="4 4"
            />
            <text x={4} y={refY - 4} fontSize={9} fill="#9ca3af">
              loyer théorique {refVal.toLocaleString("fr-FR")} €
            </text>
          </>
        )}

        {items.map((d, i) => {
          const barH = d.amount > 0 ? Math.max(4, Math.round((d.amount / max) * H)) : 3
          const x = i * (BAR_W + GAP)
          const y = H - barH
          const color = d.amount === 0
            ? "#e5e7eb"
            : d.confirmed ? "#16a34a" : "#f97316"

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
                textAnchor="middle" fontSize={9} fill="#9ca3af"
              >
                {d.label}
              </text>
            </g>
          )
        })}
      </svg>
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
    <div style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af" }}>
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
          <line key={pct} x1={0} y1={py(maxV * pct)} x2={W} y2={py(maxV * pct)} stroke="#f3f4f6" strokeWidth={1} />
        ))}

        {/* Break-even target line */}
        {targetY !== null && (
          <>
            <line x1={0} y1={targetY} x2={W} y2={targetY} stroke="#dc2626" strokeWidth={1.5} strokeDasharray="6 3" opacity={0.7} />
            <text x={4} y={targetY - 5} fontSize={9} fill="#dc2626" fontWeight="600">
              Seuil — {unit ? `${target}${unit}` : target >= 1000 ? `${(target / 1000).toFixed(0)}k €` : `${target} €`}
            </text>
          </>
        )}

        {/* Projection line */}
        <path d={projPath} fill="none" stroke="#d1d5db" strokeWidth={1.5} strokeDasharray="5 3" />

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
              r={7} fill="#16a34a"
            />
            <text
              x={px(breakIdx)} y={py(points[breakIdx].projected) - 12}
              textAnchor="middle" fontSize={9} fill="#16a34a" fontWeight="bold"
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
          <text key={i} x={px(i)} y={H + 16} textAnchor="middle" fontSize={9} fill="#9ca3af">
            {l}
          </text>
        ))}
      </svg>
    </div>
  )
}

// ─── Quittance PDF generator ─────────────────────────────────────────────────

function genererQuittancePDF({
  nomProprietaire, emailProprietaire, emailLocataire,
  titreBien, villeBien, adresse, loyerHC, charges, moisLabel
}: {
  nomProprietaire: string; emailProprietaire: string; emailLocataire: string
  titreBien: string; villeBien: string; adresse: string
  loyerHC: number; charges: number; moisLabel: string
}) {
  const doc = new jsPDF()
  const totalCC = loyerHC + charges
  const today = new Date().toLocaleDateString("fr-FR")

  doc.setFontSize(20); doc.setFont("helvetica", "bold")
  doc.text("QUITTANCE DE LOYER", 105, 25, { align: "center" })
  doc.setFontSize(11); doc.setFont("helvetica", "normal")
  doc.text(`Période : ${moisLabel}`, 105, 33, { align: "center" })
  doc.setDrawColor(200, 200, 200); doc.line(20, 40, 190, 40)

  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("BAILLEUR", 20, 50)
  doc.setFont("helvetica", "normal"); doc.setFontSize(9)
  doc.text(`Nom : ${nomProprietaire}`, 20, 57)
  doc.text(`Email : ${emailProprietaire}`, 20, 63)

  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("LOCATAIRE", 110, 50)
  doc.setFont("helvetica", "normal"); doc.setFontSize(9)
  doc.text(`Email : ${emailLocataire}`, 110, 57)

  doc.line(20, 70, 190, 70)
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("BIEN LOUÉ", 20, 78)
  doc.setFont("helvetica", "normal"); doc.setFontSize(9)
  doc.text(titreBien, 20, 85)
  doc.text(adresse || villeBien, 20, 91)

  doc.line(20, 98, 190, 98)
  doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.text("DÉTAIL DU RÈGLEMENT", 20, 106)
  doc.setFont("helvetica", "normal"); doc.setFontSize(9)
  doc.text("Loyer hors charges :", 20, 114)
  doc.text(`${loyerHC.toLocaleString("fr-FR")} €`, 170, 114, { align: "right" })
  doc.text("Charges locatives :", 20, 121)
  doc.text(`${charges.toLocaleString("fr-FR")} €`, 170, 121, { align: "right" })
  doc.line(100, 126, 190, 126)
  doc.setFont("helvetica", "bold"); doc.setFontSize(10)
  doc.text("TOTAL CHARGES COMPRISES :", 20, 134)
  doc.text(`${totalCC.toLocaleString("fr-FR")} €`, 170, 134, { align: "right" })

  doc.line(20, 141, 190, 141)
  doc.setFont("helvetica", "normal"); doc.setFontSize(8)
  const attestation = `Je soussigné(e), ${nomProprietaire}, bailleur du logement désigné ci-dessus, déclare avoir reçu de ${emailLocataire} la somme de ${totalCC.toLocaleString("fr-FR")} € correspondant au loyer et charges du mois de ${moisLabel}.`
  const lines = doc.splitTextToSize(attestation, 170)
  doc.text(lines, 20, 149)

  doc.setFontSize(9)
  doc.text(`Fait le ${today}`, 20, 175)
  doc.text("Signature du bailleur :", 110, 175)
  doc.line(110, 190, 185, 190)

  doc.setFontSize(7); doc.setTextColor(150, 150, 150)
  doc.text("Document généré par NestMatch — nestmatch.fr", 105, 285, { align: "center" })

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
  const [savingLoyer, setSavingLoyer] = useState(false)

  useEffect(() => {
    if (status === "unauthenticated") router.push("/auth")
    if (session && bienId) loadData()
  }, [session, status, bienId])

  async function loadData() {
    const [{ data: b }, { data: l }] = await Promise.all([
      supabase.from("annonces").select("*").eq("id", bienId).single(),
      supabase.from("loyers").select("*").eq("annonce_id", bienId).order("mois"),
    ])
    if (b) {
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
      })
    }
    if (l) setLoyers(l)
    setLoading(false)
  }

  async function ajouterOuMettreAJourLoyer() {
    if (!newLoyerMois || !newLoyerMontant || !bienId) return
    setSavingLoyer(true)
    const montant = Number(newLoyerMontant)
    const { data } = await supabase.from("loyers").upsert({
      annonce_id: Number(bienId),
      mois: newLoyerMois,
      montant,
      statut: "déclaré"
    }, { onConflict: "annonce_id,mois" }).select().single()
    if (data) setLoyers(prev => [...prev.filter(l => l.mois !== newLoyerMois), data])
    setNewLoyerMois("")
    setNewLoyerMontant("")
    setSavingLoyer(false)
  }

  async function confirmerLoyer(id: string) {
    await supabase.from("loyers").update({ statut: "confirmé" }).eq("id", id)
    setLoyers(prev => prev.map(l => l.id === id ? { ...l, statut: "confirmé" } : l))
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
    }
    await supabase.from("annonces").update(updates).eq("id", bienId)
    setBien((prev: any) => ({ ...prev, ...updates }))
    setSaving(false)
    setSavedOk(true)
    setTimeout(() => setSavedOk(false), 3000)
  }

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh" }}>
      Chargement...
    </div>
  )
  if (!bien) return null

  // ─── Core figures ──────────────────────────────────────────────────────────

  const loyerMensuel     = Number(bien.prix) || 0
  const charges          = Number(bien.charges) || 0
  const revenuMensuel    = loyerMensuel + charges
  const valeurBien       = Number(bien.valeur_bien) || 0
  const mensualiteCredit = Number(bien.mensualite_credit) || 0
  const dureeCredit      = Number(bien.duree_credit) || 0  // en mois
  const cashflowMensuel  = revenuMensuel - mensualiteCredit

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

  // Net yield uses cashflow (rent minus credit); if no credit uses full rent
  const cashflowAnnuel = mensualiteCredit > 0 ? cashflowMensuel * 12 : revenuAnnuelTheorique
  const rentabiliteNette = valeurBien > 0
    ? (cashflowAnnuel / valeurBien) * 100
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
      color: "#16a34a",
    },
    {
      label: "Rentabilité brute",
      val: rentabiliteBrute ? `${rentabiliteBrute.toFixed(2)} %` : "—",
      sub: valeurBien
        ? `valeur bien: ${valeurBien.toLocaleString("fr-FR")} €`
        : "Renseignez la valeur du bien",
      color: rentabiliteBrute
        ? rentabiliteBrute >= 7 ? "#16a34a"
        : rentabiliteBrute >= 5 ? "#ea580c"
        : "#dc2626"
        : "#9ca3af",
    },
    {
      label: "ROI net / an",
      val: rentabiliteNette != null
        ? `${rentabiliteNette >= 0 ? "+" : ""}${rentabiliteNette.toFixed(2)} %`
        : "—",
      sub: mensualiteCredit > 0
        ? `cashflow: ${cashflowMensuel >= 0 ? "+" : ""}${cashflowMensuel.toLocaleString("fr-FR")} €/mois`
        : "Renseignez la mensualité crédit",
      color: rentabiliteNette != null
        ? rentabiliteNette >= 0 ? "#16a34a" : "#dc2626"
        : "#9ca3af",
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
        ? breakEvenAns <= 15 ? "#16a34a"
        : breakEvenAns <= 20 ? "#ea580c"
        : "#dc2626"
        : "#9ca3af",
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
        ? "#16a34a"
        : anneesRestantesCredit !== null
        ? anneesRestantesCredit <= 5 ? "#ea580c"
        : "#111"
        : "#9ca3af",
    },
  ]

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <main style={{ minHeight: "100vh", background: "#F7F4EF", fontFamily: "'DM Sans', sans-serif" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: isMobile ? "24px 16px" : "32px 48px" }}>

        <Link href="/proprietaire" style={{ fontSize: 14, color: "#6b7280", textDecoration: "none" }}>
          ← Retour au dashboard
        </Link>

        <div style={{ margin: "16px 0 20px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: "-0.5px" }}>Statistiques</h1>
            <p style={{ color: "#6b7280", marginTop: 4, fontSize: 14 }}>
              {bien.titre} · {bien.ville} · {bien.surface} m²
            </p>
          </div>
          <button onClick={() => setEditOpen(!editOpen)}
            style={{ padding: "9px 18px", border: "1.5px solid #e5e7eb", borderRadius: 999, background: editOpen ? "#111" : "white", color: editOpen ? "white" : "#111", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
            {editOpen ? "Fermer" : "Modifier les donnees"}
          </button>
        </div>

        {/* ── Panneau edition ── */}
        {editOpen && (
          <div style={{ background: "white", borderRadius: 20, padding: 24, marginBottom: 24, border: "1.5px solid #e5e7eb" }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 20 }}>Données du bien</h3>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 16, marginBottom: 16 }}>
              {[
                { k: "titre", l: "Titre" },
                { k: "prix", l: "Loyer mensuel (€)" },
                { k: "charges", l: "Charges (€)" },
                { k: "valeur_bien", l: "Valeur du bien (€)" },
                { k: "mensualite_credit", l: "Mensualite credit (€)" },
                { k: "duree_credit", l: "Durée crédit (mois)" },
                { k: "date_debut_bail", l: "Date debut du bail", type: "date" },
              ].map(f => (
                <div key={f.k}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.4px" }}>{f.l}</label>
                  <input
                    type={f.type || "text"}
                    value={editForm[f.k] ?? ""}
                    onChange={e => setEditForm((p: any) => ({ ...p, [f.k]: e.target.value }))}
                    style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #e5e7eb", borderRadius: 10, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }}
                  />
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 20 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.4px" }}>Email locataire</label>
                <input value={editForm.locataire_email ?? ""} onChange={e => setEditForm((p: any) => ({ ...p, locataire_email: e.target.value }))}
                  placeholder="locataire@email.com"
                  style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #e5e7eb", borderRadius: 10, fontSize: 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.4px" }}>Statut</label>
                <select value={editForm.statut ?? "disponible"} onChange={e => setEditForm((p: any) => ({ ...p, statut: e.target.value }))}
                  style={{ width: "100%", padding: "9px 12px", border: "1.5px solid #e5e7eb", borderRadius: 10, fontSize: 14, fontFamily: "inherit", outline: "none", background: "white", boxSizing: "border-box" }}>
                  <option value="disponible">Disponible</option>
                  <option value="en visite">En visite</option>
                  <option value="réservé">Réservé</option>
                  <option value="loué">Loué</option>
                </select>
              </div>
            </div>
            <button onClick={sauvegarderBien} disabled={saving}
              style={{ padding: "10px 24px", background: savedOk ? "#16a34a" : saving ? "#9ca3af" : "#111", color: "white", border: "none", borderRadius: 999, fontWeight: 700, fontSize: 14, cursor: saving ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
              {saving ? "Sauvegarde..." : savedOk ? "Sauvegarde !" : "Sauvegarder"}
            </button>
          </div>
        )}

        {/* ── 6 KPI cards ── */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(3, 1fr)", gap: 14, marginBottom: 24 }}>
          {kpis.map(k => (
            <div key={k.label} style={card}>
              <p style={{ fontSize: 10, color: "#6b7280", marginBottom: 8, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>
                {k.label}
              </p>
              <p style={{ fontSize: 20, fontWeight: 800, color: k.color, letterSpacing: "-0.5px", lineHeight: 1.2 }}>
                {k.val}
              </p>
              <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 6 }}>{k.sub}</p>
            </div>
          ))}
        </div>

        {/* ── Monthly revenue bar chart (full width) ── */}
        <div style={{ ...card, marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800 }}>Revenus mensuels — 12 derniers mois</h3>
            <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#6b7280" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: "#16a34a", display: "inline-block" }} />
                Confirmé
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: "#f97316", display: "inline-block" }} />
                Déclaré
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 18, height: 1, background: "#d1d5db", display: "inline-block", borderTop: "1px dashed #d1d5db" }} />
                Loyer théorique
              </span>
            </div>
          </div>
          <BarChart items={last12Months} refVal={loyerMensuel} />
        </div>

        {/* ── Break-even chart + Financial analysis ── */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 20, marginBottom: 24 }}>

          <div style={card}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800 }}>
                Progression vers la rentabilite
              </h3>
              <div style={{ display: "flex", gap: 4 }}>
                {([{ label: "5 ans", val: 60 }, { label: "10 ans", val: 120 }, { label: "15 ans", val: 180 }, { label: "Tout", val: 0 }] as const).map(z => (
                  <button key={z.val} onClick={() => setZoomMois(z.val)}
                    style={{ padding: "4px 10px", border: "1.5px solid #e5e7eb", borderRadius: 999, fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", background: zoomMois === z.val ? "#111" : "white", color: zoomMois === z.val ? "white" : "#6b7280", transition: "all 0.15s" }}>
                    {z.label}
                  </button>
                ))}
              </div>
            </div>
            <p style={{ fontSize: 12, color: "#9ca3af", marginBottom: 16 }}>
              % de l'investissement récupéré via les loyers ({valeurBien > 0 ? `${(valeurBien / 1000).toFixed(0)}k €` : "valeur non renseignée"}).
              Projection à {loyerMensuel > 0 ? `${loyerMensuel.toLocaleString("fr-FR")} €/mois` : "loyer non renseigné"}.
            </p>

            <LineChart
              points={zoomMois > 0 ? perPoints.slice(0, zoomMois) : perPoints}
              target={100}
              unit="%"
              labels={zoomMois > 0 ? perLabels.slice(0, zoomMois) : perLabels}
            />

            {perPoints.length >= 2 && (
              <div style={{ display: "flex", gap: 16, marginTop: 12, fontSize: 11, color: "#6b7280", flexWrap: "wrap" }}>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 20, height: 2, background: "#111", display: "inline-block" }} />
                  Réel (loyers encaissés)
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 20, height: 1, borderTop: "2px dashed #d1d5db", display: "inline-block" }} />
                  Projection théorique
                </span>
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 20, height: 1, borderTop: "2px dashed #dc2626", display: "inline-block", opacity: 0.7 }} />
                  100 % — rentabilisé
                </span>
              </div>
            )}

            {perPoints.length < 2 && (
              <div style={{ marginTop: 8, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "10px 14px" }}>
                <p style={{ fontSize: 12, color: "#92400e", fontWeight: 600 }}>
                  Renseignez la date de début du bail et la valeur du bien pour voir ce graphique
                </p>
              </div>
            )}
          </div>

          <div style={card}>
            <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 20 }}>Analyse financiere</h3>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {[
                { label: "Loyer mensuel",             val: `${loyerMensuel.toLocaleString("fr-FR")} €`,                                          color: "#111",      bold: false },
                { label: "Charges récupérables",      val: `${charges.toLocaleString("fr-FR")} €`,                                               color: "#111",      bold: false },
                { label: "Revenu mensuel total",      val: `${revenuMensuel.toLocaleString("fr-FR")} €`,                                         color: "#16a34a",   bold: true  },
                { label: "Mensualité crédit",         val: mensualiteCredit ? `-${mensualiteCredit.toLocaleString("fr-FR")} €` : "Non renseigné", color: mensualiteCredit ? "#dc2626" : "#9ca3af", bold: false },
                { label: "Cashflow mensuel net",      val: mensualiteCredit ? `${cashflowMensuel >= 0 ? "+" : ""}${cashflowMensuel.toLocaleString("fr-FR")} €` : "—", color: cashflowMensuel >= 0 ? "#16a34a" : "#dc2626", bold: true },
                { label: `Revenus réels ${currentYear}`, val: `${revenuAnnuelReel.toLocaleString("fr-FR")} €`,                                   color: "#111",      bold: false },
                { label: "Objectif annuel théorique", val: `${revenuAnnuelTheorique.toLocaleString("fr-FR")} €`,                                 color: "#6b7280",   bold: false },
                { label: "Total encaissé confirmé",   val: `${totalEncaisse.toLocaleString("fr-FR")} €`,                                         color: "#16a34a",   bold: true  },
              ].map((r, idx, arr) => (
                <div
                  key={r.label}
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "9px 0",
                    borderBottom: idx < arr.length - 1 ? "1px solid #f3f4f6" : "none",
                  }}
                >
                  <span style={{ fontSize: 13, color: "#6b7280" }}>{r.label}</span>
                  <span style={{ fontSize: 14, fontWeight: r.bold ? 800 : 600, color: r.color }}>{r.val}</span>
                </div>
              ))}
            </div>

            {!valeurBien && (
              <div style={{ marginTop: 14, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, padding: "10px 14px" }}>
                <p style={{ fontSize: 12, color: "#92400e", fontWeight: 600 }}>
                  Ajoutez la valeur du bien et la mensualite credit pour voir le ROI et le seuil de rentabilite
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Annual comparison (only when 2+ years of data) ── */}
        {annualData.length >= 2 && (
          <div style={{ ...card, marginBottom: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 20 }}>Comparaison annuelle</h3>
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
                          <p style={{ fontSize: 12, fontWeight: 800 }}>{yr.total.toLocaleString("fr-FR")} €</p>
                          {pct !== null && (
                            <p style={{ fontSize: 10, color: pct >= 90 ? "#16a34a" : "#ea580c" }}>{pct}% objectif</p>
                          )}
                          <div style={{ width: "100%", display: "flex", alignItems: "flex-end", height: BAR_H, gap: 4, justifyContent: "center" }}>
                            <div style={{ width: 28, height: hTotal, background: "#e5e7eb", borderRadius: "4px 4px 0 0" }} title="Total déclaré" />
                            <div style={{ width: 28, height: hConf,  background: "#16a34a", borderRadius: "4px 4px 0 0" }} title="Confirmé" />
                          </div>
                          <p style={{ fontSize: 12, color: "#6b7280", fontWeight: 700 }}>{yr.year}</p>
                          <p style={{ fontSize: 10, color: "#16a34a" }}>✓ {yr.confirmed.toLocaleString("fr-FR")} €</p>
                        </div>
                      )
                    })}
                    {/* Theoretical target column */}
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                      <p style={{ fontSize: 12, fontWeight: 800, color: "#9ca3af" }}>
                        {revenuAnnuelTheorique.toLocaleString("fr-FR")} €
                      </p>
                      <p style={{ fontSize: 10, color: "#9ca3af" }}>100% objectif</p>
                      <div style={{ width: "100%", display: "flex", alignItems: "flex-end", height: BAR_H, justifyContent: "center" }}>
                        <div style={{ width: 28, height: BAR_H, background: "transparent", borderRadius: "4px 4px 0 0", border: "2px dashed #e5e7eb" }} />
                      </div>
                      <p style={{ fontSize: 12, color: "#9ca3af", fontWeight: 700 }}>Objectif</p>
                      <p style={{ fontSize: 10, color: "#9ca3af" }}>théorique</p>
                    </div>
                  </>
                )
              })()}
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 16, fontSize: 11, color: "#6b7280" }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: "#e5e7eb", display: "inline-block" }} />
                Total déclaré
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 10, height: 10, borderRadius: 2, background: "#16a34a", display: "inline-block" }} />
                Confirmé
              </span>
            </div>
          </div>
        )}

        {/* ── Occupancy + Bail info ── */}
        <div style={{ display: "grid", gridTemplateColumns: tauxOccupation !== null ? "200px 1fr" : "1fr", gap: 20 }}>

          {tauxOccupation !== null && (
            <div style={card}>
              <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 16 }}>Occupation</h3>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                <svg viewBox="0 0 36 36" width={90} height={90}>
                  <circle
                    cx={18} cy={18} r={15.9}
                    fill="none" stroke="#f3f4f6" strokeWidth={3.8}
                  />
                  <circle
                    cx={18} cy={18} r={15.9}
                    fill="none"
                    stroke={tauxOccupation >= 90 ? "#16a34a" : tauxOccupation >= 70 ? "#ea580c" : "#dc2626"}
                    strokeWidth={3.8}
                    strokeDasharray={`${tauxOccupation} ${100 - tauxOccupation}`}
                    strokeDashoffset={25}
                    strokeLinecap="round"
                  />
                  <text x={18} y={20} textAnchor="middle" fontSize={8} fontWeight="bold" fill="#111">
                    {tauxOccupation}%
                  </text>
                </svg>
                <div style={{ textAlign: "center" }}>
                  <p style={{ fontSize: 22, fontWeight: 800, color: tauxOccupation >= 90 ? "#16a34a" : "#ea580c" }}>
                    {tauxOccupation}%
                  </p>
                  <p style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>
                    {loyers.length} / {moisDepuisDebut} mois
                  </p>
                  <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                    depuis début du bail
                  </p>
                </div>
              </div>
            </div>
          )}

          {(bien.date_debut_bail || bien.locataire_email || breakEvenDate) && (
            <div style={card}>
              <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 16 }}>Informations du bail</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 20 }}>
                {bien.date_debut_bail && (
                  <div>
                    <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Date de début</p>
                    <p style={{ fontWeight: 700 }}>
                      {new Date(bien.date_debut_bail).toLocaleDateString("fr-FR")}
                    </p>
                  </div>
                )}
                {bien.locataire_email && (
                  <div>
                    <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Locataire</p>
                    <p style={{ fontWeight: 700, fontSize: 13 }}>{bien.locataire_email}</p>
                  </div>
                )}
                {bien.date_debut_bail && (
                  <div>
                    <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Durée en cours</p>
                    <p style={{ fontWeight: 700 }}>{moisDepuisDebut} mois</p>
                  </div>
                )}
                {breakEvenDate && (
                  <div>
                    <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Seuil de rentabilité</p>
                    <p style={{ fontWeight: 700, color: "#16a34a" }}>
                      {breakEvenDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}
                    </p>
                    <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                      dans {breakEvenAns?.toFixed(1)} ans
                    </p>
                  </div>
                )}
                {rentabiliteBrute && (
                  <div>
                    <p style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>Rentabilité brute</p>
                    <p style={{ fontWeight: 700, color: rentabiliteBrute >= 7 ? "#16a34a" : "#ea580c" }}>
                      {rentabiliteBrute.toFixed(2)} %
                    </p>
                    <p style={{ fontSize: 11, color: "#9ca3af", marginTop: 2 }}>
                      {rentabiliteBrute >= 7 ? "Excellent" : rentabiliteBrute >= 5 ? "Correct" : "Faible"}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Gestion des loyers ── */}
        <div style={{ ...card, marginTop: 24 }}>
          <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 20 }}>Gestion des loyers &amp; Quittances</h3>

          {/* Ajouter un loyer */}
          <div style={{ display: "flex", gap: 12, alignItems: "flex-end", marginBottom: 24, flexWrap: "wrap" }}>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 6, textTransform: "uppercase" as const }}>Mois</label>
              <input type="month" value={newLoyerMois} onChange={e => setNewLoyerMois(e.target.value)}
                style={{ padding: "8px 12px", border: "1.5px solid #e5e7eb", borderRadius: 10, fontSize: 13, fontFamily: "inherit", outline: "none" }} />
            </div>
            <div>
              <label style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", display: "block", marginBottom: 6, textTransform: "uppercase" as const }}>Montant (€)</label>
              <input type="number" value={newLoyerMontant} onChange={e => setNewLoyerMontant(e.target.value)}
                placeholder={String(loyerMensuel)}
                style={{ padding: "8px 12px", border: "1.5px solid #e5e7eb", borderRadius: 10, fontSize: 13, fontFamily: "inherit", outline: "none", width: 120 }} />
            </div>
            <button onClick={ajouterOuMettreAJourLoyer} disabled={!newLoyerMois || !newLoyerMontant || savingLoyer}
              style={{ background: newLoyerMois && newLoyerMontant ? "#111" : "#e5e7eb", color: newLoyerMois && newLoyerMontant ? "white" : "#9ca3af", border: "none", borderRadius: 999, padding: "9px 20px", fontWeight: 700, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              {savingLoyer ? "Sauvegarde..." : "Enregistrer le loyer"}
            </button>
          </div>

          {/* Liste des loyers */}
          {loyers.length === 0 ? (
            <p style={{ fontSize: 13, color: "#9ca3af", textAlign: "center", padding: "20px 0" }}>Aucun loyer enregistré. Ajoutez le premier loyer ci-dessus.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 0 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 0, background: "#f9fafb", borderRadius: "10px 10px 0 0", padding: "8px 16px" }}>
                {["Mois", "Montant", "Statut", "Confirmer", "Quittance"].map(h => (
                  <span key={h} style={{ fontSize: 10, fontWeight: 700, color: "#6b7280", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>{h}</span>
                ))}
              </div>
              {[...loyers].sort((a, b) => b.mois.localeCompare(a.mois)).map((l, i) => {
                const moisDate = new Date(l.mois + "-01")
                const moisLabel = moisDate.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
                const estConfirme = l.statut === "confirmé"
                return (
                  <div key={l.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: 0, padding: "12px 16px", borderTop: "1px solid #f3f4f6", background: i % 2 === 0 ? "white" : "#fafafa", alignItems: "center" }}>
                    <span style={{ fontSize: 13, fontWeight: 600, textTransform: "capitalize" as const }}>{moisLabel}</span>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{l.montant.toLocaleString("fr-FR")} €</span>
                    <span style={{ display: "inline-flex" }}>
                      <span style={{ background: estConfirme ? "#dcfce7" : "#fff7ed", color: estConfirme ? "#16a34a" : "#c2410c", padding: "2px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700 }}>
                        {estConfirme ? "✓ Confirmé" : "En attente"}
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
                          nomProprietaire: session?.user?.name || bien.proprietaire || "Propriétaire",
                          emailProprietaire: bien.proprietaire_email || session?.user?.email || "",
                          emailLocataire: bien.locataire_email,
                          titreBien: bien.titre || "",
                          villeBien: bien.ville || "",
                          adresse: bien.adresse || bien.ville || "",
                          loyerHC: Number(bien.prix) || 0,
                          charges: Number(bien.charges) || 0,
                          moisLabel
                        })}
                          style={{ background: "#eff6ff", color: "#1d4ed8", border: "1.5px solid #bfdbfe", borderRadius: 999, padding: "4px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                          PDF
                        </button>
                      )}
                      {estConfirme && !bien.locataire_email && (
                        <span style={{ fontSize: 10, color: "#9ca3af" }}>Email locataire manquant</span>
                      )}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

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
