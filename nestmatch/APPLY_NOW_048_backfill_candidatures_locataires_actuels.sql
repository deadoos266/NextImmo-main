-- APPLY NOW (idempotent) — V50.16 backfill
-- Marque comme `validee` toutes les candidatures dont l'auteur est le
-- locataire actuel de l'annonce (bail signé), MAIS dont le statut est resté
-- pending parce que le proprio a sauté l'étape de validation explicite.
--
-- Bug user reproduit : "alors je suis locataire sans que le proprio met
-- validé, et donc je ne peux pas proposer de visite". Quand le proprio
-- signe le bail direct (sans cliquer "Valider candidat"), la candidature
-- reste pending → modale visite bloquée pour le locataire actuel.
--
-- Fix futur : V50.16 server-side dans /api/bail/signer fait l'auto-validate
-- au moment de la double-signature. Ce backfill traite les baux signés AVANT
-- ce fix.

UPDATE messages m
SET statut_candidature = 'validee'
FROM annonces a
WHERE m.type = 'candidature'
  AND m.annonce_id = a.id
  AND a.locataire_email IS NOT NULL
  AND lower(m.from_email) = lower(a.locataire_email)
  AND (m.statut_candidature IS NULL OR m.statut_candidature != 'validee');

-- Pour vérification :
-- SELECT count(*) FROM messages m JOIN annonces a ON m.annonce_id = a.id
--   WHERE m.type = 'candidature'
--     AND lower(m.from_email) = lower(a.locataire_email)
--     AND m.statut_candidature = 'validee';
