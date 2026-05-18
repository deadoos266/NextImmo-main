/**
 * V97.39.34 — /agence/inscription — Page de création compte agence
 *
 * Form simple en 1 page : saisie infos + upload carte T → POST API.
 * Inscription pending → admin valide → email confirmation.
 */

import InscriptionClient from "./InscriptionClient"

export const metadata = {
  title: "Inscription agence — KeyMatch",
  description: "Inscrivez votre agence immobilière sur KeyMatch. Validation manuelle de la carte professionnelle T.",
  robots: { index: false, follow: true },
}

export default function InscriptionAgencePage() {
  return <InscriptionClient />
}
