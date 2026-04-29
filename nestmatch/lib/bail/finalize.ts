/**
 * V32.5 — Finalisation du bail à double signature.
 * Audit produit V31 R1.5 : avant cette feature, le succès de signature était
 * silencieux côté locataire (juste un message in-app). Maintenant : email
 * formel envoyé aux 2 parties avec PDF complet signé en pièce jointe.
 *
 * Appelé une seule fois (idempotent via le check `existingMsg [EDL_A_PLANIFIER]`
 * dans signer/route.ts) lorsque locataire + bailleur ont tous deux signé.
 *
 * Architecture :
 * 1. Récupère le payload [BAIL_CARD] (bailData JSON sérialisé) depuis le
 *    dernier message du thread.
 * 2. Récupère les signatures (PNG canvas, nom, mention, IP, signe_at).
 * 3. Tente la génération PDF server-side via genererBailPDFBuffer
 *    (jsPDF est node-compatible mais on fallback si crash).
 * 4. Envoie email Resend aux 2 parties avec PDF en pièce jointe (ou lien
 *    fichierUrl si bail externe importé).
 */

import { supabaseAdmin } from "../supabase-server"
import { sendEmail } from "../email/resend"
import { bailFinalActifTemplate } from "../email/templates"
import { genererBailPDFBuffer } from "../bailPDF"
import type { BailData, BailSignatureEntry } from "../bailPDF"

const BAIL_PREFIX = "[BAIL_CARD]"

interface FinalizeBailArgs {
  annonceId: number
  proprioEmail: string
  locataireEmail: string
  bienTitre?: string | null
  ville?: string | null
  prix?: number | null
  charges?: number | null
  dateDebutBail?: string | null
}

