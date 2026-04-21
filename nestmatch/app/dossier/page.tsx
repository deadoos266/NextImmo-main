"use client"
import { useSession } from "next-auth/react"
import { useEffect, useState, useRef } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "../../lib/supabase"
import { validateDocument } from "../../lib/fileValidation"
import { useResponsive } from "../hooks/useResponsive"
import Tooltip from "../components/Tooltip"
import PhoneInput from "../components/PhoneInput"
import SharePanel from "./SharePanel"
import AccessLogPanel from "./AccessLogPanel"
import UndoToast from "../components/ui/UndoToast"
import { useUndo } from "../components/ui/useUndo"
import DocRowSkeleton from "../components/ui/DocRowSkeleton"
import { useRole } from "../providers"
import { formatNomComplet, buildMailtoModifIdentite } from "../../lib/profilHelpers"

const SITUATIONS = ["CDI", "CDD", "Intérim", "Indépendant / Freelance", "Fonctionnaire", "Alternance", "Étudiant", "Retraité", "Sans emploi"]
const TYPES_GARANT = ["Personne physique", "Organisme Visale", "Action Logement", "Caution bancaire", "Aucun garant"]
const SITUATIONS_FAMILIALES = ["Célibataire", "En couple", "Marié·e", "PACS", "Divorcé·e", "Veuf·ve"]
const LOGEMENT_TYPES = ["Locataire", "Propriétaire", "Hébergé", "Foyer / résidence", "Colocation", "Chez mes parents", "Autre"]
const NATIONALITES_COURANTES = ["Française", "Belge", "Suisse", "Européenne (UE)", "Hors UE"]

type DocKey =
  | "identite" | "bulletins" | "avis_imposition" | "contrat" | "quittances"
  | "identite_garant" | "bulletins_garant" | "avis_garant"
  | "certificat_scolarite" | "attestation_caf" | "attestation_assurance" | "attestation_employeur"

// Nombre max de fichiers par catégorie
// RIB retiré : interdit par le décret 2015-1437 (ALUR) — ne figure pas dans la
// liste limitative des pièces exigibles d'un candidat locataire.
const DOC_MAX: Record<DocKey, number> = {
  identite: 2, // recto + verso
  bulletins: 6, // extensible pour les CDI longs
  avis_imposition: 2, // année N et N-1
  contrat: 1,
  quittances: 3,
  identite_garant: 2,
  bulletins_garant: 3,
  avis_garant: 1,
  certificat_scolarite: 1,
  attestation_caf: 1,
  attestation_assurance: 1,
  attestation_employeur: 1,
}

const DOCS_REQUIS: { key: DocKey; label: string; desc: string; hint?: string }[] = [
  { key: "identite", label: "Pièce d'identité", desc: "CNI (recto + verso), passeport ou titre de séjour en cours de validité.", hint: "Masquez le numéro si vous préférez — gardez la photo et la date de naissance lisibles." },
  { key: "bulletins", label: "Bulletins de salaire", desc: "Les 3 derniers pour un CDI/CDD. Vous pouvez en ajouter jusqu'à 6 si ancienneté longue.", hint: "Attendus par les proprios pour vérifier la stabilité des revenus." },
  { key: "avis_imposition", label: "Avis d'imposition", desc: "Dernier avis (année N-1). Idéalement aussi l'année précédente si disponible.", hint: "Téléchargeable sur impots.gouv.fr → Mes documents." },
  { key: "contrat", label: "Contrat de travail", desc: "Contrat signé OU attestation employeur récente (< 3 mois).", hint: "Pour les CDD / alternance, ajoutez la date de fin de contrat." },
  { key: "quittances", label: "3 dernières quittances de loyer", desc: "Preuves que vous payez actuellement votre loyer.", hint: "Si vous êtes hébergé ou propriétaire, laissez vide et précisez-le dans votre présentation." },
]

const DOCS_OPTIONNELS: { key: DocKey; label: string; desc: string; conditionel?: string }[] = [
  { key: "attestation_employeur", label: "Attestation employeur", desc: "Attestation d'emploi récente (< 3 mois) avec date d'embauche et salaire. Fortement recommandé en plus du contrat.", conditionel: "pro_salarie" },
  { key: "certificat_scolarite", label: "Certificat de scolarité", desc: "À demander à votre établissement. Obligatoire si vous êtes étudiant ou en alternance.", conditionel: "etudiant" },
  { key: "attestation_caf", label: "Attestation CAF / APL", desc: "Si vous êtes éligible aux aides au logement. Renforce la solvabilité.", conditionel: "apl" },
  { key: "attestation_assurance", label: "Attestation d'assurance habitation", desc: "Peut être fournie après la signature du bail, mais l'avoir déjà rassure le proprio.", conditionel: "toujours" },
]

const DOCS_GARANT: { key: DocKey; label: string; desc?: string }[] = [
  { key: "identite_garant", label: "Pièce d'identité du garant", desc: "CNI ou passeport — recto + verso si CNI." },
  { key: "bulletins_garant", label: "Bulletins de salaire du garant", desc: "3 derniers bulletins." },
  { key: "avis_garant", label: "Avis d'imposition du garant", desc: "Dernier avis (année N-1)." },
]

// dossier_docs stocke { key: string[] } (tableau d'URLs par catégorie)
// Compatibilité avec l'ancien format { key: string }
function toArray(val: unknown): string[] {
  if (!val) return []
  if (Array.isArray(val)) return val as string[]
  return [val as string]
}

// ═══════════════════════════════════════════════════════════════════
// STYLES éditoriaux — centralisés pour révision visuelle simplifiée.
// Palette KM canonique (components.jsx:4-9). Zéro Fraunces : italique
// sur DM Sans uniquement (layout.tsx charge style: ['normal', 'italic']).
// ═══════════════════════════════════════════════════════════════════
const T = {
  bg: "#F7F4EF",
  ink: "#111",
  white: "#fff",
  line: "#EAE6DF",
  hairline: "#F0EAE0",
  meta: "#666",
  soft: "#8a8477",
  mutedBg: "#FAF8F3",
  success: "#16a34a",
  warning: "#ea580c",
  danger: "#dc2626",
  successBg: "#F0FDF4",
  successLine: "#bbf7d0",
  warningBg: "#FFF8F1",
} as const

