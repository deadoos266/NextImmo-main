-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 089 — Phase D triggers webhooks events
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Author: Claude (V97.39.34)
-- Date: 2026-05-18
--
-- ─── SCOPE ─────────────────────────────────────────────────────────────────
--
-- KeyMatch utilise un pattern où beaucoup de mutations se font côté client
-- direct via le SDK Supabase (pas via des routes API serveur). Pour
-- déclencher les webhooks sans réécrire ces flows, on installe des
-- triggers AFTER UPDATE/INSERT sur les tables concernées.
--
-- Le trigger appelle `webhook_enqueue_event()` qui INSERT dans
-- `webhook_deliveries` pour chaque webhook actif de l'agence souscrit
-- à cet event. Le worker cron existant pop et delivre.
--
-- Events implémentés :
--   - visites UPDATE statut → 'confirmée' (depuis autre)
--       → `visite.confirmee`
--   - annonces UPDATE bail_signe_locataire_at + bail_signe_bailleur_at
--     deviennent BOTH NOT NULL → `bail.signed`
--   - messages INSERT sur annonce d'agence → `message.received`
--
-- Note : `candidature.created` reste géré dans l'API route /api/visites/
-- proposer (déjà fait dans migration 088 commit). On laisse comme ça pour
-- éviter du double-firing.

BEGIN;

-- ─── 1. Function webhook_enqueue_event ─────────────────────────────────────

CREATE OR REPLACE FUNCTION public.webhook_enqueue_event(
  p_agence_id uuid,
  p_event text,
  p_payload jsonb
) RETURNS void AS $$
DECLARE
  v_webhook record;
  v_full_payload jsonb;
BEGIN
  IF p_agence_id IS NULL THEN RETURN; END IF;

  v_full_payload := jsonb_build_object(
    'event', p_event,
    'timestamp', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'agence_id', p_agence_id,
    'data', p_payload
  );

  -- Insert une delivery pour chaque webhook actif souscrit à cet event
  FOR v_webhook IN
    SELECT id FROM public.agence_webhooks
    WHERE agence_id = p_agence_id
      AND active = true
      AND p_event = ANY(events)
  LOOP
    INSERT INTO public.webhook_deliveries (
      webhook_id, agence_id, event, payload, status, next_attempt_at
    ) VALUES (
      v_webhook.id, p_agence_id, p_event, v_full_payload, 'pending', now()
    );
  END LOOP;
EXCEPTION
  -- Best-effort : si la queue échoue, ne pas bloquer la mutation métier
  WHEN OTHERS THEN
    RAISE NOTICE 'webhook_enqueue_event failed: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─── 2. Trigger visite.confirmee ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.trigger_webhook_visite_confirmee()
RETURNS trigger AS $$
DECLARE
  v_agence_id uuid;
  v_annonce record;
BEGIN
  -- Fire seulement si la visite passe de "non-confirmée" à "confirmée"
  IF (OLD.statut IS DISTINCT FROM NEW.statut) AND NEW.statut = 'confirmée' THEN
    SELECT agence_id, titre, ville INTO v_annonce
    FROM public.annonces WHERE id = NEW.annonce_id;

    IF v_annonce.agence_id IS NOT NULL THEN
      PERFORM public.webhook_enqueue_event(
        v_annonce.agence_id,
        'visite.confirmee',
        jsonb_build_object(
          'visite_id', NEW.id,
          'annonce_id', NEW.annonce_id,
          'annonce_titre', v_annonce.titre,
          'annonce_ville', v_annonce.ville,
          'locataire_email', NEW.locataire_email,
          'date_visite', NEW.date_visite,
          'heure', NEW.heure,
          'format', NEW.format
        )
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_webhook_visite_confirmee ON public.visites;
CREATE TRIGGER trg_webhook_visite_confirmee
  AFTER UPDATE OF statut ON public.visites
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_webhook_visite_confirmee();


-- ─── 3. Trigger bail.signed ────────────────────────────────────────────────
--
-- Fire quand les 2 signatures (locataire + bailleur) sont set ALORS qu'au
-- moins une ne l'était pas avant.

CREATE OR REPLACE FUNCTION public.trigger_webhook_bail_signed()
RETURNS trigger AS $$
BEGIN
  -- Avant : au moins une des 2 sig était null. Maintenant : les 2 sont non-null.
  IF NEW.bail_signe_locataire_at IS NOT NULL
     AND NEW.bail_signe_bailleur_at IS NOT NULL
     AND (OLD.bail_signe_locataire_at IS NULL OR OLD.bail_signe_bailleur_at IS NULL)
     AND NEW.agence_id IS NOT NULL
  THEN
    PERFORM public.webhook_enqueue_event(
      NEW.agence_id,
      'bail.signed',
      jsonb_build_object(
        'annonce_id', NEW.id,
        'annonce_titre', NEW.titre,
        'annonce_ville', NEW.ville,
        'locataire_email', NEW.locataire_email,
        'proprietaire_email', NEW.proprietaire_email,
        'date_debut_bail', NEW.date_debut_bail,
        'bail_signe_locataire_at', NEW.bail_signe_locataire_at,
        'bail_signe_bailleur_at', NEW.bail_signe_bailleur_at
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_webhook_bail_signed ON public.annonces;
CREATE TRIGGER trg_webhook_bail_signed
  AFTER UPDATE OF bail_signe_locataire_at, bail_signe_bailleur_at ON public.annonces
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_webhook_bail_signed();


-- ─── 4. Trigger message.received ───────────────────────────────────────────
--
-- Fire à chaque INSERT sur messages dont l'annonce appartient à une agence.

CREATE OR REPLACE FUNCTION public.trigger_webhook_message_received()
RETURNS trigger AS $$
DECLARE
  v_annonce record;
BEGIN
  IF NEW.annonce_id IS NULL THEN RETURN NEW; END IF;

  SELECT agence_id, titre INTO v_annonce
  FROM public.annonces WHERE id = NEW.annonce_id;

  IF v_annonce.agence_id IS NOT NULL THEN
    PERFORM public.webhook_enqueue_event(
      v_annonce.agence_id,
      'message.received',
      jsonb_build_object(
        'message_id', NEW.id,
        'annonce_id', NEW.annonce_id,
        'annonce_titre', v_annonce.titre,
        'from_email', NEW.from_email,
        'to_email', NEW.to_email,
        'contenu', LEFT(COALESCE(NEW.contenu, ''), 1000),
        'created_at', NEW.created_at
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_webhook_message_received ON public.messages;
CREATE TRIGGER trg_webhook_message_received
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_webhook_message_received();


-- ─── 5. Permissions ────────────────────────────────────────────────────────
--
-- Les fonctions sont SECURITY DEFINER (run avec privs du créateur = keymatch
-- superuser) donc elles peuvent INSERT dans webhook_deliveries même si le
-- caller est anon/authenticated. C'est nécessaire car le SDK Supabase côté
-- client n'a pas le droit d'écrire dans webhook_deliveries directement.

GRANT EXECUTE ON FUNCTION public.webhook_enqueue_event(uuid, text, jsonb) TO anon, authenticated, service_role;


-- ─── 6. Sanity check ───────────────────────────────────────────────────────

DO $$
BEGIN
  ASSERT (SELECT count(*) FROM pg_trigger
          WHERE tgname IN (
            'trg_webhook_visite_confirmee',
            'trg_webhook_bail_signed',
            'trg_webhook_message_received'
          )) = 3;
END $$;

COMMIT;
