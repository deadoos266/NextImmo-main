-- Migration 037 — V32.2 (Paul 2026-04-29)
-- Audit produit V31 risque 🔴 critique #2 : "Locataire signe sans avoir lu le PDF".
--
-- Ajoute le tracking du temps de lecture du PDF par le signataire avant
-- son acte de signature. Renforce l'audit-trail eIDAS Niveau 1 (article
-- 1366 Code civil + règlement UE 910/2014) : preuve que le signataire
-- a effectivement consulté le bail intégral avant de signer.
--
-- Idempotente — peut être appliquée plusieurs fois sans erreur.

ALTER TABLE public.bail_signatures
  ADD COLUMN IF NOT EXISTS pdf_lu_avant_signature_at timestamptz;

COMMENT ON COLUMN public.bail_signatures.pdf_lu_avant_signature_at IS
  'V32 — timestamp serveur de lecture du PDF par le signataire avant son acte. '
  'Renforce audit-trail eIDAS : preuve de consentement éclairé (art. 1188 Code civil).';