const STYLES = {
  main: { minHeight: "100vh", background: T.bg, fontFamily: "'DM Sans', sans-serif", paddingBottom: 48 } as React.CSSProperties,
  container: (isMobile: boolean): React.CSSProperties => ({ maxWidth: 1240, margin: "0 auto", padding: isMobile ? "24px 16px" : "40px 40px" }),

  hero: {
    wrap: (isMobile: boolean): React.CSSProperties => ({ padding: isMobile ? "8px 0 12px" : "0 0 16px" }),
    eyebrowRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 18, flexWrap: "wrap" } as React.CSSProperties,
    eyebrow: { fontSize: 11, fontWeight: 700, letterSpacing: "2.2px", textTransform: "uppercase", color: T.meta } as React.CSSProperties,
    rule: { flex: 1, height: 1, background: T.line, maxWidth: 220, minWidth: 40 } as React.CSSProperties,
    metaRight: { fontSize: 11, color: T.soft, fontVariantNumeric: "tabular-nums" } as React.CSSProperties,
    grid: (isMobile: boolean): React.CSSProperties => ({ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1.4fr 1fr", gap: isMobile ? 28 : 40, alignItems: "end" }),
    title: (isMobile: boolean): React.CSSProperties => ({ fontSize: isMobile ? 40 : 64, fontWeight: 300, lineHeight: 0.98, letterSpacing: "-1.5px", margin: 0, color: T.ink }),
    titleAccent: { fontStyle: "italic", fontWeight: 300, color: T.meta } as React.CSSProperties,
    subtitle: { fontSize: 15, color: T.meta, lineHeight: 1.6, maxWidth: 520, marginTop: 22, marginBottom: 0 } as React.CSSProperties,
    recap: (isMobile: boolean): React.CSSProperties => ({
      marginTop: isMobile ? 20 : 28,
      paddingTop: 16,
      borderTop: `1px solid ${T.line}`,
      display: "flex",
      alignItems: "center",
      gap: 12,
      flexWrap: "wrap",
      fontSize: 13,
      color: T.meta,
    }),
    recapStrong: { color: T.ink, fontWeight: 600 } as React.CSSProperties,
    recapDot: { width: 3, height: 3, borderRadius: "50%", background: T.soft, display: "inline-block" } as React.CSSProperties,
  },

  scoreCard: {
    wrap: (isMobile: boolean): React.CSSProperties => ({
      position: "relative",
      background: T.white,
      borderRadius: 24,
      padding: isMobile ? "22px 22px" : "28px 32px",
      boxShadow: "0 1px 0 #ebe4d6, 0 30px 60px -30px rgba(0,0,0,0.10)",
    }),
    topRow: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20 } as React.CSSProperties,
    eyebrow: { fontSize: 10, fontWeight: 700, letterSpacing: "1.6px", textTransform: "uppercase", color: T.soft, marginBottom: 4 } as React.CSSProperties,
    number: { fontSize: 60, fontWeight: 300, lineHeight: 1, fontVariantNumeric: "tabular-nums", letterSpacing: "-2px" } as React.CSSProperties,
    percent: { fontSize: 28, marginLeft: 2 } as React.CSSProperties,
    label: { fontSize: 13, color: T.ink, marginTop: 6, fontWeight: 600 } as React.CSSProperties,
    divider: { marginTop: 18, paddingTop: 16, borderTop: `1px solid ${T.hairline}`, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 } as React.CSSProperties,
    alert: { marginTop: 16, padding: "10px 12px", background: T.warningBg, borderRadius: 12 } as React.CSSProperties,
    alertLabel: { fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.8px" } as React.CSSProperties,
    alertBody: { fontSize: 13, color: "#333", marginTop: 2 } as React.CSSProperties,
  },

  mini: {
    label: { fontSize: 10, fontWeight: 700, letterSpacing: "1.2px", textTransform: "uppercase", color: T.soft } as React.CSSProperties,
    value: { fontSize: 20, fontWeight: 400, color: T.ink, marginTop: 2, fontVariantNumeric: "tabular-nums", letterSpacing: "-0.3px" } as React.CSSProperties,
  },

  layout: {
    grid: (isMobile: boolean): React.CSSProperties => ({
      display: "grid",
      gridTemplateColumns: isMobile ? "1fr" : "240px 1fr 380px",
      gap: isMobile ? 20 : 32,
      alignItems: "flex-start",
      marginTop: isMobile ? 24 : 40,
    }),
    body: { display: "flex", flexDirection: "column", gap: 20, minWidth: 0 } as React.CSSProperties,
    sidebar: (isSticky: boolean): React.CSSProperties => ({ display: "flex", flexDirection: "column", gap: 16, ...(isSticky ? { position: "sticky", top: 90 } : {}) }),
  },

  summary: {
    // Sticky TOC : alignSelf flex-start + maxHeight + overflowY pour que le
    // sommaire reste visible pendant le scroll sans dépasser la fenêtre.
    // top: 24 (la Navbar est dans un MountedOnly fixed-height de 72px — on
    // aligne le sommaire à ~24px du haut de la colonne, le parent grid a
    // déjà son padding).
    wrap: {
      position: "sticky",
      top: 24,
      alignSelf: "flex-start",
      maxHeight: "calc(100vh - 48px)",
      overflowY: "auto",
    } as React.CSSProperties,
    eyebrow: { fontSize: 10, fontWeight: 700, letterSpacing: "1.8px", textTransform: "uppercase", color: T.soft, marginBottom: 14 } as React.CSSProperties,
    nav: { display: "flex", flexDirection: "column", gap: 2 } as React.CSSProperties,
    item: (active: boolean): React.CSSProperties => ({
      display: "grid",
      gridTemplateColumns: "auto 1fr auto",
      alignItems: "center",
      gap: 10,
      padding: "10px 12px",
      borderRadius: 10,
      background: active ? T.white : "transparent",
      border: active ? `1px solid ${T.line}` : "1px solid transparent",
      cursor: "pointer",
      textAlign: "left",
      fontFamily: "inherit",
    }),
    num: (active: boolean): React.CSSProperties => ({ fontSize: 13, fontStyle: "italic", color: active ? T.ink : T.soft, fontVariantNumeric: "tabular-nums", fontWeight: 400 }),
    label: (active: boolean): React.CSSProperties => ({ fontSize: 14, fontWeight: active ? 700 : 500, color: active ? T.ink : T.meta }),
    dot: (done: boolean): React.CSSProperties => ({ width: 8, height: 8, borderRadius: "50%", background: done ? T.success : T.line }),
    tip: { marginTop: 22, padding: "14px 14px", background: T.white, borderRadius: 14, border: `1px solid ${T.line}` } as React.CSSProperties,
    tipLabel: { fontSize: 11, fontWeight: 700, color: T.soft, textTransform: "uppercase", letterSpacing: "1.2px", marginBottom: 6 } as React.CSSProperties,
    tipBody: { fontSize: 12.5, color: "#333", lineHeight: 1.5 } as React.CSSProperties,
  },

  section: {
    wrap: (isMobile: boolean): React.CSSProperties => ({
      background: T.white,
      borderRadius: 24,
      padding: isMobile ? "22px 20px 24px" : "30px 32px 32px",
      boxShadow: "0 1px 0 #ebe4d6",
    }),
    head: { display: "flex", alignItems: "baseline", gap: 16, marginBottom: 4, flexWrap: "wrap" as const } as React.CSSProperties,
    num: { fontSize: 16, fontStyle: "italic", color: T.soft, fontVariantNumeric: "tabular-nums", fontWeight: 400 } as React.CSSProperties,
    kicker: { fontSize: 11, fontWeight: 700, letterSpacing: "1.8px", textTransform: "uppercase", color: T.soft } as React.CSSProperties,
    rule: { flex: 1, height: 1, background: T.hairline, minWidth: 20 } as React.CSSProperties,
    subtitle: { fontSize: 11.5, color: T.soft } as React.CSSProperties,
    h2: (isMobile: boolean): React.CSSProperties => ({ fontSize: isMobile ? 24 : 28, fontWeight: 500, margin: "0 0 22px", color: T.ink, letterSpacing: "-0.4px" }),
  },

  row2: (isMobile: boolean): React.CSSProperties => ({ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }),

  field: {
    wrap: { marginBottom: 18 } as React.CSSProperties,
    label: { display: "block", fontSize: 11, fontWeight: 700, color: T.soft, marginBottom: 8, textTransform: "uppercase", letterSpacing: "1.4px" } as React.CSSProperties,
    input: (isMobile: boolean): React.CSSProperties => ({ width: "100%", padding: "11px 14px", border: `1.5px solid ${T.line}`, borderRadius: 10, fontSize: isMobile ? 16 : 14, fontFamily: "inherit", outline: "none", boxSizing: "border-box", background: T.white, color: T.ink, fontVariantNumeric: "tabular-nums" }),
    inputDisabled: { background: T.mutedBg, color: T.soft } as React.CSSProperties,
    textarea: (isMobile: boolean): React.CSSProperties => ({ width: "100%", padding: "14px 16px", border: `1.5px solid ${T.line}`, borderRadius: 14, fontSize: isMobile ? 16 : 14.5, fontFamily: "'DM Sans', sans-serif", fontStyle: "italic", fontWeight: 400, outline: "none", resize: "vertical", boxSizing: "border-box", lineHeight: 1.55, color: "#222", background: T.mutedBg }),
  },

  chip: {
    wrap: { display: "flex", gap: 8, flexWrap: "wrap" as const } as React.CSSProperties,
    base: (active: boolean): React.CSSProperties => ({
      padding: "8px 14px",
      borderRadius: 999,
      border: "1.5px solid",
      cursor: "pointer",
      fontFamily: "inherit",
      fontSize: 13,
      fontWeight: 600,
      background: active ? T.ink : T.mutedBg,
      color: active ? T.white : "#333",
      borderColor: active ? T.ink : T.line,
      transition: "all 0.15s",
    }),
  },

  toggle: {
    wrap: (checked: boolean): React.CSSProperties => ({
      display: "flex",
      alignItems: "flex-start",
      gap: 14,
      cursor: "pointer",
      padding: "12px 14px",
      background: checked ? T.successBg : T.mutedBg,
      borderRadius: 12,
      border: `1.5px solid ${checked ? T.successLine : T.hairline}`,
      transition: "all 0.15s",
    }),
    track: (checked: boolean): React.CSSProperties => ({
      position: "relative",
      width: 36,
      height: 22,
      background: checked ? T.success : "#D9D2C4",
      borderRadius: 999,
      flexShrink: 0,
      marginTop: 1,
      transition: "background 0.2s",
    }),
    knob: (checked: boolean): React.CSSProperties => ({
      position: "absolute",
      top: 2,
      left: checked ? 16 : 2,
      width: 18,
      height: 18,
      background: T.white,
      borderRadius: "50%",
      transition: "left 0.2s",
      boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
    }),
    input: { position: "absolute", opacity: 0, width: "100%", height: "100%", cursor: "pointer", top: 0, left: 0, margin: 0 } as React.CSSProperties,
    labelText: { fontSize: 13.5, color: T.ink, fontWeight: 600 } as React.CSSProperties,
    subText: { fontSize: 11.5, color: T.soft, marginTop: 2 } as React.CSSProperties,
  },

  doc: {
    group: { marginBottom: 16 } as React.CSSProperties,
    groupHead: { display: "flex", alignItems: "center", gap: 10, marginBottom: 10 } as React.CSSProperties,
    groupTitle: { fontSize: 11, fontWeight: 700, letterSpacing: "1.4px", textTransform: "uppercase", color: T.soft } as React.CSSProperties,
    groupRule: { flex: 1, height: 1, background: T.hairline } as React.CSSProperties,
    grid: (isMobile: boolean): React.CSSProperties => ({ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }),
    card: (done: boolean, drag: boolean): React.CSSProperties => ({
      padding: 14,
      borderRadius: 14,
      background: drag ? "#eff6ff" : done ? T.successBg : T.mutedBg,
      border: `1.5px solid ${drag ? T.ink : done ? T.successLine : T.line}`,
      outline: drag ? `1.5px dashed ${T.ink}` : "none",
      outlineOffset: drag ? -4 : 0,
      display: "flex",
      flexDirection: "column",
      gap: 8,
      transition: "background 0.12s, border-color 0.12s",
    }),
    cardHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 } as React.CSSProperties,
    cardLabel: { fontSize: 13, fontWeight: 700, color: T.ink } as React.CSSProperties,
    cardDesc: { fontSize: 11.5, color: T.meta, lineHeight: 1.4, marginTop: 2 } as React.CSSProperties,
    cardHint: { fontSize: 10.5, color: T.soft, lineHeight: 1.4, marginTop: 3, fontStyle: "italic" } as React.CSSProperties,
    statusBadge: (done: boolean): React.CSSProperties => ({
      width: 28,
      height: 28,
      borderRadius: "50%",
      background: done ? T.success : T.white,
      color: done ? T.white : T.soft,
      border: done ? "none" : `1.5px solid ${T.line}`,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
      fontSize: 14,
      fontWeight: 700,
    }),
    fileChipsWrap: { display: "flex", flexDirection: "column", gap: 4 } as React.CSSProperties,
    fileChip: (confirming: boolean): React.CSSProperties => ({
      display: "flex",
      alignItems: "center",
      gap: 8,
      background: confirming ? "#fee2e2" : "#dcfce7",
      borderRadius: 8,
      padding: "5px 10px",
      border: confirming ? "1px solid #fca5a5" : "1px solid transparent",
      transition: "all 0.15s",
    }),
    fileLink: (confirming: boolean): React.CSSProperties => ({
      fontSize: 12,
      fontWeight: 600,
      color: confirming ? "#991b1b" : "#166534",
      textDecoration: "none",
      flex: 1,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    }),
    cardFoot: { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto", paddingTop: 4 } as React.CSSProperties,
    countText: { fontSize: 11, color: T.soft, fontVariantNumeric: "tabular-nums" } as React.CSSProperties,
    addBtn: (disabled: boolean): React.CSSProperties => ({
      fontSize: 11.5,
      fontWeight: 700,
      color: T.ink,
      background: "transparent",
      border: "none",
      cursor: disabled ? "not-allowed" : "pointer",
      fontFamily: "inherit",
      textDecoration: "underline",
      padding: 0,
      opacity: disabled ? 0.5 : 1,
    }),
    removeBtn: { fontSize: 11, fontWeight: 700, color: T.danger, background: "none", border: "none", cursor: "pointer", padding: "0 4px", fontFamily: "inherit" } as React.CSSProperties,
    confirmBtn: { fontSize: 11, fontWeight: 700, color: T.white, background: T.danger, border: "none", borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontFamily: "inherit" } as React.CSSProperties,
    cancelBtn: { fontSize: 11, fontWeight: 600, color: T.ink, background: T.white, border: `1px solid ${T.line}`, borderRadius: 6, padding: "3px 10px", cursor: "pointer", fontFamily: "inherit" } as React.CSSProperties,
  },

  docsPanel: {
    wrap: (isMobile: boolean): React.CSSProperties => ({ background: T.white, borderRadius: 20, padding: isMobile ? 20 : 24 }),
    head: { display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 } as React.CSSProperties,
    title: { fontSize: 20, fontWeight: 500, margin: 0, color: T.ink, letterSpacing: "-0.3px" } as React.CSSProperties,
    count: (color: string): React.CSSProperties => ({ fontSize: 12, fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }),
    hint: { fontSize: 12, color: T.meta, marginBottom: 16, marginTop: 4, lineHeight: 1.5 } as React.CSSProperties,
  },

  saveBtn: (state: "idle" | "saving" | "saved"): React.CSSProperties => ({
    background: state === "saving" ? "#9ca3af" : state === "saved" ? T.success : T.ink,
    color: T.white,
    border: "none",
    borderRadius: 999,
    padding: "16px 0",
    fontWeight: 700,
    fontSize: 15,
    cursor: state === "saving" ? "not-allowed" : "pointer",
    fontFamily: "inherit",
    transition: "background 0.2s",
    letterSpacing: 0.2,
  }),

  errorBanner: { background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 12, padding: "12px 16px", marginBottom: 20, display: "flex", justifyContent: "space-between", alignItems: "center" } as React.CSSProperties,

  download: {
    wrap: (isMobile: boolean): React.CSSProperties => ({ background: T.ink, color: T.white, borderRadius: 20, padding: isMobile ? 20 : 22, position: "relative", overflow: "hidden" }),
    ghostWord: { position: "absolute", top: -14, right: -10, fontSize: 96, fontStyle: "italic", fontWeight: 300, color: "rgba(255,255,255,0.06)", lineHeight: 1, letterSpacing: "-3px", pointerEvents: "none" } as React.CSSProperties,
    eyebrow: { fontSize: 10, fontWeight: 700, letterSpacing: "1.8px", textTransform: "uppercase", color: "rgba(255,255,255,0.6)", marginBottom: 4, position: "relative" } as React.CSSProperties,
    title: { fontSize: 22, fontWeight: 500, margin: "0 0 10px", color: T.white, letterSpacing: "-0.4px", position: "relative" } as React.CSSProperties,
    titleAccent: { fontStyle: "italic", fontWeight: 400, color: "rgba(255,255,255,0.85)" } as React.CSSProperties,
    desc: { fontSize: 12.5, color: "rgba(255,255,255,0.7)", lineHeight: 1.55, margin: "0 0 14px", position: "relative" } as React.CSSProperties,
    btnPrimary: (disabled: boolean): React.CSSProperties => ({
      width: "100%",
      background: disabled ? "#6b7280" : T.white,
      color: T.ink,
      border: "none",
      borderRadius: 999,
      padding: "12px 18px",
      fontWeight: 800,
      fontSize: 13,
      cursor: disabled ? "wait" : "pointer",
      fontFamily: "inherit",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      position: "relative",
    }),
    btnSecondary: (disabled: boolean): React.CSSProperties => ({
      width: "100%",
      background: "transparent",
      color: T.white,
      border: "1px solid rgba(255,255,255,0.25)",
      borderRadius: 999,
      padding: "10px 18px",
      fontWeight: 700,
      fontSize: 12,
      cursor: disabled ? "wait" : "pointer",
      fontFamily: "inherit",
      marginTop: 8,
      position: "relative",
    }),
  },
} as const

// ═══════════════════════════════════════════════════════════════════
// Helpers éditoriaux — tous extraits HORS de Dossier() pour préserver
// le focus des inputs (CLAUDE.md : helpers inline dans un composant React
// recréent les refs à chaque render → perte de focus sur chaque frappe).
// ═══════════════════════════════════════════════════════════════════

function ScoreRing({ value, color }: { value: number; color: string }) {
  const R = 36
  const C = 2 * Math.PI * R
  const dash = (value / 100) * C
  return (
    <svg width="88" height="88" viewBox="0 0 88 88" aria-hidden>
      <circle cx="44" cy="44" r={R} fill="none" stroke={T.hairline} strokeWidth="6" />
      <circle
        cx="44" cy="44" r={R} fill="none"
        stroke={color} strokeWidth="6" strokeLinecap="round"
        strokeDasharray={`${dash} ${C - dash}`}
        transform="rotate(-90 44 44)"
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
    </svg>
  )
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={STYLES.mini.label}>{label}</div>
      <div style={STYLES.mini.value}>{value}</div>
    </div>
  )
}

