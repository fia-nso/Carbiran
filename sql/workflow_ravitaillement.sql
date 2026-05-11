-- Workflow Ravitaillement — schéma, RLS et extension des rôles
-- Complément à supabase_shema.sql
-- Date de référence : 2026-05-08

-- =========================================================
-- 1. Extension de l'enum app_role
--    ALTER TYPE ADD VALUE ne peut pas s'exécuter dans une
--    transaction ; ces instructions doivent rester hors du
--    bloc begin/commit.
-- =========================================================

alter type public.app_role add value if not exists 'chef_de_cours';
alter type public.app_role add value if not exists 'chef_departement';
alter type public.app_role add value if not exists 'responsable_station';

-- =========================================================

begin;

-- =========================================================
-- 2. Modification de la table profiles
-- =========================================================

alter table public.profiles
  add column if not exists departement text;

-- =========================================================
-- 3. Fonctions utilitaires pour les rôles ravitaillement
-- =========================================================

create or replace function public.is_chef_de_cours()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'chef_de_cours' from public.profiles where id = auth.uid() limit 1),
    false
  )
$$;

create or replace function public.is_chef_departement()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'chef_departement' from public.profiles where id = auth.uid() limit 1),
    false
  )
$$;

create or replace function public.is_responsable_station()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role = 'responsable_station' from public.profiles where id = auth.uid() limit 1),
    false
  )
$$;

-- Retourne le département du profil courant (utilisé dans les politiques RLS)
create or replace function public.current_user_departement()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select departement from public.profiles where id = auth.uid() limit 1
$$;

revoke all on function public.is_chef_de_cours()        from public;
revoke all on function public.is_chef_departement()     from public;
revoke all on function public.is_responsable_station()  from public;
revoke all on function public.current_user_departement() from public;

grant execute on function public.is_chef_de_cours()        to authenticated;
grant execute on function public.is_chef_departement()     to authenticated;
grant execute on function public.is_responsable_station()  to authenticated;
grant execute on function public.current_user_departement() to authenticated;

-- =========================================================
-- 4. Table demandes_ravitaillement
-- =========================================================

