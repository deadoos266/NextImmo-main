/**
 * V97.39.34 — POST /api/agences/inscription
 *
 * Inscrit une nouvelle agence sur KeyMatch. Workflow :
 *   1. User loggué soumet le formulaire avec : nom, SIRET, carte T numéro,
 *      adresse, email, téléphone, fichier carte T (PDF/image), bio.
 *   2. On valide format SIRET + carte T.
 *   3. On upload le doc carte T dans bucket `agences-docs` (privé).
 *   4. On crée la row agences (statut='pending') + agence_membres (role=owner).
 *   5. Un admin doit valider depuis /admin/agences avant que l'agence puisse
 *      publier des annonces.
 *
 * Auth : session NextAuth REQUISE (user connecté qui crée son agence).
 */

import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { supabaseAdmin } from "@/lib/supabase-server"
import { upload } from "@/lib/storage"
import { isValidSiret, isValidCarteT, generateSlug } from "@/lib/agences/types"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const MAX_DOC_SIZE = 10 * 1024 * 1024  // 10 MB
const ALLOWED_DOC_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"]

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: "Connexion requise" }, { status: 401 })
  }
  const email = session.user.email.toLowerCase()

  const formData = await req.formData()

  // Champs texte
  const name = String(formData.get("name") || "").trim()
  const raisonSociale = String(formData.get("raison_sociale") || "").trim()
  const siret = String(formData.get("siret") || "").replace(/\s/g, "")
  const carteT = String(formData.get("carte_t_numero") || "").trim()
  const adresse = String(formData.get("adresse") || "").trim()
  const codePostal = String(formData.get("code_postal") || "").trim() || null
  const ville = String(formData.get("ville") || "").trim() || null
  const telephone = String(formData.get("telephone") || "").trim() || null
  const emailContact = String(formData.get("email") || "").trim().toLowerCase()
  const bio = String(formData.get("bio") || "").trim().substring(0, 500) || null
  const carteTFile = formData.get("carte_t_doc") as File | null

  // Validations
  if (!name || name.length < 3) {
    return NextResponse.json({ ok: false, error: "Nom commercial requis (3+ caractères)" }, { status: 400 })
  }
  if (!raisonSociale || raisonSociale.length < 3) {
    return NextResponse.json({ ok: false, error: "Raison sociale requise" }, { status: 400 })
  }
  if (!isValidSiret(siret)) {
    return NextResponse.json({ ok: false, error: "SIRET invalide (14 chiffres attendus)" }, { status: 400 })
  }
  if (!isValidCarteT(carteT)) {
    return NextResponse.json({
      ok: false,
      error: "Numéro de carte professionnelle T invalide (format CPI suivi de 12-16 chiffres)",
    }, { status: 400 })
  }
  if (!adresse || adresse.length < 5) {
    return NextResponse.json({ ok: false, error: "Adresse requise" }, { status: 400 })
  }
  if (!emailContact || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailContact)) {
    return NextResponse.json({ ok: false, error: "Email contact invalide" }, { status: 400 })
  }
  if (!carteTFile || !(carteTFile instanceof File)) {
    return NextResponse.json({ ok: false, error: "Fichier carte professionnelle T requis" }, { status: 400 })
  }
  if (carteTFile.size > MAX_DOC_SIZE) {
    return NextResponse.json({ ok: false, error: "Fichier trop volumineux (max 10 MB)" }, { status: 400 })
  }
  if (!ALLOWED_DOC_TYPES.includes(carteTFile.type)) {
    return NextResponse.json({
      ok: false,
      error: `Type de fichier non autorisé. Accepté : ${ALLOWED_DOC_TYPES.join(", ")}`,
    }, { status: 400 })
  }

  // Génère slug unique
  let slug = generateSlug(name)
  if (!slug || slug.length < 3) {
    return NextResponse.json({ ok: false, error: "Nom commercial ne peut pas être converti en URL" }, { status: 400 })
  }

  // Check unicité slug + SIRET
  const { data: existing } = await supabaseAdmin
    .from("agences")
    .select("id, slug, siret")
    .or(`slug.eq.${slug},siret.eq.${siret}`)
    .limit(5)

  if (existing && existing.length > 0) {
    const siretConflict = existing.find(a => a.siret === siret)
    if (siretConflict) {
      return NextResponse.json({
        ok: false,
        error: "Une agence avec ce SIRET est déjà inscrite. Si c'est la vôtre, contactez contact@keymatch-immo.fr",
      }, { status: 409 })
    }
    // Slug collision : append suffix numérique
    for (let i = 2; i < 100; i++) {
      const candidate = `${slug}-${i}`
      if (!existing.some(a => a.slug === candidate)) {
        slug = candidate
        break
      }
    }
  }

  // Upload carte T dans bucket privé agences-docs
  const ext = carteTFile.name.split(".").pop()?.toLowerCase() || "pdf"
  const docPath = `${slug}/carte-t-${Date.now()}.${ext}`
  const buffer = Buffer.from(await carteTFile.arrayBuffer())
  const uploadRes = await upload("agences-docs", docPath, buffer, {
    contentType: carteTFile.type,
    upsert: false,
  })
  if (!uploadRes.ok) {
    return NextResponse.json({
      ok: false,
      error: `Upload échoué : ${uploadRes.error}`,
    }, { status: 500 })
  }

  // Crée la row agence (statut=pending)
  const { data: created, error: insErr } = await supabaseAdmin
    .from("agences")
    .insert({
      slug,
      name,
      raison_sociale: raisonSociale,
      siret,
      carte_t_numero: carteT,
      carte_t_doc_path: docPath,
      adresse,
      code_postal: codePostal,
      ville,
      telephone,
      email: emailContact,
      bio,
      statut: "pending",
    })
    .select("id, slug")
    .single()

  if (insErr || !created) {
    return NextResponse.json({
      ok: false,
      error: `Création agence échouée : ${insErr?.message || "Unknown"}`,
    }, { status: 500 })
  }

  // Le créateur devient owner
  await supabaseAdmin
    .from("agence_membres")
    .insert({
      agence_id: created.id,
      user_email: email,
      role: "owner",
      invited_at: new Date().toISOString(),
      joined_at: new Date().toISOString(),
    })

  return NextResponse.json({
    ok: true,
    agence_id: created.id,
    slug: created.slug,
    message: "Votre agence a bien été enregistrée. Elle est en attente de validation par l'équipe KeyMatch. Vous recevrez un email quand votre carte T sera vérifiée.",
  })
}
