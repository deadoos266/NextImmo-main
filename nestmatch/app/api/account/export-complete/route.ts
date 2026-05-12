/**
 * V97.22 P3-11 — GET /api/account/export-complete
 *
 * Export RGPD complet (Article 20 — droit à la portabilité).
 * Retourne un ZIP contenant TOUTES les données de l'user connecté en JSON :
 *
 *   - profil.json         : ligne `profils` complète (sans password_hash)
 *   - messages.json       : messages envoyés ET reçus
 *   - candidatures.json   : candidatures du user (locataire) OU reçues (proprio)
 *   - dossier.json        : URLs des documents dossier (CNI/fiches paie/etc)
 *   - visites.json        : visites (proposeur ou destinataire)
 *   - loyers.json         : loyers (locataire OU proprio)
 *   - edls.json           : états des lieux où user = proprio ou locataire
 *   - annonces.json       : annonces publiées par user (si proprio)
 *   - notifications.json  : notifications reçues (table notifications)
 *   - README.txt          : explicatif format + liste tables couvertes
 *
 * Stratégie binaires (CNI, fiches paie, photos EDL, etc.) : on inclut les
 * URLs Supabase Storage dans le JSON. L'user peut télécharger les binaires
 * séparément. Conforme RGPD art. 20 qui demande un "format structuré,
 * couramment utilisé et lisible par machine" — JSON répond strictement.
 *
 * Sécurité :
 *  - Auth NextAuth obligatoire
 *  - User ne récupère QUE ses propres données (pas de leak via cas limite)
 *  - Rate-limit 5/jour (opération lourde + RGPD = pas besoin de 100/jour)
 *
 * Cf. PHASE_3_ROADMAP.md ligne 149 (P3-11).
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { checkRateLimitAsync, getClientIp } from "@/lib/rateLimit"

export const runtime = "nodejs"
export const maxDuration = 60

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>

function safeStringify(rows: unknown): string {
  return JSON.stringify(rows, null, 2)
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ error: "Auth requise" }, { status: 401 })
  }

  // Rate-limit 5/jour (export complet = coûteux + pas besoin de spam)
  const ip = getClientIp(req.headers)
  const rl = await checkRateLimitAsync(`account-export:${email || ip}`, { max: 5, windowMs: 24 * 60 * 60 * 1000 })
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Limite quotidienne atteinte (5 exports/jour). Réessayez demain." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 86400) } },
    )
  }

  // V97.22 fix verifier B1 + B2 — noms de colonnes réels (audit Management API) :
  // - visites : locataire_email + proprietaire_email (pas destinataire_email)
  // - etats_des_lieux : locataire_email + proprietaire_email (canoniques modernes)
  //                     + email_locataire + email_bailleur (historiques V0)
  // On utilise .or() pour couvrir les 2 variantes sur EDLs (drift schema).
  const [
    profilRes,
    messagesFromRes,
    messagesToRes,
    candidaturesAsLocataireRes,
    candidaturesAsProprioRes,
    visitesLocRes,
    visitesPropRes,
    loyersLocataireRes,
    loyersProprioRes,
    edlsAsLocataireRes,
    edlsAsProprioRes,
    annoncesProprioRes,
    notificationsRes,
  ] = await Promise.all([
    supabaseAdmin.from("profils").select("*").eq("email", email).maybeSingle(),
    supabaseAdmin.from("messages").select("*").eq("from_email", email).order("created_at", { ascending: false }).limit(5000),
    supabaseAdmin.from("messages").select("*").eq("to_email", email).order("created_at", { ascending: false }).limit(5000),
    // Candidatures comme locataire (messages type='candidature' from_email=me)
    supabaseAdmin.from("messages").select("*").eq("from_email", email).eq("type", "candidature").limit(2000),
    // Candidatures comme proprio (messages type='candidature' to_email=me)
    supabaseAdmin.from("messages").select("*").eq("to_email", email).eq("type", "candidature").limit(2000),
    // Visites en tant que locataire / proprio (PAS destinataire_email qui n'existe pas)
    supabaseAdmin.from("visites").select("*").eq("locataire_email", email).limit(2000),
    supabaseAdmin.from("visites").select("*").eq("proprietaire_email", email).limit(2000),
    supabaseAdmin.from("loyers").select("*").eq("locataire_email", email).order("mois", { ascending: false }).limit(2000),
    supabaseAdmin.from("loyers").select("*").eq("proprietaire_email", email).order("mois", { ascending: false }).limit(2000),
    // EDLs : OR sur les 2 variantes historiques (email_locataire et locataire_email coexistent)
    supabaseAdmin.from("etats_des_lieux").select("*").or(`locataire_email.eq.${email},email_locataire.eq.${email}`).limit(500),
    supabaseAdmin.from("etats_des_lieux").select("*").or(`proprietaire_email.eq.${email},email_bailleur.eq.${email}`).limit(500),
    supabaseAdmin.from("annonces").select("*").eq("proprietaire_email", email).limit(500),
    supabaseAdmin.from("notifications").select("*").eq("user_email", email).order("created_at", { ascending: false }).limit(2000),
  ])

  // V97.22 fix verifier B4 — log les erreurs Supabase qui seraient sinon
  // silencieusement avalées (col inexistante, RLS, etc). Pas blocking : un
  // user pourrait quand même obtenir un export partiel plutôt qu'un 500.
  const fetchResults = {
    profil: profilRes,
    messagesFrom: messagesFromRes,
    messagesTo: messagesToRes,
    candidaturesAsLocataire: candidaturesAsLocataireRes,
    candidaturesAsProprio: candidaturesAsProprioRes,
    visitesLoc: visitesLocRes,
    visitesProp: visitesPropRes,
    loyersLocataire: loyersLocataireRes,
    loyersProprio: loyersProprioRes,
    edlsAsLocataire: edlsAsLocataireRes,
    edlsAsProprio: edlsAsProprioRes,
    annoncesProprio: annoncesProprioRes,
    notifications: notificationsRes,
  } as Record<string, { error?: { message?: string } | null }>
  for (const [tableKey, res] of Object.entries(fetchResults)) {
    if (res?.error) {
      console.error(`[account/export-complete] fetch error on ${tableKey}:`, res.error.message)
    }
  }

  // Filtre profil : on retire password_hash si présent (sécurité interne)
  const profil = profilRes.data ? { ...profilRes.data } : null
  if (profil && "password_hash" in profil) delete profil.password_hash

  // Merge messages from + to en une seule liste dédupliquée par id
  const allMessages = new Map<string | number, Row>()
  for (const m of (messagesFromRes.data || [])) allMessages.set(m.id, m)
  for (const m of (messagesToRes.data || [])) allMessages.set(m.id, m)
  const messages = Array.from(allMessages.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  // Merge candidatures (sous-set des messages déjà dédupliqué)
  const allCandidatures = new Map<string | number, Row>()
  for (const c of (candidaturesAsLocataireRes.data || [])) allCandidatures.set(c.id, { ...c, _role: "locataire" })
  for (const c of (candidaturesAsProprioRes.data || [])) allCandidatures.set(c.id, { ...c, _role: "proprio" })

  // Merge visites (locataire + proprio, dédup par id)
  const allVisites = new Map<string | number, Row>()
  for (const v of (visitesLocRes.data || [])) allVisites.set(v.id, v)
  for (const v of (visitesPropRes.data || [])) allVisites.set(v.id, v)

  // Merge loyers (locataire + proprio)
  const allLoyers = new Map<string | number, Row>()
  for (const l of (loyersLocataireRes.data || [])) allLoyers.set(l.id, { ...l, _role: "locataire" })
  for (const l of (loyersProprioRes.data || [])) allLoyers.set(l.id, { ...l, _role: "proprio" })

  // Merge EDLs
  const allEdls = new Map<string | number, Row>()
  for (const e of (edlsAsLocataireRes.data || [])) allEdls.set(e.id, { ...e, _role: "locataire" })
  for (const e of (edlsAsProprioRes.data || [])) allEdls.set(e.id, { ...e, _role: "proprio" })

  // Construit le ZIP
  const { default: JSZip } = await import("jszip")
  const zip = new JSZip()

  const exportMeta = {
    user_email: email,
    exported_at: new Date().toISOString(),
    rgpd_article: "Article 20 du RGPD — Droit à la portabilité des données",
    note: "Cet export contient TOUTES vos données personnelles stockées par KeyMatch. Les URLs des fichiers binaires (CNI, fiches de paie, photos d'EDL, etc.) sont incluses dans le JSON correspondant — vous pouvez les télécharger séparément.",
  }

  zip.file("profil.json", safeStringify({ meta: exportMeta, profil }))
  zip.file("messages.json", safeStringify({ count: messages.length, messages }))
  zip.file("candidatures.json", safeStringify({ count: allCandidatures.size, candidatures: Array.from(allCandidatures.values()) }))
  zip.file("visites.json", safeStringify({ count: allVisites.size, visites: Array.from(allVisites.values()) }))
  zip.file("loyers.json", safeStringify({ count: allLoyers.size, loyers: Array.from(allLoyers.values()) }))
  zip.file("edls.json", safeStringify({ count: allEdls.size, edls: Array.from(allEdls.values()) }))
  zip.file("annonces.json", safeStringify({ count: annoncesProprioRes.data?.length || 0, annonces: annoncesProprioRes.data || [] }))
  zip.file("notifications.json", safeStringify({ count: notificationsRes.data?.length || 0, notifications: notificationsRes.data || [] }))

  // Dossier : extrait juste les URLs documents (CNI, fiches paie, etc.) du profil
  const dossierUrls: Record<string, unknown> = {}
  if (profil && "dossier_docs" in profil && profil.dossier_docs) {
    dossierUrls.dossier_docs = profil.dossier_docs
  }
  if (profil && "dossier_pdf_url" in profil) dossierUrls.dossier_pdf_url = profil.dossier_pdf_url
  zip.file("dossier.json", safeStringify({ meta: exportMeta, urls: dossierUrls }))

  const readme = `Export RGPD complet — KeyMatch
=============================================

Conforme à l'Article 20 du RGPD (Règlement Général sur la Protection des Données),
qui vous donne le droit de recevoir vos données personnelles dans un format
structuré, couramment utilisé et lisible par machine (JSON).

User : ${email}
Date d'export : ${new Date().toLocaleString("fr-FR")}

Contenu de l'archive :
-----------------------
  - profil.json         Votre profil complet (préférences, critères, etc.)
  - messages.json       Tous les messages envoyés et reçus (incl. les
                         candidatures, qui sont stockées comme des messages
                         spéciaux dans KeyMatch)
  - candidatures.json   Sous-ensemble de messages.json pour faciliter la
                         lecture — uniquement les messages type='candidature',
                         avec un champ _role qui distingue locataire/proprio
  - dossier.json        Liens vers vos pièces (CNI, fiches paie, etc.)
  - visites.json        Vos demandes de visites (locataire et proprio)
  - loyers.json         Vos loyers et quittances (locataire et proprio)
  - edls.json           Vos états des lieux (locataire et proprio)
  - annonces.json       Vos annonces publiées (si proprio)
  - notifications.json  Vos notifications cloche

Important :
-----------
Cet export contient des URLs vers des fichiers binaires (CNI, fiches paie,
photos d'EDL...). Les URLs Supabase Storage utilisées par KeyMatch peuvent
être signées et expirent au bout de quelques heures. Pour télécharger un
fichier précis, ouvrez l'URL correspondante peu après cet export.

Demande de suppression ou rectification :
-----------------------------------------
Pour exercer vos autres droits RGPD (suppression, rectification, opposition,
limitation), contactez support@keymatch-immo.fr.

Référence : Règlement (UE) 2016/679, Article 20.
`
  zip.file("README.txt", readme)

  const zipBlob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  })

  const filename = `keymatch-export-${email.replace(/[^a-z0-9]/g, "_")}-${new Date().toISOString().slice(0, 10)}.zip`

  return new NextResponse(zipBlob, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  })
}
