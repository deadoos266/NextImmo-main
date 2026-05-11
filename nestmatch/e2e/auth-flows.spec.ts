/**
 * V82.3 — E2E auth flows skeleton (à compléter avec fixtures NextAuth).
 *
 * Ces flows critiques métier nécessitent une session authentifiée :
 *  - Candidature locataire → message → dossier → visite proposée
 *  - Proprio valide candidature → accepte visite → génère bail → signe
 *  - EDL entrée → EDL sortie
 *
 * STATUT : skeleton avec test.skip() — TODO V82.5+ :
 *  1. Créer e2e/fixtures.ts avec :
 *     - test.extend pour fournir un page authentifié locataire
 *     - test.extend pour fournir un page authentifié proprio
 *     - Setup via storageState (JWT NextAuth mock) ou login Email magic link
 *  2. Créer compte test seedé en DB (is_test=true) pour locataire+proprio
 *  3. Implémenter les test.skip() un par un
 *
 * Pourquoi pas Google OAuth automatisé : Google bloque le headless browser
 * et exige captcha → impossible E2E. Solution : NextAuth credentials provider
 * mock OU JWT signé en seed.
 */

import { test } from "@playwright/test"

test.describe.skip("Flow locataire complet (TODO V82.5+ — auth fixtures)", () => {
  test("Locataire envoie message + dossier + propose visite", async ({ page }) => {
    // 1. Login locataire (fixture)
    // 2. Goto /annonces → click 1ère card
    // 3. Click "Contacter le propriétaire"
    // 4. Écrire message → envoyer
    // 5. Click "Envoyer mon dossier"
    // 6. Click "Proposer une visite" → remplir formulaire
    // 7. Vérifier /mes-candidatures contient la candidature
    // 8. Vérifier /visites contient la visite
    page.goto("/")
  })
})

test.describe.skip("Flow proprio complet (TODO V82.5+ — auth fixtures)", () => {
  test("Proprio valide candidature + accepte visite + génère bail", async ({ page }) => {
    // 1. Login proprio
    // 2. /messages → ouvre thread candidat
    // 3. Click "Valider la candidature"
    // 4. Accept la visite proposée
    // 5. Click "Générer le bail" → modal eIDAS → signer
    // 6. /proprietaire/baux/historique contient le bail "actif"
    page.goto("/")
  })
})

test.describe.skip("EDL flow (TODO V82.5+ — needs signed bail fixture)", () => {
  test("Création EDL entrée + signature 2 parties", async ({ page }) => {
    // 1. Login proprio
    // 2. /proprietaire/edl/[id] sur bail actif
    // 3. Remplir formulaire EDL (pièces, photos, commentaires)
    // 4. Signer côté proprio
    // 5. Locataire reçoit notification → /messages → signe
    // 6. EDL passe à "signé 2/2"
    page.goto("/")
  })
})

test.describe.skip("Quittance flow (TODO V82.5+ — needs paid month fixture)", () => {
  test("Génération quittance PDF après loyer payé", async ({ page }) => {
    // 1. Login proprio
    // 2. /proprietaire/loyers ou /mes-quittances
    // 3. Trigger génération quittance pour le mois en cours
    // 4. Vérifier PDF accessible + signé eIDAS niveau 1
    page.goto("/")
  })
})
