/**
 * V54 — Préférences notifs email granulaires.
 *
 * Source de vérité unique pour :
 * - liste des events email dispatchables
 * - défaut on/off par event
 * - mapping rôle (locataire / proprio / both) → events pertinents
 * - fallback legacy notif_*_email → notif_preferences[event]
 *
 * Utilisé par :
 * - /api/notifications/event (dispatcher V52)
 * - crons V53 (loyers-retard, candidatures-digest, visites-rappel, irl-rappel-bail)
 * - /api/notifications/new-message (V52.0)
 * - lib/bail/finalize.ts (V32.5)
 * - UI /parametres > OngletCompte (V54.3)
 */

import { supabaseAdmin } from "./supabase-server"

export type NotifEventKey =
  // Bail
  | "bail_envoye"           // proprio invite locataire à signer (bailInvitation)
  | "bail_signe_partial"    // 1 partie a signé, autre attendu
  | "bail_actif"            // double signé final (bailFinalActif)
  | "bail_refus"            // locataire refuse l'invitation
  | "bail_relance"          // relance bail (locataire ou bailleur)
  // EDL
  | "edl_a_signer"
  | "edl_conteste"
  // Avenant
  | "avenant_propose"
  | "avenant_signe"
  // Visite
  | "visite_proposee"
  | "visite_confirmee"
  | "visite_annulee"
  | "visite_rappel_j1"
  // Dossier
  | "dossier_demande"
  | "dossier_partage"
  | "dossier_revoque"
  | "candidat_orphelin"     // J+7 sans login
  // Candidature
  | "candidature_validee"
  | "candidature_refusee"
  | "candidatures_digest"
  // Loyer / Quittance
  | "loyer_paye"            // quittance reçue
  | "loyer_retard_j5"
  | "loyer_retard_j15"
  | "loyer_auto_paiement"
  // IRL / Préavis
  | "irl_proposition"
  | "preavis_donne"
  | "preavis_jalon"         // J-30 / J-15 / J-7 / J-1
  // Messages
  | "message_recu"

export type NotifCategory = "bail" | "edl" | "visite" | "dossier" | "candidature" | "loyer" | "irl_preavis" | "messages"

export type NotifEventDef = {
  key: NotifEventKey
  label: string
  description: string
  category: NotifCategory
  /** Public visible pour ce type :
   *  - "locataire" : seuls les profils locataires reçoivent ce type
   *  - "proprio"   : seuls les profils proprio
   *  - "both"      : les deux peuvent en recevoir (selon contexte)
   */
  audience: "locataire" | "proprio" | "both"
  /** Default on/off au premier accès. Les digest et nice-to-have sont OFF. */
  default: boolean
  /** Si critique, l'user ne peut pas le désactiver (signature légale, etc.) */
  required?: boolean
  /** Mapping legacy notif_*_email vers ce key (fallback si pas de notif_preferences). */
  legacyKey?: "notif_messages_email" | "notif_visites_email" | "notif_candidatures_email" | "notif_loyer_retard_email"
}

/**
 * Catalogue exhaustif des events email. Source de vérité unique pour V54.
 * Ordre = ordre d'affichage dans l'UI.
 */