export async function finalizeBail(args: FinalizeBailArgs): Promise<{ ok: boolean; reason?: string }> {
  const { annonceId, proprioEmail, locataireEmail } = args

  // 1. Récupère le payload [BAIL_CARD] (le plus récent)
  const { data: bailMsg } = await supabaseAdmin
    .from("messages")
    .select("contenu, created_at")
    .eq("annonce_id", annonceId)
    .ilike("contenu", `${BAIL_PREFIX}%`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()

  let bailData: BailData | null = null
  if (bailMsg?.contenu) {
    try {
      const raw = bailMsg.contenu.slice(BAIL_PREFIX.length)
      bailData = JSON.parse(raw) as BailData
    } catch (e) {
      console.warn("[finalizeBail] parse BAIL_CARD failed:", e)
    }
  }

  if (!bailData) {
    // Fallback minimal : on a quand même les infos de l'annonce (paramètres)
    // → on enverra un email récap sans PDF.
    bailData = {
      type: "vide",
      nomBailleur: "",
      adresseBailleur: "",
      emailBailleur: proprioEmail,
      nomLocataire: "",
      emailLocataire: locataireEmail,
      titreBien: args.bienTitre || "",
      adresseBien: "",
      villeBien: args.ville || "",
      surface: 0,
      pieces: 0,
      etage: "",
      description: "",
      meuble: false,
      parking: false,
      cave: false,
      dateDebut: args.dateDebutBail || new Date().toISOString().slice(0, 10),
      duree: 36,
      loyerHC: Number(args.prix || 0),
      charges: Number(args.charges || 0),
      caution: 0,
      modeReglement: "Virement bancaire",
      dateReglement: "Le 1er du mois",
      dpe: "",
    }
  }

  // 2. Récupère toutes les signatures
  const { data: sigsRaw } = await supabaseAdmin
    .from("bail_signatures")
    .select("signataire_role, signataire_nom, signature_png, mention, ip_address, signe_at")
    .eq("annonce_id", annonceId)

  const signatures: BailSignatureEntry[] = (sigsRaw || []).map(s => ({
    role: s.signataire_role as "bailleur" | "locataire" | "garant",
    nom: s.signataire_nom,
    png: s.signature_png,
    signeAt: s.signe_at,
    mention: s.mention,
    ipAddress: s.ip_address || undefined,
  }))

  const sigBailleur = signatures.find(s => s.role === "bailleur")
  const sigLocataire = signatures.find(s => s.role === "locataire")
  const signeAt = sigBailleur?.signeAt || sigLocataire?.signeAt || new Date().toISOString()

  // 3. Tente génération PDF server-side (avec signatures injectées)
  let pdfAttachment: { filename: string; content: Buffer } | null = null
  let pdfPublicUrl: string | null = bailData.fichierUrl ? String(bailData.fichierUrl) : null
  if (!bailData.fichierUrl) {
    try {
      const dataAvecSigs: BailData = { ...bailData, signatures }
      const { buffer, filename } = await genererBailPDFBuffer(dataAvecSigs)
      pdfAttachment = {
        filename,
        content: Buffer.from(buffer),
      }
      // V50.10 — upload du PDF dans le bucket "baux" pour le poster aussi
      // dans la conversation. User : "apres que le proprio a contre signé
      // il est pas dans la conv le bail seulement reçu par mail".
      try {
        const path = `${proprioEmail}/${annonceId}/bail_signe_${Date.now()}.pdf`
        const { error: uploadErr } = await supabaseAdmin.storage
          .from("baux")
          .upload(path, Buffer.from(buffer), {
            contentType: "application/pdf",
            upsert: false,
          })
        if (!uploadErr) {
          const { data: urlData } = supabaseAdmin.storage.from("baux").getPublicUrl(path)
          pdfPublicUrl = urlData.publicUrl
        } else {
          console.warn("[finalizeBail] PDF upload failed:", uploadErr.message)
        }
      } catch (e) {
        console.warn("[finalizeBail] PDF upload exception:", e)
      }
    } catch (e) {
      console.warn("[finalizeBail] PDF buffer generation failed (envoi sans pièce jointe):", e)
    }
  }

  // 4. Envoi des 2 emails (locataire + bailleur)
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://keymatch-immo.fr"
  const loyerCC = Number(bailData.loyerHC || 0) + Number(bailData.charges || 0)

  const sharedParams = {
    bienTitre: bailData.titreBien || args.bienTitre || "Logement",
    ville: bailData.villeBien || args.ville || null,
    dateDebut: bailData.dateDebut,
    dureeMois: bailData.duree,
    loyerCC,
    nomLocataire: bailData.nomLocataire || locataireEmail,
    nomBailleur: bailData.nomBailleur || proprioEmail,
    signeAt,
  }

  const tplLoc = bailFinalActifTemplate({
    ...sharedParams,
    destinataireRole: "locataire",
    monLogementUrl: `${baseUrl}/mon-logement`,
  })
  const tplProp = bailFinalActifTemplate({
    ...sharedParams,
    destinataireRole: "bailleur",
    monLogementUrl: `${baseUrl}/proprietaire/edl/${annonceId}`,
  })

  const attachments = pdfAttachment ? [pdfAttachment] : undefined

  const [resLoc, resProp] = await Promise.all([
    sendEmail({
      to: locataireEmail,
      subject: tplLoc.subject,
      html: tplLoc.html,
      text: tplLoc.text,
      attachments,
      tags: [
        { name: "type", value: "bail_final_actif" },
        { name: "role", value: "locataire" },
      ],
    }),
    sendEmail({
      to: proprioEmail,
      subject: tplProp.subject,
      html: tplProp.html,
      text: tplProp.text,
      attachments,
      tags: [
        { name: "type", value: "bail_final_actif" },
        { name: "role", value: "bailleur" },
      ],
    }),
  ])

  if (resLoc.ok === false && !resLoc.skipped) {
    console.warn("[finalizeBail] email locataire failed:", resLoc.error)
  }
  if (resProp.ok === false && !resProp.skipped) {
    console.warn("[finalizeBail] email proprio failed:", resProp.error)
  }

  // V50.10 — Poster un message [BAIL_FINAL_PDF] dans la conversation pour
  // que les 2 parties retrouvent le PDF directement dans le thread (sans
  // fouiller leurs mails). Idempotent : on n'insère que si pas déjà fait.
  if (pdfPublicUrl) {
    try {
      const BAIL_FINAL_PREFIX = "[BAIL_FINAL_PDF]"
      const { data: existing } = await supabaseAdmin
        .from("messages")
        .select("id")
        .eq("annonce_id", annonceId)
        .ilike("contenu", `${BAIL_FINAL_PREFIX}%`)
        .limit(1)
        .maybeSingle()
      if (!existing) {
        const finalPayload = {
          url: pdfPublicUrl,
          dateSignatureFinale: signeAt,
          bienTitre: bailData.titreBien || args.bienTitre || "Logement",
          ville: bailData.villeBien || args.ville || null,
          dateDebut: bailData.dateDebut,
        }
        await supabaseAdmin.from("messages").insert([{
          from_email: proprioEmail,
          to_email: locataireEmail,
          contenu: BAIL_FINAL_PREFIX + JSON.stringify(finalPayload),
          lu: false,
          annonce_id: annonceId,
          created_at: new Date().toISOString(),
        }])
      }
    } catch (e) {
      console.warn("[finalizeBail] insert BAIL_FINAL_PDF message failed:", e)
    }
  }

  return { ok: true }
}
