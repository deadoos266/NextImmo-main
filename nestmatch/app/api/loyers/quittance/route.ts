/**
 * POST /api/loyers/quittance
 *
 * Génère le PDF de quittance pour un loyer confirmé, l'upload dans le
 * bucket Supabase `quittances`, met à jour `loyers.quittance_pdf_url`,
 * et envoie l'email Resend au locataire avec le lien de téléchargement.
 *
 * Sécurité : auth NextAuth requise + le caller doit être le proprio de
 * l'annonce liée au loyer (vérifié via service_role lookup).
 *
 * Idempotent : si `loyers.quittance_pdf_url` existe déjà, l'API renvoie
 * cette URL sans regénérer (évite les régénérations accidentelles).
 *
 * Runtime: nodejs (jsPDF + Buffer + Resend ne fonctionnent qu'en Node).
 */

import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "../../../../lib/auth"
import { supabaseAdmin } from "../../../../lib/supabase-server"
import { generateQuittancePDFBuffer, buildQuittancePath } from "../../../../lib/quittancePDFServer"
import { sendEmail } from "../../../../lib/email/resend"
import { quittanceTemplate } from "../../../../lib/email/templates"

export const runtime = "nodejs"

interface QuittanceRequestBody {
  loyerId?: string | number
  // Fallback : permet de regénérer pour un loyer déjà confirmé sans id
  // (ex: depuis un script admin) en passant les données directement.
  annonceId?: number
  periodeMois?: string  // YYYY-MM (ex: "2026-09")
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  const userEmail = session?.user?.email?.toLowerCase()
  if (!userEmail) {
    return NextResponse.json({ ok: false, error: "Non authentifié" }, { status: 401 })
  }

  let body: QuittanceRequestBody
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: "Body JSON invalide" }, { status: 400 })
  }

  // Récupère le loyer
  const loyerId = body.loyerId
  if (!loyerId) {
    return NextResponse.json({ ok: false, error: "loyerId manquant" }, { status: 400 })
  }

  const { data: loyer, error: loyerErr } = await supabaseAdmin
    .from("loyers")
    .select("id, annonce_id, locataire_email, mois, montant, charges, quittance_pdf_url")
    .eq("id", loyerId)
    .maybeSingle()

  if (loyerErr || !loyer) {
    return NextResponse.json({ ok: false, error: "Loyer introuvable" }, { status: 404 })
  }

  // Idempotence : si déjà généré, renvoyer l'URL existante
  if (loyer.quittance_pdf_url) {
    return NextResponse.json({ ok: true, url: loyer.quittance_pdf_url, alreadyGenerated: true })
  }

  // Récupère l'annonce + le proprio + le locataire pour validation accès
  const { data: annonce } = await supabaseAdmin
    .from("annonces")
    .select("id, titre, ville, adresse, prix, charges, proprietaire_email")
    .eq("id", loyer.annonce_id)
    .maybeSingle()

  if (!annonce) {
    return NextResponse.json({ ok: false, error: "Annonce introuvable" }, { status: 404 })
  }

  // Auth métier : seul le proprio (ou admin) peut générer
  const proprietaireEmail = (annonce.proprietaire_email || "").toLowerCase()
  const isAdmin = (session?.user as { isAdmin?: boolean })?.isAdmin === true
  if (proprietaireEmail !== userEmail && !isAdmin) {
    return NextResponse.json({ ok: false, error: "Accès refusé" }, { status: 403 })
  }

  // Récupère le profil proprio (nom + adresse)
  const { data: proprioProfil } = await supabaseAdmin
    .from("profils")
    .select("nom, adresse")
    .eq("email", proprietaireEmail)
    .maybeSingle()

  // Récupère le profil locataire (nom)
  const { data: locataireProfil } = await supabaseAdmin
    .from("profils")
    .select("nom")
    .eq("email", loyer.locataire_email)
    .maybeSingle()

  // Format période (mois est stocké au format YYYY-MM en général)
  const mois = String(loyer.mois || body.periodeMois || "")
  let moisLabel: string
  try {
    const [year, month] = mois.split("-")
    if (!year || !month) throw new Error("invalid")
    const date = new Date(parseInt(year), parseInt(month) - 1, 1)
    moisLabel = date.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })
  } catch {
    moisLabel = mois || "Période non renseignée"
  }

  // Génération PDF
  const loyerHC = Number(loyer.montant || annonce.prix || 0)
  const chargesMontant = Number(loyer.charges ?? annonce.charges ?? 0)
  const pdfBuffer = generateQuittancePDFBuffer({
    nomProprietaire: proprioProfil?.nom || proprietaireEmail,
    emailProprietaire: proprietaireEmail,
    adresseProprietaire: (proprioProfil as { adresse?: string | null })?.adresse || null,
    nomLocataire: locataireProfil?.nom || null,
    emailLocataire: loyer.locataire_email,
    titreBien: annonce.titre || "Logement",
    villeBien: annonce.ville || "",
    adresse: annonce.adresse || null,
    loyerHC,
    charges: chargesMontant,
    moisLabel,
  })

  // Upload Storage
  const path = buildQuittancePath({
    locataireEmail: loyer.locataire_email,
    annonceId: annonce.id,
    moisLabel,
  })
  const { error: uploadErr } = await supabaseAdmin.storage
    .from("quittances")
    .upload(path, pdfBuffer, { contentType: "application/pdf", upsert: false })
  if (uploadErr) {
    console.error("[quittance] upload failed", uploadErr)
    return NextResponse.json({ ok: false, error: "Upload PDF a échoué" }, { status: 500 })
  }

  const { data: urlData } = supabaseAdmin.storage.from("quittances").getPublicUrl(path)
  const publicUrl = urlData.publicUrl

  // Persist URL sur loyers
  await supabaseAdmin.from("loyers").update({ quittance_pdf_url: publicUrl }).eq("id", loyer.id)

  // Envoi email locataire (best-effort, ne bloque pas si Resend indisponible)
  const { subject, html, text } = quittanceTemplate({
    bienTitre: annonce.titre || "Logement",
    ville: annonce.ville,
    periode: moisLabel,
    loyerCC: loyerHC + chargesMontant,
    pdfUrl: publicUrl,
  })
  const emailRes = await sendEmail({
    to: loyer.locataire_email,
    subject,
    html,
    text,
    tags: [{ name: "type", value: "quittance" }],
  })
  // Best-effort : la quittance est uploadée, le mail rate parfois (Resend pas
  // configuré, domaine pas vérifié, ...) — on log mais on ne fail pas la
  // requête. Le locataire peut toujours la consulter sur /mes-quittances.
  if (emailRes.ok === false && emailRes.skipped !== true) {
    console.error("[quittance] email send failed", emailRes.error)
  }

  return NextResponse.json({ ok: true, url: publicUrl, emailSent: emailRes.ok === true })
}
