/**
 * V70.4 — GET /api/cron/edl-contestation-retard
 *
 * Cron weekly (lundi 10h Paris). Identifie les EDL contestés depuis
 * 30+ jours sans résolution → notif les 2 parties + recommande la
 * procédure ADIL (médiation gratuite).
 *
 * Workflow contestation V69.1d :
 *   - Locataire conteste → statut='conteste' + contestation_date posé
 *   - Délai 30 jours pour le proprio de répondre/résoudre
 *   - Sans résolution sous 30j → ce cron ping ADIL
 *
 * Anti-spam : flag `contestation_expiree_at` posé après notif (1 fois/EDL).
 *
 * Auth : Bearer CRON_SECRET en prod.
 */

import { NextRequest, NextResponse } from "next/server"
import { supabaseAdmin } from "@/lib/supabase-server"
import { sendEmail } from "@/lib/email/resend"
import { shouldSendEmailForEvent } from "@/lib/notifPreferencesServer"

export const runtime = "nodejs"

const ADIL_URL = "https://www.adil.org/"
const ANIL_RECHERCHE = "https://www.anil.org/lanil-et-les-adil/votre-adil/"
const SEUIL_JOURS = 30

interface EdlConteste {
  id: string
  annonce_id: number | null
  type: string | null
  proprietaire_email: string | null
  locataire_email: string | null
  email_locataire: string | null
  contestation_date: string | null
  items_contestes: unknown
}