create table if not exists public.demandes_ravitaillement (
  id          uuid    primary key default gen_random_uuid(),
  departement text    not null,
  statut      text    not null default 'en_attente',
  created_by  uuid    not null references auth.users(id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint demandes_rav_departement_valid check (
    departement in ('Zone A', 'Zone B', 'RS', 'FO', 'CDPE')
  ),
  constraint demandes_rav_statut_valid check (
    statut in ('en_attente', 'validee_dept', 'validee_station', 'validee_cellule', 'annulee')
  )
);

drop trigger if exists trg_demandes_rav_updated_at on public.demandes_ravitaillement;
create trigger trg_demandes_rav_updated_at
before update on public.demandes_ravitaillement
for each row
execute function public.set_updated_at();

create index if not exists idx_demandes_rav_created_by  on public.demandes_ravitaillement(created_by);
create index if not exists idx_demandes_rav_departement on public.demandes_ravitaillement(departement);
create index if not exists idx_demandes_rav_statut      on public.demandes_ravitaillement(statut);

-- =========================================================
-- 5. Table demande_vehicules
--    vehicule_id référence vehicules.id qui est bigint
-- =========================================================

create table if not exists public.demande_vehicules (
  id           uuid    primary key default gen_random_uuid(),
  demande_id   uuid    not null references public.demandes_ravitaillement(id) on delete cascade,
  vehicule_id  bigint  not null references public.vehicules(id) on delete restrict,
  montant      numeric(14,2),
  n_liter      numeric(14,2),
  kilometrage  numeric(14,2),
  statut       text    not null default 'en_attente',
  created_at   timestamptz not null default now(),
  constraint dv_statut_valid check (
    statut in ('en_attente', 'ravitaille', 'valide', 'refuse')
  )
);

create index if not exists idx_dv_demande_id  on public.demande_vehicules(demande_id);
create index if not exists idx_dv_vehicule_id on public.demande_vehicules(vehicule_id);

-- =========================================================
-- 6. Table photos_justification
-- =========================================================

create table if not exists public.photos_justification (
  id                  uuid primary key default gen_random_uuid(),
  demande_vehicule_id uuid not null references public.demande_vehicules(id) on delete cascade,
  url                 text not null,
  type                text not null,
  uploaded_at         timestamptz not null default now(),
  constraint photos_type_valid check (
    type in ('vehicule_avant', 'vehicule_apres', 'pompe')
  )
);

create index if not exists idx_photos_dv_id on public.photos_justification(demande_vehicule_id);

-- =========================================================
-- 7. Table notifications
-- =========================================================

create table if not exists public.notifications (
  id         uuid    primary key default gen_random_uuid(),
  user_id    uuid    not null references auth.users(id) on delete cascade,
  message    text    not null,
  type       text    not null,
  lu         boolean not null default false,
  demande_id uuid    references public.demandes_ravitaillement(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_notif_user_id    on public.notifications(user_id);
create index if not exists idx_notif_demande_id on public.notifications(demande_id);

-- =========================================================
-- 8. Permissions
-- =========================================================

grant select, insert, update on public.demandes_ravitaillement to authenticated;
grant select, insert, update on public.demande_vehicules        to authenticated;
grant select, insert         on public.photos_justification     to authenticated;
grant select, insert, update on public.notifications            to authenticated;

-- =========================================================
-- 9. RLS
-- =========================================================

alter table public.demandes_ravitaillement enable row level security;
alter table public.demande_vehicules        enable row level security;
alter table public.photos_justification     enable row level security;
alter table public.notifications            enable row level security;

-- ---------------------------------------------------------
-- demandes_ravitaillement : lecture selon rôle
--   • Admin (cellule)         → tout
--   • chef_departement        → son département uniquement
--   • responsable_station     → statut >= validee_dept
--   • chef_de_cours / autres  → uniquement les siennes
-- ---------------------------------------------------------

drop policy if exists "demandes_rav_select" on public.demandes_ravitaillement;
create policy "demandes_rav_select"
on public.demandes_ravitaillement
for select
to authenticated
using (
  public.is_admin()
  or (
    public.is_chef_departement()
    and departement = public.current_user_departement()
  )
  or (
    public.is_responsable_station()
    and statut in ('validee_dept', 'validee_station', 'validee_cellule')
  )
  or created_by = auth.uid()
);

drop policy if exists "demandes_rav_insert" on public.demandes_ravitaillement;
create policy "demandes_rav_insert"
on public.demandes_ravitaillement
for insert
to authenticated
with check (created_by = auth.uid());

drop policy if exists "demandes_rav_update" on public.demandes_ravitaillement;
create policy "demandes_rav_update"
on public.demandes_ravitaillement
for update
to authenticated
using (
  public.is_admin()
  or (
    public.is_chef_departement()
    and departement = public.current_user_departement()
  )
  or (
    public.is_responsable_station()
    and statut in ('validee_dept', 'validee_station')
  )
)
with check (
  public.is_admin()
  or (
    public.is_chef_departement()
    and departement = public.current_user_departement()
  )
  or (
    public.is_responsable_station()
    and statut in ('validee_dept', 'validee_station')
  )
);

-- ---------------------------------------------------------
-- demande_vehicules : visibilité héritée de la demande parente
-- ---------------------------------------------------------

drop policy if exists "dv_select" on public.demande_vehicules;
create policy "dv_select"
on public.demande_vehicules
for select
to authenticated
using (
  exists (
    select 1 from public.demandes_ravitaillement dr
    where dr.id = demande_id
      and (
        public.is_admin()
        or (
          public.is_chef_departement()
          and dr.departement = public.current_user_departement()
        )
        or (
          public.is_responsable_station()
          and dr.statut in ('validee_dept', 'validee_station', 'validee_cellule')
        )
        or dr.created_by = auth.uid()
      )
  )
);

drop policy if exists "dv_insert" on public.demande_vehicules;
create policy "dv_insert"
on public.demande_vehicules
for insert
to authenticated
with check (
  public.is_admin()
  or public.is_responsable_station()
  or exists (
    select 1 from public.demandes_ravitaillement dr
    where dr.id = demande_id
      and dr.created_by = auth.uid()
  )
);

drop policy if exists "dv_update" on public.demande_vehicules;
create policy "dv_update"
on public.demande_vehicules
for update
to authenticated
using (
  public.is_admin()
  or public.is_responsable_station()
);

-- ---------------------------------------------------------
-- photos_justification : lecture authentifiée,
--                        insertion responsable_station seulement
-- ---------------------------------------------------------

drop policy if exists "photos_select" on public.photos_justification;
create policy "photos_select"
on public.photos_justification
for select
to authenticated
using (true);

drop policy if exists "photos_insert" on public.photos_justification;
create policy "photos_insert"
on public.photos_justification
for insert
to authenticated
with check (
  public.is_responsable_station()
  or public.is_admin()
);

-- ---------------------------------------------------------
-- notifications : chaque utilisateur voit uniquement les siennes
-- ---------------------------------------------------------

drop policy if exists "notif_select_own" on public.notifications;
create policy "notif_select_own"
on public.notifications
for select
to authenticated
using (user_id = auth.uid());

-- =========================================================
-- 10. Fonctions de lookup pour la diffusion de notifications
--     (SECURITY DEFINER : contournent la RLS sur profiles
--      pour trouver les destinataires par rôle/département)
-- =========================================================

create or replace function public.get_user_ids_by_role(p_role text)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles where role::text = p_role
$$;

create or replace function public.get_user_ids_by_role_dept(p_role text, p_dept text)
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.profiles where role::text = p_role and departement = p_dept
$$;

revoke all on function public.get_user_ids_by_role(text)            from public;
revoke all on function public.get_user_ids_by_role_dept(text, text) from public;

grant execute on function public.get_user_ids_by_role(text)            to authenticated;
grant execute on function public.get_user_ids_by_role_dept(text, text) to authenticated;

-- =========================================================

drop policy if exists "notif_insert" on public.notifications;
create policy "notif_insert"
on public.notifications
for insert
to authenticated
with check (true);

drop policy if exists "notif_update_own" on public.notifications;
create policy "notif_update_own"
on public.notifications
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- =========================================================
-- 11. Policies Storage — bucket ravitaillement-photos
--     Prérequis : créer le bucket dans le Dashboard Supabase
--     (Storage → New bucket → "ravitaillement-photos", public: false)
--     et activer RLS sur ce bucket.
-- =========================================================

drop policy if exists "ravitaillement_photos_select" on storage.objects;
create policy "ravitaillement_photos_select"
on storage.objects
for select
to authenticated
using (bucket_id = 'ravitaillement-photos');

drop policy if exists "ravitaillement_photos_insert" on storage.objects;
create policy "ravitaillement_photos_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'ravitaillement-photos'
  and public.is_responsable_station()
);

-- =========================================================
-- 12. Mise à jour de la contrainte départements
--     Ajout de 'RX&SYS', 'DC' et 'Autre' (et maintien de 'RS'
--     pour compatibilité avec les données existantes)
-- =========================================================

alter table public.demandes_ravitaillement
  drop constraint if exists demandes_rav_departement_valid;

alter table public.demandes_ravitaillement
  add constraint demandes_rav_departement_valid check (
    departement in ('Zone A', 'Zone B', 'RS', 'RX&SYS', 'FO', 'CDPE', 'DC', 'Autre')
  );

commit;