function Section({
  id, num, kicker, title, subtitle, isMobile, children,
}: {
  id: string
  num: string
  kicker: string
  title: string
  subtitle?: string
  isMobile: boolean
  children: React.ReactNode
}) {
  return (
    <section id={`sec-${id}`} className="print-section" style={STYLES.section.wrap(isMobile)}>
      <div style={STYLES.section.head}>
        <span style={STYLES.section.num}>{num}</span>
        <span style={STYLES.section.kicker}>{kicker}</span>
        <span style={STYLES.section.rule} />
        {subtitle && <span style={STYLES.section.subtitle}>{subtitle}</span>}
      </div>
      <h2 style={STYLES.section.h2(isMobile)}>{title}</h2>
      {children}
    </section>
  )
}

function Row2({ isMobile, children }: { isMobile: boolean; children: React.ReactNode }) {
  return <div style={STYLES.row2(isMobile)}>{children}</div>
}

function Field({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={STYLES.field.wrap}>
      <label style={STYLES.field.label}>{label}</label>
      {children}
    </div>
  )
}

function TextInput({
  value, onChange, type = "text", placeholder, disabled, isMobile, min, max,
}: {
  value: string | number
  onChange?: (v: string) => void
  type?: string
  placeholder?: string
  disabled?: boolean
  isMobile: boolean
  min?: number
  max?: number
}) {
  return (
    <input
      type={type}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      min={min}
      max={max}
      onChange={e => onChange && onChange(e.target.value)}
      style={{ ...STYLES.field.input(isMobile), ...(disabled ? STYLES.field.inputDisabled : {}) }}
    />
  )
}

