-- Carnet d'entretien par bien immobilier
CREATE TABLE IF NOT EXISTS public.carnet_entretien (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  annonce_id        integer NOT NULL,
  proprietaire_email text NOT NULL,
  locataire_email   text,
  titre             text NOT NULL,
  description       text,
  type              text NOT NULL DEFAULT 'autre' CHECK (type IN ('chaudière','plomberie','électricité','travaux','serrurerie','nuisibles','autre')),
  statut            text NOT NULL DEFAULT 'planifié' CHECK (statut IN ('planifié','en cours','terminé')),
  date_evenement    date,
  cout              integer,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS carnet_annonce_idx ON public.carnet_entretien (annonce_id);
CREATE INDEX IF NOT EXISTS carnet_proprio_idx ON public.carnet_entretien (proprietaire_email);
