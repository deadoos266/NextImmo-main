"use client"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect, useRef, useState } from "react"
import { supabase } from "../../../lib/supabase"
import { useRole } from "../../providers"
import { postNotif } from "../../../lib/notificationsClient"
import { calculerCompletudeProfil } from "../../../lib/profilCompleteness"
import GatedAction from "../../components/ui/GatedAction"

export default function ContactButton({ annonce }: { annonce: any }) {
  const { data: session } = useSession()
  const { role } = useRole()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [draft, setDraft] = useState("")
  const [err, setErr] = useState<string | null>(null)
  // Verrou synchrone : protege contre les double-clics rapides (React
  // setState est asynchrone, donc setLoading(true) ne bloque pas le 2e clic
  // immediatement — le ref si)
  const inFlight = useRef(false)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)

  // Complétude dossier — gate la candidature si < 30% pour éviter
  // les contacts vides côté proprio (le candidat doit avoir au moins
  // les bases : ville/budget/revenus). Gating soft : popup explicatif
  // + CTA /dossier, pas un blocage radical.
  const [profilCompletude, setProfilCompletude] = useState<number | null>(null)
  useEffect(() => {
    if (!session?.user?.email) { setProfilCompletude(null); return }
    let cancelled = false
    void supabase.from("profils")
      .select("ville_souhaitee, budget_max, revenus_mensuels, surface_min, type_garant, type_quartier")
      .eq("email", session.user.email)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        const { score } = calculerCompletudeProfil(data || null)
        setProfilCompletude(score)
      })
    return () => { cancelled = true }
  }, [session?.user?.email])

  const isOwnAnnonce = session?.user?.email === annonce.proprietaire_email

  // Focus textarea à l'ouverture de la modale + fermeture sur Esc
  useEffect(() => {
    if (!showModal) return
    const t = setTimeout(() => textareaRef.current?.focus(), 40)
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setShowModal(false) }
    window.addEventListener("keydown", onKey)
    return () => { clearTimeout(t); window.removeEventListener("keydown", onKey) }
  }, [showModal])

  // Propriétaire sur sa propre annonce → bouton de gestion (Paul 2026-04-27 :
  // bug fix — avant on checkait `role === "proprietaire" && isOwnAnnonce` ce
  // qui ratait le cas user toggle en mode locataire mais owner de l'annonce).
  // Maintenant le check isOwnAnnonce passe en PRIORITE quel que soit le role.
  if (isOwnAnnonce) {
    return (
      <a href="/proprietaire"
        style={{ display: "block", width: "100%", background: "#111", color: "white", border: "none", borderRadius: 999, padding: "14px 0", fontWeight: 700, fontSize: 15, textAlign: "center", textDecoration: "none", marginBottom: 10, boxSizing: "border-box" }}>
        Gerer mon annonce &rarr;
      </a>
    )
  }

  // Propriétaire (mode actif) sur l'annonce d'un autre → rien
  if (role === "proprietaire") return null

  function openModal() {
    if (!session) { router.push("/auth"); return }
    if (!annonce.proprietaire_email) return
    setErr(null)
    setDraft("")
    setShowModal(true)
  }

  async function envoyer() {
    if (inFlight.current) return
    const toEmail = annonce.proprietaire_email
    if (!toEmail || !session) return
    const contenu = draft.trim()
    if (contenu.length < 2) { setErr("Écrivez un message avant d'envoyer."); return }
    if (contenu.length > 2000) { setErr("Message trop long (2000 caractères max)."); return }

    inFlight.current = true
    setLoading(true)
    setErr(null)
    try {
      const fromEmail = session.user!.email!
      const me = fromEmail.toLowerCase()
      const other = toEmail.toLowerCase()

      // Dedupe : si une conversation existe déjà pour CETTE annonce,
      // on ajoute quand même le nouveau message personnalisé (c'est un
      // vrai message de relance, pas un doublon du message auto d'origine).
      // Scope : (from=me, to=other, annonce) ∪ (from=other, to=me, annonce)
      const [sent, received] = await Promise.all([
        supabase.from("messages").select("id")
          .eq("from_email", me).eq("to_email", other).eq("annonce_id", annonce.id).limit(1),
        supabase.from("messages").select("id")
          .eq("from_email", other).eq("to_email", me).eq("annonce_id", annonce.id).limit(1),
      ])
      const hasConversation = (sent.data && sent.data.length > 0) || (received.data && received.data.length > 0)

      const { error: insErr } = await supabase.from("messages").insert([{
        from_email: me,
        to_email: other,
        contenu,
        lu: false,
        annonce_id: annonce.id,
        // `type: "candidature"` uniquement sur le tout premier message pour
        // que le proprio voie la conv apparaître dans l'onglet "Candidatures".
        type: hasConversation ? undefined : "candidature",
        created_at: new Date().toISOString(),
      }])
      if (insErr) { setErr("Envoi échoué : " + insErr.message); return }

      if (!hasConversation) {
        void postNotif({
          userEmail: other,
          type: "message",
          title: "Nouvelle candidature",
          body: `Un locataire est intéressé par « ${annonce.titre} »`,
          href: "/messages",
          relatedId: String(annonce.id),
        })
      }

      router.push(`/messages?with=${encodeURIComponent(other)}`)
    } finally {
      setLoading(false)
      // On garde inFlight a true pendant la navigation : le composant va
      // probablement unmount, mais si navigation annulee on remet a false
      setTimeout(() => { inFlight.current = false }, 2000)
    }
  }

  // Gating : si le user est connecté ET dossier < 30%, on grise le bouton.
  // Si pas connecté, openModal() redirige vers /auth (pas de gating ici).
  // Si profilCompletude = null (encore en chargement), on autorise le clic
  // pour ne pas bloquer pendant le fetch (UX > rigueur).
  const dossierIncomplet = !!session && profilCompletude !== null && profilCompletude < 30

  const button = (
    <button onClick={openModal}
      style={{ display: "block", width: "100%", background: "#111", color: "white", border: "none", borderRadius: 999, padding: "14px 0", fontWeight: 700, fontSize: 15, cursor: "pointer", marginBottom: 10, textAlign: "center", fontFamily: "inherit" }}>
      Contacter le propriétaire
    </button>
  )

  return (
    <>
      {/* V21.2 (Paul 2026-04-29) — wrapper width 100% block-centered. Sans
          ce wrapper, GatedAction (en mode disabled) utilise inline-flex
          width auto, et le bouton width:100% du child shrink à sa largeur
          naturelle → bouton off-center dans la sticky card. */}
      <div style={{ width: "100%", display: "block" }}>
      {dossierIncomplet ? (
        <GatedAction
          enabled={false}
          block
          disabledReason={{
            // V36.5 — Tone moins anxiogène. V40.3 — clarifie : on mesure le
            // PROFIL locataire (ville, budget, revenus, garant) via
            // calculerCompletudeProfil, pas les documents (CNI/fiches paie).
            // L'ancien wording "dossier" était inexact — c'est l'espace
            // locataire (`/profil`) qu'il faut compléter pour pouvoir
            // contacter, pas téléverser des PDFs.
            title: "Encore une étape avant d'envoyer",
            body: "Ton profil locataire (ville, budget, revenus, type de garant…) aide les propriétaires à te connaître. Complète-le rapidement pour augmenter tes chances d'être retenu — pas de spam, tu choisis qui contacter.",
            cta: { label: "Compléter mon profil", href: "/profil" },
          }}
        >
          {button}
        </GatedAction>
      ) : button}
      </div>

      {showModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="contact-modal-title"
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}
          style={{ position: "fixed", inset: 0, background: "rgba(17,17,17,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16, fontFamily: "'DM Sans', sans-serif" }}
        >
          <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@1,9..144,500&display=swap');`}</style>
          <div style={{ background: "#fff", border: "1px solid #EAE6DF", borderRadius: 20, boxShadow: "0 10px 40px rgba(0,0,0,0.15)", width: "100%", maxWidth: 520, padding: 28, boxSizing: "border-box" }}>
            <p style={{ fontSize: 10, fontWeight: 700, color: "#8a8477", textTransform: "uppercase", letterSpacing: "1.4px", margin: "0 0 10px" }}>Nouveau message</p>
            <h2 id="contact-modal-title" style={{ fontFamily: "'Fraunces', Georgia, serif", fontStyle: "italic", fontWeight: 500, fontSize: 26, letterSpacing: "-0.3px", color: "#111", margin: "0 0 6px" }}>
              Contacter le propriétaire
            </h2>
            <p style={{ fontSize: 13, color: "#8a8477", margin: "0 0 18px", lineHeight: 1.55 }}>
              Présentez-vous et expliquez votre projet. Un message sincère et précis reçoit bien plus de réponses.
            </p>

            <label htmlFor="contact-msg" style={{ fontSize: 11, fontWeight: 700, color: "#111", textTransform: "uppercase", letterSpacing: "0.4px", display: "block", marginBottom: 8 }}>Votre message</label>
            <textarea
              id="contact-msg"
              ref={textareaRef}
              value={draft}
              onChange={e => { setDraft(e.target.value); if (err) setErr(null) }}
              placeholder={`Bonjour, je suis intéressé(e) par « ${annonce.titre} » à ${annonce.ville}. Je travaille comme… et recherche un logement pour…`}
              rows={7}
              maxLength={2000}
              style={{ width: "100%", boxSizing: "border-box", border: "1px solid #EAE6DF", background: "#fff", borderRadius: 14, padding: "12px 14px", fontSize: 14, color: "#111", fontFamily: "inherit", lineHeight: 1.55, resize: "vertical", outline: "none" }}
            />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
              <span style={{ fontSize: 11, color: "#8a8477" }}>{draft.length}/2000</span>
              {err && <span style={{ fontSize: 12, color: "#b91c1c", fontWeight: 600 }}>{err}</span>}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: 20 }}>
              <button type="button" onClick={() => setShowModal(false)} disabled={loading}
                style={{ background: "#F7F4EF", border: "1px solid #EAE6DF", color: "#111", borderRadius: 999, padding: "10px 18px", fontSize: 12, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                Annuler
              </button>
              <button type="button" onClick={envoyer} disabled={loading || draft.trim().length < 2}
                style={{ background: loading || draft.trim().length < 2 ? "#8a8477" : "#111", color: "#fff", border: "none", borderRadius: 999, padding: "10px 22px", fontSize: 12, fontWeight: 700, cursor: loading || draft.trim().length < 2 ? "not-allowed" : "pointer", fontFamily: "inherit", textTransform: "uppercase", letterSpacing: "0.3px" }}>
                {loading ? "Envoi…" : "Envoyer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