// Input en lecture seule pour les champs verrouillés (prenom/nom après
// /onboarding/identite). Cadenas SVG inline dans le champ, fond grisé.
function LockedInput({ value }: { value: string }) {
  return (
    <div style={{ position: "relative" }}>
      <input
        type="text"
        value={value}
        readOnly
        aria-readonly="true"
        style={{
          width: "100%",
          padding: "11px 40px 11px 14px",
          background: T.mutedBg,
          border: `1.5px solid ${T.line}`,
          borderRadius: 10,
          fontSize: 15,
          color: T.ink,
          fontFamily: "inherit",
          boxSizing: "border-box",
          cursor: "not-allowed",
        }}
      />
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke={T.soft}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }}
        aria-hidden
      >
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0110 0v4" />
      </svg>
    </div>
  )
}

// Badge cadenas cliquable (mailto) à côté du label d'un champ verrouillé.
function LockBadge({ mailto }: { mailto: string }) {
  return (
    <a
      href={mailto}
      title="Champ verrouillé — cliquez pour demander une modification au support avec justificatif"
      aria-label="Champ verrouillé — contacter le support pour modifier"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        marginLeft: 8,
        padding: "2px 8px",
        background: T.mutedBg,
        border: `1px solid ${T.line}`,
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.8px",
        color: T.soft,
        textTransform: "uppercase",
        textDecoration: "none",
        verticalAlign: "middle",
      }}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0110 0v4" />
      </svg>
      Verrouillé
    </a>
  )
}