export const NOTIF_EVENTS: NotifEventDef[] = [
  // Messages
  { key: "message_recu",         category: "messages",    audience: "both",      default: true,  label: "Nouveau message",                  description: "Quand un interlocuteur vous envoie un message dans la conversation.", legacyKey: "notif_messages_email" },

  // Bail
  { key: "bail_envoye",          category: "bail",        audience: "locataire", default: true,  label: "Invitation à signer un bail",      description: "Le propriétaire vous a envoyé un bail à signer." },
  { key: "bail_signe_partial",   category: "bail",        audience: "both",      default: true,  required: true, label: "Bail signé par l'autre partie", description: "Quand l'autre partie a signé et qu'il reste votre signature. Signal légal." },
  { key: "bail_actif",           category: "bail",        audience: "both",      default: true,  required: true, label: "Bail actif (double signé)",     description: "Bail définitivement signé par les 2 parties — PDF en pièce jointe. Signal légal." },
  { key: "bail_refus",           category: "bail",        audience: "proprio",   default: true,  label: "Refus d'invitation au bail",       description: "Le locataire a refusé votre invitation à signer le bail." },
  { key: "bail_relance",         category: "bail",        audience: "both",      default: true,  label: "Relance bail (J+3 / J+7)",        description: "Rappel automatique si le bail attend une signature depuis plusieurs jours." },

  // EDL
  { key: "edl_a_signer",         category: "edl",         audience: "locataire", default: true,  label: "État des lieux à signer",         description: "Le propriétaire a partagé l'EDL — à consulter et signer." },
  { key: "edl_conteste",         category: "edl",         audience: "proprio",   default: true,  label: "EDL contesté",                     description: "Le locataire a contesté l'EDL avec un motif." },

  // Avenant
  { key: "avenant_propose",      category: "bail",        audience: "both",      default: true,  label: "Avenant proposé",                  description: "Une modification du bail a été proposée par l'autre partie." },
  { key: "avenant_signe",        category: "bail",        audience: "both",      default: true,  label: "Avenant signé",                    description: "L'autre partie a signé l'avenant proposé." },

  // Visite
  { key: "visite_proposee",      category: "visite",      audience: "both",      default: true,  label: "Demande de visite",                description: "Quelqu'un vous propose des créneaux de visite.", legacyKey: "notif_visites_email" },
  { key: "visite_confirmee",     category: "visite",      audience: "both",      default: true,  label: "Visite confirmée (avec ICS)",     description: "Un créneau a été retenu — ajout au calendrier en pièce jointe." },
  { key: "visite_annulee",       category: "visite",      audience: "both",      default: true,  label: "Visite annulée",                   description: "L'autre partie a annulé une visite prévue." },
  { key: "visite_rappel_j1",     category: "visite",      audience: "both",      default: true,  label: "Rappel J-1 visite",               description: "Rappel automatique la veille d'une visite confirmée (avec ICS)." },

  // Dossier
  { key: "dossier_demande",      category: "dossier",     audience: "locataire", default: true,  label: "Demande de dossier",              description: "Le propriétaire vous demande de partager votre dossier." },
  { key: "dossier_partage",      category: "dossier",     audience: "proprio",   default: true,  label: "Dossier partagé",                  description: "Un candidat a partagé son dossier complet pour votre annonce." },
  { key: "dossier_revoque",      category: "dossier",     audience: "proprio",   default: true,  label: "Accès dossier révoqué",           description: "Un candidat a révoqué l'accès au dossier qu'il vous avait partagé." },
  { key: "candidat_orphelin",    category: "candidature", audience: "locataire", default: true,  label: "Rappel candidature en attente",   description: "Rappel à J+7 si vous n'êtes pas revenu·e après avoir candidaté." },

  // Candidature
  { key: "candidature_validee",  category: "candidature", audience: "locataire", default: true,  label: "Candidature validée",             description: "Le propriétaire a validé votre candidature — vous pouvez proposer une visite." },
  { key: "candidature_refusee",  category: "candidature", audience: "locataire", default: true,  label: "Candidature non retenue (+ recos)", description: "Le propriétaire a choisi un autre dossier — 5 annonces similaires inclus.", legacyKey: "notif_candidatures_email" },
  { key: "candidatures_digest",  category: "candidature", audience: "proprio",   default: true,  label: "Récap quotidien candidatures",    description: "1 email/jour avec toutes les candidatures reçues sur vos annonces les dernières 24h." },

  // Loyer
  { key: "loyer_paye",           category: "loyer",       audience: "locataire", default: true,  label: "Quittance reçue",                  description: "Quittance PDF générée après confirmation du paiement." },
  { key: "loyer_retard_j5",      category: "loyer",       audience: "both",      default: true,  label: "Loyer en retard (J+5)",           description: "Premier rappel après 5 jours de retard sur le loyer.", legacyKey: "notif_loyer_retard_email" },
  { key: "loyer_retard_j15",     category: "loyer",       audience: "both",      default: true,  required: true, label: "Loyer en retard formel (J+15)", description: "Rappel formel après 15 jours — recouvrement / mise en demeure. Signal légal." },
  { key: "loyer_auto_paiement",  category: "loyer",       audience: "locataire", default: false, label: "Demande virement automatique",    description: "Le propriétaire vous propose de mettre en place un virement automatique." },

  // IRL / Préavis
  { key: "irl_proposition",      category: "irl_preavis", audience: "proprio",   default: true,  label: "Proposition d'indexation IRL",    description: "Anniversaire du bail dans 30 jours — proposition de réviser le loyer (loi ALUR)." },
  { key: "preavis_donne",        category: "irl_preavis", audience: "both",      default: true,  required: true, label: "Préavis donné",                description: "L'autre partie a donné congé — date de fin du bail incluse. Signal légal." },
  { key: "preavis_jalon",        category: "irl_preavis", audience: "both",      default: true,  label: "Jalon de préavis",                description: "Rappels J-30 / J-15 / J-7 / J-1 avant fin du bail." },
]

