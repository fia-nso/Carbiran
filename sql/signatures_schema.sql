-- ============================================================
-- Signatures utilisateurs (signature réutilisable par rôle)
-- ============================================================

CREATE TABLE public.signatures_utilisateurs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        REFERENCES auth.users(id),
  role         text        NOT NULL,
  signature_url text       NOT NULL,
  created_at   timestamptz DEFAULT now()
);

-- ============================================================
-- Signatures situation (signatures apposées sur une demande)
-- ============================================================

CREATE TABLE public.signatures_situation (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  demande_id    uuid        REFERENCES public.demandes_ravitaillement(id),
  role          text        NOT NULL,
  user_id       uuid        REFERENCES auth.users(id),
  signature_url text,
  signe_le      timestamptz DEFAULT now(),
  ordre         integer     NOT NULL
);

-- ============================================================
-- Row Level Security
-- ============================================================

ALTER TABLE public.signatures_utilisateurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.signatures_situation    ENABLE ROW LEVEL SECURITY;

-- Tout utilisateur authentifié peut lire les signatures
CREATE POLICY "signatures_select" ON public.signatures_utilisateurs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "signatures_situation_select" ON public.signatures_situation
  FOR SELECT TO authenticated USING (true);

-- Un utilisateur ne peut insérer une signature situation qu'en son propre nom
CREATE POLICY "signatures_situation_insert" ON public.signatures_situation
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Contrainte unicité : une signature par utilisateur (remplacée à l'upload)
ALTER TABLE public.signatures_utilisateurs
  ADD CONSTRAINT signatures_utilisateurs_user_id_unique UNIQUE (user_id);

-- ============================================================
-- Bucket Storage 'signatures' — à créer via dashboard Supabase
-- ou via la requête SQL suivante (Supabase Storage API) :
-- ============================================================

-- Crée le bucket 'signatures' (public)
INSERT INTO storage.buckets (id, name, public)
VALUES ('signatures', 'signatures', true)
ON CONFLICT (id) DO NOTHING;

-- Policy SELECT : tous les authentifiés peuvent lire les signatures
CREATE POLICY "signatures_storage_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'signatures');

-- Policy INSERT : seul l'utilisateur connecté peut uploader sa signature
CREATE POLICY "signatures_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'signatures'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Policy UPDATE : l'utilisateur peut remplacer sa propre signature
CREATE POLICY "signatures_storage_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'signatures'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================
-- Migration — Séparation circuit situation / bons
-- À exécuter dans Supabase SQL Editor
-- ============================================================

-- Ajoute la colonne circuit avec 'situation' comme valeur par défaut
-- (les lignes existantes deviennent automatiquement du circuit situation)
ALTER TABLE public.signatures_situation
  ADD COLUMN IF NOT EXISTS circuit text NOT NULL DEFAULT 'situation';

-- Contrainte unicité : un rôle ne peut signer qu'une fois par demande ET par circuit
ALTER TABLE public.signatures_situation
  DROP CONSTRAINT IF EXISTS signatures_situation_demande_role_unique;

ALTER TABLE public.signatures_situation
  ADD CONSTRAINT signatures_situation_demande_role_circuit_unique
  UNIQUE (demande_id, role, circuit);