function emailADIL(args: {
  destinataireRole: "locataire" | "proprio"
  destinataireName: string
  bienTitre: string
  ville: string | null
  edlType: string
  contestationDate: string
  joursEcoules: number
}): { subject: string; html: string; text: string } {
  const villeStr = args.ville ? ` à ${args.ville}` : ""
  const subject = `⏱ EDL ${args.edlType === "entree" ? "d'entrée" : "de sortie"} contesté depuis ${args.joursEcoules}j — ADIL`
  const audienceText = args.destinataireRole === "locataire"
    ? "Vous avez contesté cet EDL et n'avez pas reçu de réponse satisfaisante depuis 30+ jours."
    : "Le locataire a contesté cet EDL et la situation n'a pas été résolue depuis 30+ jours."
  const html = `
    <h2 style="font-family:'DM Sans',sans-serif;color:#111">EDL contesté depuis ${args.joursEcoules}j</h2>
    <p>Bonjour ${args.destinataireName},</p>
    <p>${audienceText}</p>
    <p><strong>Bien :</strong> ${args.bienTitre}${villeStr}<br/>
    <strong>EDL ${args.edlType === "entree" ? "d'entrée" : "de sortie"}</strong> contesté le ${args.contestationDate}.</p>
    <h3 style="font-family:'DM Sans',sans-serif;color:#111;margin-top:24px">Procédure ADIL — médiation gratuite</h3>
    <p>L'<strong>ADIL</strong> (Agence Départementale d'Information sur le Logement) propose un service de médiation gratuit entre locataires et propriétaires :</p>
    <ol>
      <li>Trouvez l'ADIL de votre département : <a href="${ANIL_RECHERCHE}" style="color:#1d4ed8">${ANIL_RECHERCHE}</a></li>
      <li>Contactez-les par téléphone ou en agence</li>
      <li>Présentez votre situation + l'EDL contesté</li>
      <li>Un juriste examine et propose une médiation</li>
    </ol>
    <p style="margin-top:16px">Si la médiation ADIL ne résout pas, vous pouvez saisir la commission départementale de conciliation, puis en dernier recours le tribunal judiciaire.</p>
    <p style="margin-top:24px"><a href="${ADIL_URL}" style="color:#111;text-decoration:underline">En savoir plus sur l'ADIL</a></p>
    <hr style="border:0;border-top:1px solid #EAE6DF;margin:24px 0" />
    <p style="font-size:12px;color:#8a8477">KeyMatch — keymatch-immo.fr</p>
  `
  const text = `EDL contesté depuis ${args.joursEcoules}j\n\n${audienceText}\n\nBien : ${args.bienTitre}${villeStr}\nEDL ${args.edlType === "entree" ? "d'entrée" : "de sortie"} contesté le ${args.contestationDate}.\n\nProcédure ADIL (médiation gratuite) :\n1. Trouvez votre ADIL : ${ANIL_RECHERCHE}\n2. Contactez-les par téléphone\n3. Présentez votre situation + l'EDL\n4. Médiation par un juriste\n\nADIL : ${ADIL_URL}\n\nKeyMatch — keymatch-immo.fr`
  return { subject, html, text }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const auth = req.headers.get("authorization")
  if (secret && auth !== `Bearer ${secret}` && process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  const seuilDate = new Date(Date.now() - SEUIL_JOURS * 24 * 3600 * 1000).toISOString()

  // Fetch EDLs contestés depuis 30+ jours, pas encore notifiés
  const { data: edls, error } = await supabaseAdmin
    .from("etats_des_lieux")
    .select("id, annonce_id, type, proprietaire_email, locataire_email, email_locataire, contestation_date, items_contestes, contestation_expiree_at")
    .eq("statut", "conteste")
    .lt("contestation_date", seuilDate)
    .is("contestation_expiree_at", null)
    .limit(100)

  if (error) {
    console.error("[cron/edl-contestation-retard] fetch failed", error)
    return NextResponse.json({ ok: false, error: "Erreur serveur" }, { status: 500 })
  }

  const items: EdlConteste[] = (edls || []) as EdlConteste[]
  const results: Array<{ edlId: string; status: "sent" | "skipped"; reason?: string }> = []

  for (const e of items) {
    const propEmail = (e.proprietaire_email || "").toLowerCase()
    const locEmail = ((e.locataire_email || e.email_locataire) || "").toLowerCase()
    if (!propEmail || !locEmail || !e.contestation_date) {
      results.push({ edlId: e.id, status: "skipped", reason: "missing_data" })
      continue
    }

    const contestationMs = new Date(e.contestation_date).getTime()
    const joursEcoules = Math.floor((Date.now() - contestationMs) / (24 * 3600 * 1000))

    // Lookup annonce pour récupérer titre + ville
    let bienTitre = "Logement"
    let ville: string | null = null
    if (e.annonce_id) {
      const { data: ann } = await supabaseAdmin
        .from("annonces")
        .select("titre, ville")
        .eq("id", e.annonce_id)
        .maybeSingle()
      if (ann) {
        bienTitre = ann.titre || bienTitre
        ville = ann.ville
      }
    }

    // Profils pour personnalisation
    const [{ data: locProf }, { data: propProf }] = await Promise.all([
      supabaseAdmin.from("profils").select("prenom, nom").eq("email", locEmail).maybeSingle(),
      supabaseAdmin.from("profils").select("prenom, nom").eq("email", propEmail).maybeSingle(),
    ])
    const locName = [locProf?.prenom, locProf?.nom].filter(Boolean).join(" ").trim() || locEmail.split("@")[0]
    const propName = [propProf?.prenom, propProf?.nom].filter(Boolean).join(" ").trim() || propEmail.split("@")[0]

    const contestationDateFr = new Date(e.contestation_date).toLocaleDateString("fr-FR", {
      day: "numeric", month: "long", year: "numeric",
    })

    // Notif les 2 parties (respect prefs)
    const [allowedLoc, allowedProp] = await Promise.all([
      shouldSendEmailForEvent(locEmail, "edl_conteste"),
      shouldSendEmailForEvent(propEmail, "edl_conteste"),
    ])

    if (allowedLoc) {
      const tplLoc = emailADIL({
        destinataireRole: "locataire",
        destinataireName: locName,
        bienTitre,
        ville,
        edlType: e.type || "entree",
        contestationDate: contestationDateFr,
        joursEcoules,
      })
      await sendEmail({
        to: locEmail,
        subject: tplLoc.subject,
        html: tplLoc.html,
        text: tplLoc.text,
        tags: [{ name: "type", value: "edl_contestation_retard" }, { name: "role", value: "locataire" }],
      })
    }

    if (allowedProp) {
      const tplProp = emailADIL({
        destinataireRole: "proprio",
        destinataireName: propName,
        bienTitre,
        ville,
        edlType: e.type || "entree",
        contestationDate: contestationDateFr,
        joursEcoules,
      })
      await sendEmail({
        to: propEmail,
        subject: tplProp.subject,
        html: tplProp.html,
        text: tplProp.text,
        tags: [{ name: "type", value: "edl_contestation_retard" }, { name: "role", value: "proprio" }],
      })
    }

    // Notif cloche les 2
    const now = new Date().toISOString()
    await supabaseAdmin.from("notifications").insert([
      {
        user_email: locEmail,
        type: "edl_conteste",
        title: "Contestation EDL — délai 30j expiré",
        body: `Procédure ADIL recommandée pour résoudre la contestation.`,
        href: ADIL_URL,
        related_id: String(e.id),
        lu: false,
        created_at: now,
      },
      {
        user_email: propEmail,
        type: "edl_conteste",
        title: "EDL contesté non résolu — ADIL",
        body: `30j+ sans résolution. Médiation ADIL recommandée avant escalade.`,
        href: ADIL_URL,
        related_id: String(e.id),
        lu: false,
        created_at: now,
      },
    ])

    // Marque flag pour anti-spam
    await supabaseAdmin
      .from("etats_des_lieux")
      .update({ contestation_expiree_at: now })
      .eq("id", e.id)

    results.push({ edlId: e.id, status: "sent" })
  }

  return NextResponse.json({
    ok: true,
    scanned: items.length,
    sent: results.filter(r => r.status === "sent").length,
    skipped: results.filter(r => r.status === "skipped").length,
  })
}