function SelectField({
  value, options, onChange, isMobile, emptyLabel = "— Sélectionner —",
}: {
  value: string
  options: readonly string[]
  onChange: (v: string) => void
  isMobile: boolean
  emptyLabel?: string
}) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)} style={STYLES.field.input(isMobile)}>
      <option value="">{emptyLabel}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function ChipGroup({
  value, options, onChange,
}: {
  value: string
  options: readonly string[]
  onChange: (v: string) => void
}) {
  return (
    <div style={STYLES.chip.wrap}>
      {options.map(o => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          style={STYLES.chip.base(value === o)}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

function Toggle({
  label, sub, checked, onChange,
}: {
  label: string
  sub?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label style={STYLES.toggle.wrap(checked)}>
      <div style={STYLES.toggle.track(checked)}>
        <input
          type="checkbox"
          checked={checked}
          onChange={e => onChange(e.target.checked)}
          style={STYLES.toggle.input}
        />
        <span style={STYLES.toggle.knob(checked)} />
      </div>
      <div>
        <div style={STYLES.toggle.labelText}>{label}</div>
        {sub && <div style={STYLES.toggle.subText}>{sub}</div>}
      </div>
    </label>
  )
}

// ─── DocCard (ex-DocRow, sorti du composant parent) ─────────────────
// Conserve 100% de la logique : drag&drop, upload, remove avec confirm,
// outline dashed #111, count {uploaded}/{max}, chips par fichier.
type DocCardSharedProps = {
  docs: Record<string, string[]>
  uploading: DocKey | null
  dragKey: DocKey | null
  setDragKey: (k: DocKey | null) => void
  removeTarget: { key: DocKey; idx: number } | null
  setRemoveTarget: (v: { key: DocKey; idx: number } | null) => void
  uploadDoc: (k: DocKey, f: FileList) => void
  removeDoc: (k: DocKey, i: number) => void
  fileRefs: React.MutableRefObject<Record<string, HTMLInputElement | null>>
  isMobile: boolean
}

function DocCard({
  docKey, label, desc, hint, shared,
}: {
  docKey: DocKey
  label: string
  desc?: string
  hint?: string
  shared: DocCardSharedProps
}) {
  const { docs, uploading, dragKey, setDragKey, removeTarget, setRemoveTarget, uploadDoc, removeDoc, fileRefs } = shared
  const uploaded = docs[docKey] || []
  const max = DOC_MAX[docKey]
  const isUploading = uploading === docKey
  const canAdd = uploaded.length < max
  const isDragActive = dragKey === docKey
  const done = uploaded.length > 0

  return (
    <div
      onDragOver={e => { if (canAdd) { e.preventDefault(); setDragKey(docKey) } }}
      onDragLeave={() => { if (dragKey === docKey) setDragKey(null) }}
      onDrop={e => {
        e.preventDefault()
        setDragKey(null)
        if (!canAdd) return
        if (e.dataTransfer.files?.length) uploadDoc(docKey, e.dataTransfer.files)
      }}
      style={STYLES.doc.card(done, isDragActive)}
    >
      <div style={STYLES.doc.cardHead}>
        <div style={{ minWidth: 0 }}>
          <div style={STYLES.doc.cardLabel}>{label}</div>
          {desc && <div style={STYLES.doc.cardDesc}>{desc}</div>}
          {hint && <div style={STYLES.doc.cardHint}>{hint}</div>}
        </div>
        <div style={STYLES.doc.statusBadge(done)}>{done ? "✓" : "+"}</div>
      </div>

      {uploaded.length > 0 && (
        <div style={STYLES.doc.fileChipsWrap}>
          {uploaded.map((url, i) => {
            const confirming = removeTarget?.key === docKey && removeTarget?.idx === i
            return (
              <div key={i} style={STYLES.doc.fileChip(confirming)}>
                <a href={url} target="_blank" rel="noopener" style={STYLES.doc.fileLink(confirming)}>
                  Fichier {i + 1}
                </a>
                {confirming ? (
                  <>
                    <button type="button" onClick={() => { removeDoc(docKey, i); setRemoveTarget(null) }} style={STYLES.doc.confirmBtn}>
                      Confirmer
                    </button>
                    <button type="button" onClick={() => setRemoveTarget(null)} style={STYLES.doc.cancelBtn}>
                      Annuler
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => setRemoveTarget({ key: docKey, idx: i })} title="Supprimer ce fichier" style={STYLES.doc.removeBtn}>
                    ✕
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div style={STYLES.doc.cardFoot}>
        <span style={STYLES.doc.countText}>{uploaded.length}/{max}</span>
        {canAdd && (
          <>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png"
              multiple={max > 1}
              style={{ display: "none" }}
              ref={el => { fileRefs.current[docKey] = el }}
              onChange={e => { if (e.target.files?.length) uploadDoc(docKey, e.target.files); e.target.value = "" }}
            />
            <button
              type="button"
              onClick={() => fileRefs.current[docKey]?.click()}
              disabled={isUploading}
              title="Ajouter ou glisser-déposer un fichier ici"
              style={STYLES.doc.addBtn(isUploading)}
            >
              {isUploading ? "Upload…" : done ? `+ ajouter (${uploaded.length}/${max})` : "déposer"}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function DocGroup({
  title, items, shared,
}: {
  title: string
  items: { key: DocKey; label: string; desc?: string; hint?: string }[]
  shared: DocCardSharedProps
}) {
  return (
    <div style={STYLES.doc.group}>
      <div style={STYLES.doc.groupHead}>
        <span style={STYLES.doc.groupTitle}>{title}</span>
        <span style={STYLES.doc.groupRule} />
      </div>
      <div style={STYLES.doc.grid(shared.isMobile)}>
        {items.map(d => (
          <DocCard key={d.key} docKey={d.key} label={d.label} desc={d.desc} hint={d.hint} shared={shared} />
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// Composant principal
// ═══════════════════════════════════════════════════════════════════

export default function Dossier() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { proprietaireActive } = useRole()

  // Garde rôle : le dossier est LOCATAIRE-only. Un proprio qui y arrive
  // (via historique navigateur, lien partagé…) est redirigé sans bruit.
  useEffect(() => {
    if (proprietaireActive) router.replace("/proprietaire")
  }, [proprietaireActive, router])

  const [profil, setProfil] = useState<{ ville_souhaitee?: string; budget_max?: number | null } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState<DocKey | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [docs, setDocs] = useState<Record<string, string[]>>({})
  const { isMobile } = useResponsive()
  const [generatingPDF, setGeneratingPDF] = useState(false)
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const [form, setForm] = useState({
    // Identité
    prenom: "", nom: "", telephone: "",
    identite_verrouillee: false,
    date_naissance: "",
    nationalite: "",
    situation_familiale: "",
    nb_enfants: 0,
    // Pro
    situation_pro: "",
    employeur_nom: "",
    date_embauche: "",
    revenus_mensuels: "",
    // Famille / logement
    nb_occupants: 1,
    logement_actuel_type: "",
    logement_actuel_ville: "",
    a_apl: false,
    mobilite_pro: false,
    // Garant
    garant: false, type_garant: "",
    // Présentation
    presentation: "",
  })
  const [removeTarget, setRemoveTarget] = useState<{ key: DocKey; idx: number } | null>(null)
  const [dragKey, setDragKey] = useState<DocKey | null>(null)
  // Backup pour restaurer si l'user clique "Annuler" dans le toast undo.
  const [docsBackup, setDocsBackup] = useState<Record<string, string[]> | null>(null)
  const [undoLabel, setUndoLabel] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<string>("identite")

  // Date "Mis à jour X" : calculée post-mount pour éviter tout mismatch SSR/CSR
  // (new Date() dans le render retourne une valeur différente à chaque appel).
  const [dateGeneration, setDateGeneration] = useState("")
  useEffect(() => {
    setDateGeneration(new Date().toLocaleDateString("fr-FR", { day: "numeric", month: "long" }))
  }, [])

  const {
    pending: pendingDocs,
    trigger: triggerRemoveDoc,
    undo: cancelRemoveDoc,
  } = useUndo<Record<string, string[]>>({
    onConfirm: async (updated) => {
      if (!session?.user?.email) return
      // Timer expiré : on persiste vraiment la suppression en DB.
      await supabase
        .from("profils")
        .upsert({ email: session.user.email.toLowerCase(), dossier_docs: updated }, { onConflict: "email" })
      setDocsBackup(null)
      setUndoLabel(null)
    },
  })

  function handleUndoRemoveDoc() {
    cancelRemoveDoc()
    if (docsBackup) setDocs(docsBackup)
    setDocsBackup(null)
    setUndoLabel(null)
  }

  useEffect(() => {
    if (status === "unauthenticated") { router.push("/auth"); return }
    if (session?.user?.email) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, status])

  async function load() {
    const email = session!.user!.email!.toLowerCase()
    const { data } = await supabase.from("profils").select("*").eq("email", email).single()
    if (data) {
      setProfil(data)
      setForm({
        prenom: data.prenom || "",
        nom: data.nom || "",
        identite_verrouillee: data.identite_verrouillee === true,
        telephone: data.telephone || "",
        date_naissance: data.date_naissance || "",
        nationalite: data.nationalite || "",
        situation_familiale: data.situation_familiale || "",
        nb_enfants: data.nb_enfants ?? 0,
        situation_pro: data.situation_pro || "",
        employeur_nom: data.employeur_nom || "",
        date_embauche: data.date_embauche || "",
        revenus_mensuels: data.revenus_mensuels || "",
        nb_occupants: data.nb_occupants || 1,
        logement_actuel_type: data.logement_actuel_type || "",
        logement_actuel_ville: data.logement_actuel_ville || "",
        a_apl: !!data.a_apl,
        mobilite_pro: !!data.mobilite_pro,
        garant: data.garant || false,
        type_garant: data.type_garant || "",
        presentation: data.presentation || "",
      })
      if (data.dossier_docs) {
        // Convertir l'ancien format string → string[]
        const normalized: Record<string, string[]> = {}
        Object.entries(data.dossier_docs).forEach(([k, v]) => { normalized[k] = toArray(v) })
        setDocs(normalized)
      }
    }
    setLoading(false)
  }

  async function uploadDoc(key: DocKey, files: FileList) {
    if (!session?.user?.email) return
    setUploading(key)
    setUploadError(null)
    const existing = docs[key] || []
    const max = DOC_MAX[key]
    const remaining = max - existing.length
    const toUpload = Array.from(files).slice(0, remaining)

    const newUrls: string[] = []
    for (const file of toUpload) {
      const check = await validateDocument(file)
      if (!check.ok) {
        setUploadError(check.error)
        continue
      }
      const ext = file.name.split(".").pop()
      const path = `${session.user.email}/${key}_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`
      const { error } = await supabase.storage.from("dossiers").upload(path, file, { upsert: false })
      if (error) {
        setUploadError("L'envoi du fichier a échoué, veuillez réessayer.")
        break
      }
      const { data: urlData } = supabase.storage.from("dossiers").getPublicUrl(path)
      newUrls.push(urlData.publicUrl)
    }

    if (newUrls.length > 0) {
      const updated = { ...docs, [key]: [...existing, ...newUrls] }
      setDocs(updated)
      await supabase.from("profils").upsert({ email: session.user.email, dossier_docs: updated }, { onConflict: "email" })
    }
    setUploading(null)
  }

  async function removeDoc(key: DocKey, idx: number) {
    if (!session?.user?.email) return
    // Snapshot l'état courant pour pouvoir restaurer via undo.
    // Si un undo est déjà pending, on garde le backup d'origine (l'user peut
    // enchaîner plusieurs suppressions et annuler la dernière).
    setDocsBackup(prev => prev ?? docs)
    const updated = { ...docs, [key]: (docs[key] || []).filter((_, i) => i !== idx) }
    if (updated[key].length === 0) delete updated[key]
    setDocs(updated)
    setUndoLabel("Document supprimé")
    // Commit DB différé 5 sec : laisse le temps d'annuler.
    triggerRemoveDoc(updated)
  }

  async function sauvegarder() {
    if (!session?.user?.email) return
    setSaving(true)
    setUploadError(null)
    // Lowercase l'email : clé primaire de profils, évite les doublons
    // si la session retourne une casse différente de la ligne DB.
    const email = session.user.email.toLowerCase()
    const { error } = await supabase.from("profils").upsert({
      email,
      telephone: form.telephone, situation_pro: form.situation_pro,
      revenus_mensuels: form.revenus_mensuels ? Number(form.revenus_mensuels) : null,
      garant: form.garant, type_garant: form.type_garant, nb_occupants: form.nb_occupants,
      date_naissance: form.date_naissance || null,
      nationalite: form.nationalite || null,
      situation_familiale: form.situation_familiale || null,
      nb_enfants: form.nb_enfants,
      employeur_nom: form.employeur_nom || null,
      date_embauche: form.date_embauche || null,
      logement_actuel_type: form.logement_actuel_type || null,
      logement_actuel_ville: form.logement_actuel_ville || null,
      a_apl: form.a_apl,
      mobilite_pro: form.mobilite_pro,
      presentation: form.presentation ? form.presentation.slice(0, 500) : null,
    }, { onConflict: "email" })
    setSaving(false)
    if (error) {
      const code = (error as { code?: string }).code
      const msg = error.message || ""
      if (code === "42703" || /column.*(presentation|date_naissance|nationalite|situation_familiale|employeur_nom|date_embauche|logement_actuel|a_apl|mobilite_pro|nb_enfants)/i.test(msg)) {
        setUploadError("Enregistrement partiel : certaines colonnes n'existent pas en base. La migration 007 doit être appliquée puis forcer un reload schema (NOTIFY pgrst, 'reload schema').")
      } else if (code === "23502" || /null value.*not-null/i.test(msg)) {
        setUploadError("Contrainte NOT NULL violée. Appliquez la migration 009 (drop NOT NULL sur nom, telephone…).")
      } else {
        setUploadError(`Enregistrement impossible : ${msg}`)
      }
      return
    }
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  function buildDossierData() {
    return {
      nom: formatNomComplet({ prenom: form.prenom, nom: form.nom }),
      email: session?.user?.email || "",
      telephone: form.telephone,
      dateNaissance: form.date_naissance,
      nationalite: form.nationalite,
      situationFamiliale: form.situation_familiale,
      nbEnfants: form.nb_enfants,
      situationPro: form.situation_pro,
      employeurNom: form.employeur_nom,
      dateEmbauche: form.date_embauche,
      revenusMensuels: form.revenus_mensuels ? Number(form.revenus_mensuels) : null,
      nbOccupants: form.nb_occupants,
      logementActuelType: form.logement_actuel_type,
      logementActuelVille: form.logement_actuel_ville,
      aApl: form.a_apl,
      mobilitePro: form.mobilite_pro,
      garant: form.garant,
      typeGarant: form.type_garant,
      presentation: form.presentation,
      villeSouhaitee: profil?.ville_souhaitee || "",
      budgetMax: profil?.budget_max ?? null,
      score,
      docs: allDocs.map(d => ({ key: d.key, label: d.label, count: (docs[d.key] || []).length })),
    }
  }

  // Télécharge UNIQUEMENT le PDF récap (léger, rapide, pour envoyer par mail).
  async function genererDossierPDFClick() {
    setGeneratingPDF(true)
    try {
      const { genererDossierPDF } = await import("../../lib/dossierPDF")
      await genererDossierPDF(buildDossierData())
    } catch (e) {
      alert("Erreur génération PDF : " + (e instanceof Error ? e.message : "inconnue"))
    }
    setGeneratingPDF(false)
  }

  // Télécharge le dossier COMPLET : PDF récap + toutes les pièces justificatives,
  // regroupées en ZIP avec une arborescence claire par catégorie.
  async function telechargerDossierZip() {
    setGeneratingPDF(true)
    try {
      const [{ genererDossierPDFBlob }, { default: JSZip }] = await Promise.all([
        import("../../lib/dossierPDF"),
        import("jszip"),
      ])
      const zip = new JSZip()
      const safeName = (formatNomComplet({ prenom: form.prenom, nom: form.nom }) || "locataire").replace(/[^a-zA-Z0-9-_]+/g, "_").slice(0, 40) || "locataire"
      const rootFolder = zip.folder(`dossier_${safeName}`)
      if (!rootFolder) throw new Error("Impossible de créer le dossier zip")

      // 1. PDF récap en blob
      const pdfBlob = await genererDossierPDFBlob(buildDossierData())
      rootFolder.file(`recapitulatif_${safeName}.pdf`, pdfBlob)

      // 2. Pour chaque catégorie de doc, fetch chaque URL et l'ajoute au zip
      //    dans un sous-dossier par label lisible. Les échecs individuels
      //    n'interrompent pas : on ajoute une entrée MANQUANT_* pour tracer.
      const labelOf: Record<string, string> = {}
      for (const d of [...DOCS_REQUIS, ...DOCS_OPTIONNELS, ...DOCS_GARANT]) {
        labelOf[d.key] = d.label
      }
      const toFolderName = (lbl: string) => lbl
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 50)

      const failed: string[] = []
      const tasks: Promise<void>[] = []
      for (const key of Object.keys(docs)) {
        const urls = docs[key] || []
        if (urls.length === 0) continue
        const categoryFolder = rootFolder.folder(toFolderName(labelOf[key] || key))
        if (!categoryFolder) continue
        urls.forEach((url, i) => {
          tasks.push((async () => {
            try {
              const res = await fetch(url)
              if (!res.ok) throw new Error(`HTTP ${res.status}`)
              const blob = await res.blob()
              const cleanPath = url.split("?")[0]
              const ext = (cleanPath.split(".").pop() || "bin").slice(0, 6).toLowerCase()
              categoryFolder.file(`fichier_${String(i + 1).padStart(2, "0")}.${ext}`, blob)
            } catch {
              failed.push(`${labelOf[key] || key} — fichier ${i + 1}`)
            }
          })())
        })
      }
      await Promise.all(tasks)

      if (failed.length > 0) {
        rootFolder.file(
          "FICHIERS_MANQUANTS.txt",
          `Certains fichiers n'ont pas pu être téléchargés :\n\n${failed.join("\n")}\n\nRéessayez depuis votre compte — ils restent accessibles en ligne.`
        )
      }

      const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } })
      const link = document.createElement("a")
      link.href = URL.createObjectURL(blob)
      link.download = `dossier_${safeName}.zip`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(link.href)

      if (failed.length > 0) {
        alert(`Dossier téléchargé.\n\n${failed.length} fichier(s) n'ont pas pu être récupérés — voir FICHIERS_MANQUANTS.txt dans le zip.`)
      }
    } catch (e) {
      alert("Erreur téléchargement : " + (e instanceof Error ? e.message : "inconnue"))
    }
    setGeneratingPDF(false)
  }

  // Les docs optionnels recommandés selon situation sont pris en compte dans la
  // complétude dès qu'ils sont pertinents (étudiant → certificat, APL → attestation).
  const docsOptionnelsPertinents = DOCS_OPTIONNELS.filter(d => {
    if (d.conditionel === "etudiant") return form.situation_pro === "Étudiant" || form.situation_pro === "Alternance"
    if (d.conditionel === "apl") return form.a_apl
    if (d.conditionel === "pro_salarie") return ["CDI", "CDD", "Intérim", "Fonctionnaire", "Alternance"].includes(form.situation_pro)
    if (d.conditionel === "toujours") return false // "assurance" toujours visible mais non comptée comme obligatoire
    return false
  })
  const allDocs = [...DOCS_REQUIS, ...docsOptionnelsPertinents, ...(form.garant ? DOCS_GARANT : [])]
  // Compte le nombre de catégories avec au moins 1 fichier
  const docsCount = allDocs.filter(d => (docs[d.key] || []).length > 0).length
  // scoreInfo ne compte QUE les champs légalement exigibles (décret 2015-1437).
  // Les champs facultatifs (date de naissance, nationalité, situation familiale,
  // nb enfants) ne peuvent pas être utilisés pour sélectionner un locataire —
  // les exclure du score évite de pénaliser un candidat conforme à la loi.
  const champs = [
    !!(form.prenom || form.nom), !!form.telephone, !!form.situation_pro, !!form.revenus_mensuels,
    form.garant !== undefined, !!profil?.ville_souhaitee, !!profil?.budget_max,
    !!form.logement_actuel_type,
  ]
  const scoreInfo = Math.round((champs.filter(Boolean).length / champs.length) * 100)
  const scoreDoc = allDocs.length > 0 ? Math.round((docsCount / allDocs.length) * 100) : 0
  const score = Math.round((scoreInfo + scoreDoc) / 2)
  const scoreColor = score >= 80 ? T.success : score >= 50 ? T.warning : T.danger
  const scoreLabel = score >= 80 ? "Excellent" : score >= 50 ? "Bon, quelques pièces à compléter" : "Dossier à compléter"
  const missingDocs = allDocs.filter(d => (docs[d.key] || []).length === 0)

  // Décide quels documents optionnels afficher selon le profil courant.
  const docsOptionnelsVisibles = DOCS_OPTIONNELS.filter(d => {
    if (d.conditionel === "etudiant") return form.situation_pro === "Étudiant" || form.situation_pro === "Alternance"
    if (d.conditionel === "apl") return form.a_apl
    if (d.conditionel === "pro_salarie") return ["CDI", "CDD", "Intérim", "Fonctionnaire", "Alternance"].includes(form.situation_pro)
    if (d.conditionel === "toujours") return true
    return false
  })

  if (status === "loading" || loading) return (
    <main style={STYLES.main}>
      <div style={STYLES.container(isMobile)} aria-busy="true">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[1, 2, 3, 4, 5, 6].map(i => <DocRowSkeleton key={i} />)}
        </div>
      </div>
    </main>
  )

  // Shared props pour DocCard (évite de répéter 8 props par appel).
  const docCardShared: DocCardSharedProps = {
    docs, uploading, dragKey, setDragKey, removeTarget, setRemoveTarget,
    uploadDoc, removeDoc, fileRefs, isMobile,
  }

  // Sommaire numéroté — état "done" dérivé du form / docs courants.
  const summaryItems: { id: string; num: string; label: string; done: boolean }[] = [
    { id: "identite", num: "01", label: "Identité", done: !!(form.prenom || form.nom) && !!form.telephone },
    { id: "pro", num: "02", label: "Situation pro", done: !!form.situation_pro && !!form.revenus_mensuels },
    { id: "logement", num: "03", label: "Logement actuel", done: !!form.logement_actuel_type },
    { id: "garant", num: "04", label: "Garant", done: !form.garant || !!form.type_garant },
    { id: "presentation", num: "05", label: "Présentation", done: form.presentation.length > 40 },
    { id: "documents", num: "06", label: "Pièces jointes", done: docsCount === allDocs.length && allDocs.length > 0 },
  ]

  function scrollToSection(id: string) {
    setActiveSection(id)
    if (typeof document !== "undefined") {
      document.getElementById(`sec-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  const missingLabels = missingDocs.slice(0, 2).map(d => d.label).join(", ") + (missingDocs.length > 2 ? ` +${missingDocs.length - 2}` : "")

  return (
    <>
      <style>{`@media print { nav, .no-print { display: none !important; } body { background: white !important; } .print-section { page-break-inside: avoid; } }`}</style>

      {pendingDocs !== null && undoLabel && (
        <UndoToast message={undoLabel} onUndo={handleUndoRemoveDoc} />
      )}

      <main style={STYLES.main}>
        <div style={STYLES.container(isMobile)}>

          {/* ══════════ HERO ÉDITORIAL ══════════ */}
          <section style={STYLES.hero.wrap(isMobile)}>
            <div style={STYLES.hero.eyebrowRow}>
              <span style={STYLES.hero.eyebrow}>Dossier locataire</span>
              <span style={STYLES.hero.rule} />
              <span style={STYLES.hero.metaRight} suppressHydrationWarning>
                Mis à jour {dateGeneration || "—"}
              </span>
            </div>

            <div style={STYLES.hero.grid(isMobile)}>
              <div>
                <h1 style={STYLES.hero.title(isMobile)}>
                  Votre dossier,<br />
                  <span style={STYLES.hero.titleAccent}>prêt à candidater.</span>
                </h1>
                <p style={STYLES.hero.subtitle}>
                  Un dossier bien tenu, c&apos;est jusqu&apos;à quatre fois plus de réponses. Complétez ce qui manque, déposez vos justificatifs, puis partagez en un lien sécurisé valable 7 jours.
                  <Tooltip text="Votre dossier réunit tous les justificatifs demandés par les propriétaires (identité, revenus, garant). Il est partagé uniquement avec les propriétaires que vous contactez, à votre initiative." />
                </p>
              </div>

              {/* Score Card */}
              <div style={STYLES.scoreCard.wrap(isMobile)}>
                <div style={STYLES.scoreCard.topRow}>
                  <div>
                    <div style={STYLES.scoreCard.eyebrow}>Complétude</div>
                    <div style={{ ...STYLES.scoreCard.number, color: scoreColor }}>
                      {score}<span style={STYLES.scoreCard.percent}>%</span>
                    </div>
                    <div style={STYLES.scoreCard.label}>{scoreLabel}</div>
                  </div>
                  <ScoreRing value={score} color={scoreColor} />
                </div>
                <div style={STYLES.scoreCard.divider}>
                  <Mini label="Infos" value={`${scoreInfo}%`} />
                  <Mini label="Pièces" value={`${docsCount}/${allDocs.length}`} />
                </div>
                {missingDocs.length > 0 && (
                  <div style={{ ...STYLES.scoreCard.alert, borderLeft: `3px solid ${scoreColor}` }}>
                    <div style={{ ...STYLES.scoreCard.alertLabel, color: scoreColor }}>Il manque</div>
                    <div style={STYLES.scoreCard.alertBody}>{missingLabels}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Récap hairline (remplace le bandeau dark du bundle) */}
            {(form.prenom || form.nom || form.situation_pro || form.revenus_mensuels) && (
              <div style={STYLES.hero.recap(isMobile)}>
                {(form.prenom || form.nom) && <span style={STYLES.hero.recapStrong}>{formatNomComplet({ prenom: form.prenom, nom: form.nom })}</span>}
                {form.situation_pro && (
                  <>
                    <span style={STYLES.hero.recapDot} aria-hidden />
                    <span>{form.situation_pro}{form.employeur_nom ? ` · ${form.employeur_nom}` : ""}</span>
                  </>
                )}
                {form.revenus_mensuels && (
                  <>
                    <span style={STYLES.hero.recapDot} aria-hidden />
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>
                      {Number(form.revenus_mensuels).toLocaleString("fr-FR")} €/mois nets
                    </span>
                  </>
                )}
                {form.logement_actuel_ville && (
                  <>
                    <span style={STYLES.hero.recapDot} aria-hidden />
                    <span>{form.logement_actuel_ville}</span>
                  </>
                )}
              </div>
            )}
          </section>

          {uploadError && (
            <div style={STYLES.errorBanner}>
              <p style={{ fontSize: 13, color: T.danger, fontWeight: 600, margin: 0 }}>{uploadError}</p>
              <button
                type="button"
                aria-label="Fermer le message d'erreur"
                onClick={() => setUploadError(null)}
                style={{ background: "none", border: "none", cursor: "pointer", color: T.danger, fontSize: 18, fontWeight: 700 }}
              >
                ×
              </button>
            </div>
          )}

          {/* ══════════ GRID 3 COLONNES ══════════ */}
          <div style={STYLES.layout.grid(isMobile)}>

            {/* Sommaire sticky (desktop only) */}
            {!isMobile && (
              <aside style={STYLES.summary.wrap} className="no-print">
                <div style={STYLES.summary.eyebrow}>Sommaire</div>
                <nav style={STYLES.summary.nav}>
                  {summaryItems.map(item => {
                    const active = activeSection === item.id
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => scrollToSection(item.id)}
                        style={STYLES.summary.item(active)}
                      >
                        <span style={STYLES.summary.num(active)}>{item.num}</span>
                        <span style={STYLES.summary.label(active)}>{item.label}</span>
                        <span style={STYLES.summary.dot(item.done)} aria-hidden />
                      </button>
                    )
                  })}
                </nav>
                <div style={STYLES.summary.tip}>
                  <div style={STYLES.summary.tipLabel}>Astuce</div>
                  <div style={STYLES.summary.tipBody}>
                    Les bulletins sur 3 mois et un garant Visale suffisent pour la plupart des propriétaires en Île-de-France.
                  </div>
                </div>
              </aside>
            )}

            {/* Corps — sections éditoriales numérotées */}
            <div style={STYLES.layout.body}>

              {/* ─── 01 Identité ─── */}
              <Section id="identite" num="01" kicker="Qui êtes-vous" title="Identité" isMobile={isMobile}>
                {/* Bannière transparence ALUR — décret 2015-1437 + article 22-2
                    loi 89-462. Les champs marqués "facultatif" ci-dessous ne
                    peuvent pas être exigés pour l'attribution d'un logement. */}
                <div style={{ background: T.mutedBg, border: `1px solid ${T.line}`, borderLeft: `3px solid ${T.ink}`, borderRadius: 12, padding: "14px 16px", marginBottom: 22 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "1.4px", textTransform: "uppercase", color: T.soft, marginBottom: 4 }}>Vos droits</div>
                  <p style={{ fontSize: 13, color: "#333", lineHeight: 1.55, margin: 0, fontStyle: "italic" }}>
                    Aucune pièce non listée par le décret n° 2015-1437 ne peut vous être exigée. Les champs marqués « facultatif » sont à votre discrétion — loi ALUR (2014-366) et article 22-2 de la loi du 6 juillet 1989 (89-462).
                  </p>
                </div>
                <Row2 isMobile={isMobile}>
                  <Field label={<>Prénom <LockBadge mailto={buildMailtoModifIdentite(session?.user?.email || "", form.prenom, form.nom)} /></>}>
                    <LockedInput value={form.prenom} />
                  </Field>
                  <Field label={<>Nom de famille <LockBadge mailto={buildMailtoModifIdentite(session?.user?.email || "", form.prenom, form.nom)} /></>}>
                    <LockedInput value={form.nom} />
                  </Field>
                </Row2>
                <Field label="Téléphone">
                  <PhoneInput value={form.telephone} onChange={v => setForm(f => ({ ...f, telephone: v }))} placeholder="6 12 34 56 78" />
                </Field>
                <Field label="Email">
                  <TextInput value={session?.user?.email || ""} disabled isMobile={isMobile} />
                </Field>
                <Row2 isMobile={isMobile}>
                  <Field label={<>Date de naissance <span style={{ fontWeight: 400, color: T.soft, textTransform: "none", letterSpacing: 0 }}>(facultatif)</span></>}>
                    <TextInput type="date" value={form.date_naissance} onChange={v => setForm(f => ({ ...f, date_naissance: v }))} isMobile={isMobile} />
                  </Field>
                  <Field label={<>Nationalité <span style={{ fontWeight: 400, color: T.soft, textTransform: "none", letterSpacing: 0 }}>(facultatif)</span></>}>
                    <SelectField value={form.nationalite} options={NATIONALITES_COURANTES} onChange={v => setForm(f => ({ ...f, nationalite: v }))} isMobile={isMobile} />
                  </Field>
                </Row2>
                <Field label={<>Situation familiale <span style={{ fontWeight: 400, color: T.soft, textTransform: "none", letterSpacing: 0 }}>(facultatif)</span></>}>
                  <ChipGroup value={form.situation_familiale} options={SITUATIONS_FAMILIALES} onChange={v => setForm(f => ({ ...f, situation_familiale: v }))} />
                </Field>
                <Row2 isMobile={isMobile}>
                  <Field label={<>Nombre d&apos;enfants à charge <span style={{ fontWeight: 400, color: T.soft, textTransform: "none", letterSpacing: 0 }}>(facultatif)</span></>}>
                    <TextInput type="number" min={0} max={15} value={form.nb_enfants} onChange={v => setForm(f => ({ ...f, nb_enfants: Math.max(0, Math.min(15, Number(v) || 0)) }))} isMobile={isMobile} />
                  </Field>
                  <Field label="Nombre d'occupants">
                    <TextInput type="number" min={1} max={10} value={form.nb_occupants} onChange={v => setForm(f => ({ ...f, nb_occupants: Number(v) || 1 }))} isMobile={isMobile} />
                  </Field>
                </Row2>
              </Section>

              {/* ─── 02 Situation pro ─── */}
              <Section id="pro" num="02" kicker="Ce que vous faites" title="Situation professionnelle" isMobile={isMobile}>
                <Field label="Statut">
                  <ChipGroup value={form.situation_pro} options={SITUATIONS} onChange={v => setForm(f => ({ ...f, situation_pro: v }))} />
                </Field>
                <Row2 isMobile={isMobile}>
                  <Field label={<>Revenus mensuels nets (€) <Tooltip text="Vos revenus nets après impôts et cotisations. La règle courante : les propriétaires attendent un revenu d'environ 3 fois le loyer. Ex : pour un loyer de 800 €, visez au moins 2400 € de revenus nets mensuels." /></>}>
                    <TextInput type="number" value={form.revenus_mensuels} onChange={v => setForm(f => ({ ...f, revenus_mensuels: v }))} placeholder="2 500" isMobile={isMobile} />
                  </Field>
                  <Field label="Loyer max recommandé">
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", background: T.mutedBg, borderRadius: 10, fontSize: 14, fontWeight: 600, color: T.ink, border: `1.5px solid ${T.line}`, boxSizing: "border-box" }}>
                      <span style={{ fontSize: 18, fontWeight: 400, color: T.success, fontVariantNumeric: "tabular-nums" }}>
                        {Math.round((Number(form.revenus_mensuels) || 0) / 3).toLocaleString("fr-FR")} €
                      </span>
                      <span style={{ fontSize: 11, color: T.soft }}>pour {form.nb_occupants} occupant{form.nb_occupants > 1 ? "s" : ""}</span>
                    </div>
                  </Field>
                </Row2>
                {/* Employeur + date embauche : uniquement pour les situations salariées */}
                {["CDI", "CDD", "Intérim", "Fonctionnaire", "Alternance"].includes(form.situation_pro) && (
                  <Row2 isMobile={isMobile}>
                    <Field label="Employeur">
                      <TextInput value={form.employeur_nom} onChange={v => setForm(f => ({ ...f, employeur_nom: v }))} placeholder="Nom de votre employeur" isMobile={isMobile} />
                    </Field>
                    <Field label={<>Date d&apos;embauche <Tooltip text="L'ancienneté rassure les propriétaires. Un CDI de plus de 12 mois est un signal très positif." /></>}>
                      <TextInput type="date" value={form.date_embauche} onChange={v => setForm(f => ({ ...f, date_embauche: v }))} isMobile={isMobile} />
                    </Field>
                  </Row2>
                )}
              </Section>

              {/* ─── 03 Logement actuel ─── */}
              <Section id="logement" num="03" kicker="D'où vous venez" title="Logement actuel" isMobile={isMobile}>
                <Field label="Statut">
                  <ChipGroup value={form.logement_actuel_type} options={LOGEMENT_TYPES} onChange={v => setForm(f => ({ ...f, logement_actuel_type: v }))} />
                </Field>
                <Field label="Ville actuelle">
                  <TextInput value={form.logement_actuel_ville} onChange={v => setForm(f => ({ ...f, logement_actuel_ville: v }))} placeholder="Ex : Paris" isMobile={isMobile} />
                </Field>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
                  <Toggle
                    label="Je bénéficie des APL"
                    sub="Aide personnalisée au logement — renforce votre solvabilité"
                    checked={form.a_apl}
                    onChange={v => setForm(f => ({ ...f, a_apl: v }))}
                  />
                  <Toggle
                    label="Mobilité professionnelle"
                    sub="Je déménage pour raison pro — éligible à la garantie Visale gratuite d'Action Logement"
                    checked={form.mobilite_pro}
                    onChange={v => setForm(f => ({ ...f, mobilite_pro: v }))}
                  />
                  <p style={{ fontSize: 12, color: T.soft, margin: "4px 2px 0", lineHeight: 1.5 }}>
                    Ces informations sont facultatives (article 22-2 de la loi du 6 juillet 1989).
                  </p>
                </div>
              </Section>

              {/* ─── 04 Garant ─── */}
              <Section id="garant" num="04" kicker="Votre filet de sécurité" title="Garant" isMobile={isMobile}>
                <Field label={<>Avez-vous un garant ? <Tooltip text="Un garant est une personne ou un organisme qui s'engage à payer votre loyer si vous ne pouvez plus le faire. Avoir un garant rassure le propriétaire et multiplie vos chances d'obtenir un logement." /></>}>
                  <div style={{ display: "flex", gap: 10 }}>
                    {[{ val: true, label: "Oui" }, { val: false, label: "Non" }].map(opt => (
                      <button
                        key={String(opt.val)}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, garant: opt.val }))}
                        style={{
                          padding: "10px 22px",
                          borderRadius: 999,
                          border: "1.5px solid",
                          cursor: "pointer",
                          fontFamily: "inherit",
                          fontSize: 14,
                          fontWeight: 600,
                          background: form.garant === opt.val ? T.ink : T.white,
                          color: form.garant === opt.val ? T.white : T.ink,
                          borderColor: form.garant === opt.val ? T.ink : T.line,
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </Field>
                {form.garant && (
                  <Field label={<>Type de garant <Tooltip text="Personnel : un proche (parent, etc.) se porte caution sur ses revenus. Organisme Visale : garantie gratuite d'Action Logement (si éligible), très appréciée des proprios. Caution bancaire : somme bloquée en banque équivalente à plusieurs loyers." /></>}>
                    <ChipGroup value={form.type_garant} options={TYPES_GARANT} onChange={v => setForm(f => ({ ...f, type_garant: v }))} />
                  </Field>
                )}
              </Section>

              {/* ─── 05 Présentation ─── */}
              <Section id="presentation" num="05" kicker="Votre voix" title="Présentation" isMobile={isMobile}>
                <p style={{ fontSize: 13.5, color: T.meta, lineHeight: 1.6, marginTop: -14, marginBottom: 14 }}>
                  Quelques lignes pour vous présenter au propriétaire — <span style={{ fontStyle: "italic" }}>facultatif mais très apprécié</span>. Votre projet, votre contexte, ce qui vous rend crédible. Pensez à cliquer sur « Sauvegarder mon dossier » en bas pour conserver vos modifications.
                </p>
                <textarea
                  value={form.presentation}
                  onChange={e => setForm(f => ({ ...f, presentation: e.target.value.slice(0, 500) }))}
                  placeholder="Ex : Bonjour, je suis ingénieur en CDI depuis 3 ans. Je cherche un logement proche de mon nouveau bureau à partir du 1er septembre. Très soigneux, non fumeur, sans animaux."
                  rows={5}
                  style={STYLES.field.textarea(isMobile)}
                />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: T.soft }}>Votre ton · lu en 10 secondes · maximum 500 caractères</span>
                  <span style={{ fontSize: 11, color: form.presentation.length > 480 ? T.warning : T.soft, fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                    {form.presentation.length}/500
                  </span>
                </div>
              </Section>

              {/* ─── 06 Pièces jointes ─── */}
              <Section
                id="documents"
                num="06"
                kicker="Les preuves"
                title="Pièces jointes"
                subtitle={`${docsCount} sur ${allDocs.length} catégories · PDF, JPG ou PNG`}
                isMobile={isMobile}
              >
                <DocGroup title="Requis" items={DOCS_REQUIS} shared={docCardShared} />
                {docsOptionnelsVisibles.length > 0 && (
                  <DocGroup title="Recommandé selon votre situation" items={docsOptionnelsVisibles} shared={docCardShared} />
                )}
                {form.garant && (
                  <DocGroup title="Documents du garant" items={DOCS_GARANT} shared={docCardShared} />
                )}
              </Section>

              <button
                type="button"
                onClick={sauvegarder}
                disabled={saving}
                className="no-print"
                style={STYLES.saveBtn(saving ? "saving" : saved ? "saved" : "idle")}
              >
                {saving ? "Sauvegarde…" : saved ? "Dossier sauvegardé ✓" : "Sauvegarder mon dossier"}
              </button>
            </div>

            {/* Sidebar droite — partage + accès + download */}
            <aside style={STYLES.layout.sidebar(!isMobile)} className="no-print">
              <SharePanel />
              <AccessLogPanel />
              {/* DownloadCard */}
              <div style={STYLES.download.wrap(isMobile)}>
                <span style={STYLES.download.ghostWord} aria-hidden>ZIP</span>
                <div style={STYLES.download.eyebrow}>Export complet</div>
                <h3 style={STYLES.download.title}>
                  Tout votre dossier,<br />
                  <span style={STYLES.download.titleAccent}>en un fichier.</span>
                </h3>
                <p style={STYLES.download.desc}>
                  Récapitulatif PDF + toutes vos pièces classées par catégorie.
                </p>
                <button
                  type="button"
                  onClick={telechargerDossierZip}
                  disabled={generatingPDF}
                  style={STYLES.download.btnPrimary(generatingPDF)}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  {generatingPDF ? "Préparation…" : "Télécharger (ZIP)"}
                </button>
                <button
                  type="button"
                  onClick={genererDossierPDFClick}
                  disabled={generatingPDF}
                  style={STYLES.download.btnSecondary(generatingPDF)}
                >
                  Récap PDF seul
                </button>
              </div>
            </aside>
          </div>
        </div>
      </main>
    </>
  )
}