export const NOTIF_CATEGORIES: { key: NotifCategory; label: string; description: string }[] = [
  { key: "messages",    label: "Messages",    description: "Communications directes avec votre interlocuteur." },
  { key: "candidature", label: "Candidatures", description: "Statut de vos candidatures (locataire) ou des candidatures reçues (proprio)." },
  { key: "dossier",     label: "Dossier",      description: "Partage et accès au dossier locataire." },
  { key: "visite",      label: "Visites",      description: "Demandes, confirmations, annulations, rappels." },
  { key: "bail",        label: "Bail",         description: "Invitation, signature, refus, avenants." },
  { key: "edl",         label: "État des lieux", description: "EDL d'entrée et de sortie." },
  { key: "loyer",       label: "Loyer & quittances", description: "Paiements, quittances, rappels de retard." },
  { key: "irl_preavis", label: "IRL & préavis", description: "Indexation IRL et fin de bail." },
]

/**
 * Builds the default notif_preferences map from NOTIF_EVENTS.
 */
export function defaultNotifPreferences(): Record<NotifEventKey, boolean> {
  const out: Partial<Record<NotifEventKey, boolean>> = {}
  for (const e of NOTIF_EVENTS) {
    out[e.key] = e.default
  }
  return out as Record<NotifEventKey, boolean>
}

/**
 * Returns the events that should be exposed to a profile, based on its role.
 * Locataire (is_proprietaire=false) ne voit pas les events "proprio" only.
 */
export function eventsForRole(isProprio: boolean): NotifEventDef[] {
  return NOTIF_EVENTS.filter(e => {
    if (e.audience === "both") return true
    if (e.audience === "proprio" && isProprio) return true
    if (e.audience === "locataire" && !isProprio) return true
    return false
  })
}

/**
 * Resolves whether `email` wants to receive an email for `eventKey`.
 *
 * Lookup order (fallback chain) :
 *   1. profils.notif_preferences[eventKey] si défini → use it
 *   2. legacy column (notif_*_email) si mappé → use it
 *   3. default of the event (NOTIF_EVENTS[*].default)
 *   4. true (fail open — un signal raté = pire qu'un email de trop)
 *
 * Si le profil n'existe pas du tout (user pas encore en DB), fallback true.
 *
 * Best-effort : ne fail jamais. Si Supabase rate, on retourne true (fail open).
 */
export async function shouldSendEmailForEvent(
  email: string,
  eventKey: NotifEventKey,
): Promise<boolean> {
  const def = NOTIF_EVENTS.find(e => e.key === eventKey)
  // Events critiques (signal légal) : on ne respecte pas les préférences,
  // l'user reçoit toujours.
  if (def?.required) return true

  const cols = ["notif_preferences"]
  if (def?.legacyKey) cols.push(def.legacyKey)

  try {
    const { data } = await supabaseAdmin
      .from("profils")
      .select(cols.join(", "))
      .eq("email", email.toLowerCase())
      .maybeSingle()
    if (!data) return def?.default ?? true
    const row = data as unknown as Record<string, unknown>

    // 1. notif_preferences[event]
    const prefs = row["notif_preferences"] as Record<string, unknown> | null
    if (prefs && typeof prefs === "object" && eventKey in prefs) {
      const v = prefs[eventKey]
      if (typeof v === "boolean") return v
    }

    // 2. legacy column
    if (def?.legacyKey) {
      const legacyVal = row[def.legacyKey]
      if (typeof legacyVal === "boolean") return legacyVal
    }

    // 3. default of the event
    return def?.default ?? true
  } catch (e) {
    console.warn("[notifPreferences] lookup failed for", email, eventKey, e)
    // 4. fail open
    return true
  }
}
