/**
 * Calcule le score de complétude d'un profil locataire (0–100).
 * Partagé entre /profil, /dossier et /annonces pour cohérence.
 */
export function calculerCompletudeProfil(profil: any): { score: number; manquants: string[] } {
  if (!profil) return { score: 0, manquants: ["Profil à créer"] }

  const criteres = [
    { label: "Ville souhaitée",    ok: !!profil.ville_souhaitee,    poids: 20 },
    { label: "Budget maximum",     ok: !!profil.budget_max,         poids: 20 },
    { label: "Revenus mensuels",   ok: !!profil.revenus_mensuels,   poids: 20 },
    { label: "Surface minimum",    ok: !!profil.surface_min,        poids: 15 },
    { label: "Type de garant",     ok: !!profil.type_garant,        poids: 15 },
    { label: "Type de quartier",   ok: !!profil.type_quartier,      poids: 10 },
  ]

  const score = criteres.reduce((acc, c) => acc + (c.ok ? c.poids : 0), 0)
  const manquants = criteres.filter(c => !c.ok).map(c => c.label)
  return { score, manquants }
}
