-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 090 — Phase D — Events webhooks supplémentaires
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Author: Claude (V97.39.34)
-- Date: 2026-05-18
--
-- Ajoute 4 events supplémentaires pour couvrir tout le cycle de vie d'une
-- annonce agence :
--   - annonce.created     : nouvelle annonce avec agence_id non null
--   - annonce.updated     : champs métier modifiés (titre/prix/desc/photos/statut)
--   - annonce.deleted     : statut passe à 'loue_termine' ou 'loué'
--   - candidature.refused : visite passe à statut 'annulée' ou 'refusée'
--
-- Logique des triggers identique à migration 089 — call webhook_enqueue_event
-- via SECURITY DEFINER function pour insert dans webhook_deliveries.

BEGIN;

-- ─── 1. Trigger annonce.created ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trigger_webhook_annonce_created()
RETURNS trigger AS $$
BEGIN
  IF NEW.agence_id IS NOT NULL THEN
    PERFORM public.webhook_enqueue_event(
      NEW.agence_id,
      'annonce.created',
      jsonb_build_object(
        'annonce_id', NEW.id,
        'titre', NEW.titre,
        'ville', NEW.ville,
        'code_postal', NEW.code_postal,
        'prix', NEW.prix,
        'surface', NEW.surface,
        'type_bien', NEW.type_bien,
        'external_ref', NEW.external_ref,
        'statut', COALESCE(NEW.statut, 'disponible')
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_webhook_annonce_created ON public.annonces;
CREATE TRIGGER trg_webhook_annonce_created
  AFTER INSERT ON public.annonces
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_webhook_annonce_created();


-- ─── 2. Trigger annonce.updated ────────────────────────────────────────────
--
-- Fire si certains champs métier changent (titre, prix, charges, description,
-- photos, statut). Évite le firing sur des updates internes (vue counter, etc.).
-- Aussi : skip si bail signature (déjà couvert par bail.signed) et skip si
-- transition vers loue_termine (couvert par annonce.deleted).

CREATE OR REPLACE FUNCTION public.trigger_webhook_annonce_updated()
RETURNS trigger AS $$
DECLARE
  v_changed boolean := false;
BEGIN
  IF NEW.agence_id IS NULL THEN RETURN NEW; END IF;

  -- Détection champ métier modifié
  v_changed := (
    OLD.titre IS DISTINCT FROM NEW.titre OR
    OLD.prix IS DISTINCT FROM NEW.prix OR
    OLD.charges IS DISTINCT FROM NEW.charges OR
    OLD.surface IS DISTINCT FROM NEW.surface OR
    OLD.pieces IS DISTINCT FROM NEW.pieces OR
    OLD.description IS DISTINCT FROM NEW.description OR
    OLD.photos IS DISTINCT FROM NEW.photos OR
    OLD.adresse IS DISTINCT FROM NEW.adresse OR
    OLD.dpe IS DISTINCT FROM NEW.dpe OR
    (OLD.statut IS DISTINCT FROM NEW.statut
      AND NEW.statut NOT IN ('loue_termine', 'loué'))
  );

  IF v_changed THEN
    PERFORM public.webhook_enqueue_event(
      NEW.agence_id,
      'annonce.updated',
      jsonb_build_object(
        'annonce_id', NEW.id,
        'titre', NEW.titre,
        'ville', NEW.ville,
        'prix', NEW.prix,
        'surface', NEW.surface,
        'statut', NEW.statut,
        'external_ref', NEW.external_ref
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_webhook_annonce_updated ON public.annonces;
CREATE TRIGGER trg_webhook_annonce_updated
  AFTER UPDATE ON public.annonces
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_webhook_annonce_updated();


-- ─── 3. Trigger annonce.deleted ────────────────────────────────────────────
--
-- "Deleted" = statut passe à loue_termine ou loué (KeyMatch ne hard-delete
-- jamais les annonces).

CREATE OR REPLACE FUNCTION public.trigger_webhook_annonce_deleted()
RETURNS trigger AS $$
BEGIN
  IF NEW.agence_id IS NOT NULL
     AND NEW.statut IN ('loue_termine', 'loué')
     AND OLD.statut IS DISTINCT FROM NEW.statut
  THEN
    PERFORM public.webhook_enqueue_event(
      NEW.agence_id,
      'annonce.deleted',
      jsonb_build_object(
        'annonce_id', NEW.id,
        'titre', NEW.titre,
        'previous_statut', OLD.statut,
        'new_statut', NEW.statut,
        'external_ref', NEW.external_ref
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_webhook_annonce_deleted ON public.annonces;
CREATE TRIGGER trg_webhook_annonce_deleted
  AFTER UPDATE OF statut ON public.annonces
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_webhook_annonce_deleted();


-- ─── 4. Trigger candidature.refused ────────────────────────────────────────
--
-- Visite annulée/refusée par le propriétaire (qui pourrait être l'agence).

CREATE OR REPLACE FUNCTION public.trigger_webhook_candidature_refused()
RETURNS trigger AS $$
DECLARE
  v_annonce record;
BEGIN
  IF (OLD.statut IS DISTINCT FROM NEW.statut)
     AND NEW.statut IN ('annulée', 'refusée')
  THEN
    SELECT agence_id, titre, ville INTO v_annonce
    FROM public.annonces WHERE id = NEW.annonce_id;

    IF v_annonce.agence_id IS NOT NULL THEN
      PERFORM public.webhook_enqueue_event(
        v_annonce.agence_id,
        'candidature.refused',
        jsonb_build_object(
          'visite_id', NEW.id,
          'annonce_id', NEW.annonce_id,
          'annonce_titre', v_annonce.titre,
          'locataire_email', NEW.locataire_email,
          'previous_statut', OLD.statut,
          'new_statut', NEW.statut,
          'message', NEW.message
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_webhook_candidature_refused ON public.visites;
CREATE TRIGGER trg_webhook_candidature_refused
  AFTER UPDATE OF statut ON public.visites
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_webhook_candidature_refused();


-- ─── 5. Sanity check ───────────────────────────────────────────────────────

DO $$
BEGIN
  ASSERT (SELECT count(*) FROM pg_trigger
          WHERE tgname IN (
            'trg_webhook_annonce_created',
            'trg_webhook_annonce_updated',
            'trg_webhook_annonce_deleted',
            'trg_webhook_candidature_refused'
          )) = 4;
END $$;

COMMIT;
