-- =====================================================================
-- MIGRATION 027 — Annonces critères proprio (V6.1)
-- Date     : 2026-04-28
-- Tables   : annonces (+4 colonnes : min_revenus_ratio, garants_acceptes,
--            profils_acceptes, message_proprietaire)
-- Idempotent : oui — peut être rejouée sans risque
-- =====================================================================
--
-- Contexte : V1.5 (commit d317794) avait branche le screening sur
-- annonce.min_revenus_ratio + garants_acceptes + profils_acceptes mais
-- ces colonnes n'existaient PAS dans la table annonces en prod. Le code
-- lisait null → fallback 3× hardcode partout. Feature dead.
--
-- V1.1 (commit fc2eaaa) avait aussi branche message_proprietaire dans
-- la card "Mot du propriétaire" sur /annonces/[id], mais la colonne
-- n'existait pas non plus.
--
-- Cette migration cree les 4 colonnes pour brancher proprement les
-- features V1.1 + V1.5 + permettre la persistence wizard V6.1.
-- =====================================================================

ALTER TABLE public.annonces
  ADD COLUMN IF NOT EXISTS min_revenus_ratio numeric DEFAULT 3.0,
  ADD COLUMN IF NOT EXISTS garants_acceptes text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS profils_acceptes text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS message_proprietaire text;

COMMENT ON COLUMN public.annonces.min_revenus_ratio IS
  'Ratio min revenus locataire / loyer CC. Default 3.0';
COMMENT ON COLUMN public.annonces.garants_acceptes IS
  'Liste types de garant acceptés (Visale, Garantme, Parents, Autre). Vide = tous acceptés';
COMMENT ON COLUMN public.annonces.profils_acceptes IS
  'Liste situation_pro acceptées (CDI, CDD, Etudiant, Fonctionnaire, Indep, Retraite). Vide = tous acceptés';
COMMENT ON COLUMN public.annonces.message_proprietaire IS
  'Mot du propriétaire affiché aux candidats avant contact. Max 500 chars';

NOTIFY pgrst, 'reload schema';
