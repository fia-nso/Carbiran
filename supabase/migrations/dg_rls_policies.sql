-- Migration : politiques RLS pour le Directeur Général (DG)
-- Le DG est un utilisateur avec role = 'signataire' et un email contenant 'dg'.
-- Il doit pouvoir lire toutes les données en lecture seule.
--
-- À exécuter dans le SQL Editor de Supabase Dashboard.

-- Helper : vérifie si l'utilisateur connecté est le DG
-- (role = 'signataire' ET circuit_role = 'directeur_general')
CREATE OR REPLACE FUNCTION public.is_dg()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'signataire'
      AND circuit_role = 'directeur_general'
  );
$$;

-- -------------------------------------------------------------------------
-- demandes_ravitaillement : DG peut lire toutes les demandes
-- -------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'demandes_ravitaillement'
      AND policyname = 'dg_select_all_demandes'
  ) THEN
    CREATE POLICY "dg_select_all_demandes"
    ON public.demandes_ravitaillement
    FOR SELECT
    TO authenticated
    USING (public.is_dg());
  END IF;
END $$;

-- -------------------------------------------------------------------------
-- demande_vehicules : DG peut lire tous les véhicules de demande
-- -------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'demande_vehicules'
      AND policyname = 'dg_select_all_demande_vehicules'
  ) THEN
    CREATE POLICY "dg_select_all_demande_vehicules"
    ON public.demande_vehicules
    FOR SELECT
    TO authenticated
    USING (public.is_dg());
  END IF;
END $$;

-- -------------------------------------------------------------------------
-- ravitaillements_vehicules : DG peut lire tous les ravitaillements
-- -------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'ravitaillements_vehicules'
      AND policyname = 'dg_select_all_ravitaillements'
  ) THEN
    CREATE POLICY "dg_select_all_ravitaillements"
    ON public.ravitaillements_vehicules
    FOR SELECT
    TO authenticated
    USING (public.is_dg());
  END IF;
END $$;

-- -------------------------------------------------------------------------
-- vehicules : DG peut lire tous les véhicules
-- -------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'vehicules'
      AND policyname = 'dg_select_all_vehicules'
  ) THEN
    CREATE POLICY "dg_select_all_vehicules"
    ON public.vehicules
    FOR SELECT
    TO authenticated
    USING (public.is_dg());
  END IF;
END $$;

-- -------------------------------------------------------------------------
-- photos_justification : DG peut lire toutes les photos
-- -------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'photos_justification'
      AND policyname = 'dg_select_all_photos'
  ) THEN
    CREATE POLICY "dg_select_all_photos"
    ON public.photos_justification
    FOR SELECT
    TO authenticated
    USING (public.is_dg());
  END IF;
END $$;
