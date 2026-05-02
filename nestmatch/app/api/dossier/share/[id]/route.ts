import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { sendEmail } from "@/lib/email/resend"
import { dossierRevoqueTemplate } from "@/lib/email/templates"
import { displayName } from "@/lib/privacy"
import { shouldSendEmailForEvent } from "@/lib/notifPreferencesServer"

/**
 * DELETE /api/dossier/share/[id]
 * Révoque un lien de partage : `revoked_at = now()`. Le JWT reste
 * cryptographiquement valide mais la route `/dossier-partage/[token]` refusera.
 * Seul le propriétaire du lien peut le révoquer.
 *
 * V52.6 — Notifie le proprio par email que l'accès a été révoqué (pour qu'il
 * sache que le lien est mort sans avoir à cliquer dessus). Best-effort,
 * ne bloque pas la réponse.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const session = await getServerSession(authOptions)
  const email = session?.user?.email?.toLowerCase()
  if (!email) {
    return NextResponse.json({ success: false, error: "Authentification requise" }, { status: 401 })
  }
  if (!id || typeof id !== "string") {
    return NextResponse.json({ success: false, error: "ID invalide" }, { status: 400 })
  }

  // Check ownership + update atomique (une seule requête).
  // V52.6 — on récupère aussi le label pour parser le proprio destinataire.
  const { data, error } = await supabaseAdmin
    .from("dossier_share_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .eq("email_locataire", email)
    .is("revoked_at", null)
    .select("id, label")
    .maybeSingle()

  if (error) {
    if (error.code === "42P01") {
      return NextResponse.json({ success: false, error: "Fonctionnalité non disponible" }, { status: 404 })
    }
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ success: false, error: "Lien introuvable ou déjà révoqué" }, { status: 404 })
  }

  // V52.6 — best-effort email proprio. Format label = "<destinataire> — <bien titre>"
  // (voir messages/page.tsx l. 2208 : `${conv.other} — ${annonceTitre}`).
  // Si le format ne match pas (ex. label custom), on skip silencieusement.
  try {
    const label = String(data.label || "")
    const sepIdx = label.indexOf(" — ")
    if (sepIdx > 0) {
      const destEmail = label.slice(0, sepIdx).trim().toLowerCase()
      const bienTitre = label.slice(sepIdx + 3).trim() || null
      // Sanity check : le destinataire doit ressembler à un email
      if (destEmail.includes("@") && destEmail !== email) {
        // V54.2 — respect notif_preferences (dossier_revoque)
        const allowed = await shouldSendEmailForEvent(destEmail, "dossier_revoque")
        if (!allowed) return NextResponse.json({ success: true })
        const base = process.env.NEXT_PUBLIC_URL || "https://keymatch-immo.fr"
        const fromName = displayName(email, session?.user?.name || null) || "Le candidat"
        const tpl = dossierRevoqueTemplate({
          fromName,
          bienTitre,
          ville: null,
          convUrl: `${base}/messages?with=${encodeURIComponent(email)}`,
        })
        await sendEmail({
          to: destEmail,
          subject: tpl.subject,
          html: tpl.html,
          text: tpl.text,
          tags: [{ name: "category", value: "dossier_revoque" }],
          senderEmail: email,
        })
      }
    }
  } catch (e) {
    console.warn("[dossier/share/DELETE] email revoke failed:", e)
  }

  return NextResponse.json({ success: true })
}
