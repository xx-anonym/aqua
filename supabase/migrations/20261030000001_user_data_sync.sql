-- Aqua: user data for cloud sync. Every table mirrors the local SQLite table of the same name.
-- Sync rules: soft delete via deleted_at, last write (newest updated_at) wins, the server sets
-- synced_at so clients can pull "everything changed since my cursor". RLS: own rows only.

create or replace function public.sync_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.user_id <> old.user_id then
      raise exception 'user_id cannot change';
    end if;
    -- Last write wins: an older client version never overwrites a newer row.
    if new.updated_at < old.updated_at then
      return null;
    end if;
  end if;
  new.synced_at := clock_timestamp();
  return new;
end;
$$;

create table public.dive_site (
  name text not null,
  lat double precision,
  lng double precision,
  country text,
  region_id text,
  is_private boolean not null default true
);

create table public.dive (
  dive_no integer,
  date date not null,
  entry_time text,
  exit_time text,
  max_depth_m double precision,
  avg_depth_m double precision,
  duration_min double precision,
  site_id uuid,
  rating smallint check (rating between 1 and 5),
  notes text,
  source text not null default 'manual' check (source in ('manual', 'import'))
);

create table public.dive_conditions (
  dive_id uuid not null,
  visibility_m double precision,
  water_temp_c double precision,
  air_temp_c double precision,
  water_type text check (water_type in ('salt', 'fresh', 'brackish')),
  current text check (current in ('none', 'light', 'moderate', 'strong'))
);

create table public.dive_features (
  dive_id uuid not null,
  types jsonb not null default '[]'::jsonb
);

create table public.dive_equipment (
  dive_id uuid not null,
  suit text,
  gas text check (gas in ('air', 'nitrox', 'trimix')),
  o2_percent double precision,
  tank_volume_l double precision,
  tank_material text,
  pressure_start_bar double precision,
  pressure_end_bar double precision,
  weight_kg double precision
);

create table public.dive_profile (
  dive_id uuid not null,
  samples jsonb not null default '[]'::jsonb
);

create table public.sighting (
  dive_id uuid,
  species_id text not null,
  count integer,
  photo_uri text,
  note text,
  identified_by text not null default 'manual',
  seen_at timestamptz not null
);

create table public.collection (
  name text not null,
  description text,
  is_shared boolean not null default false
);

create table public.collection_item (
  collection_id uuid not null,
  species_id text not null
);

create table public.favorite (
  species_id text not null
);

-- Sync columns, index, trigger and row level security, identical for every table.
do $$
declare
  t text;
begin
  foreach t in array array['dive_site', 'dive', 'dive_conditions', 'dive_features', 'dive_equipment',
                           'dive_profile', 'sighting', 'collection', 'collection_item', 'favorite']
  loop
    execute format($f$
      alter table public.%1$I
        add column id uuid primary key,
        add column user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
        add column created_at timestamptz not null,
        add column updated_at timestamptz not null,
        add column deleted_at timestamptz,
        add column synced_at timestamptz not null default clock_timestamp();
      create index %1$s_user_synced on public.%1$I (user_id, synced_at);
      create trigger %1$s_sync_stamp before insert or update on public.%1$I
        for each row execute function public.sync_stamp();
      alter table public.%1$I enable row level security;
      create policy "%1$s: read own" on public.%1$I for select to authenticated
        using ((select auth.uid()) = user_id);
      create policy "%1$s: insert own" on public.%1$I for insert to authenticated
        with check ((select auth.uid()) = user_id);
      create policy "%1$s: update own" on public.%1$I for update to authenticated
        using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
      create policy "%1$s: delete own" on public.%1$I for delete to authenticated
        using ((select auth.uid()) = user_id);
    $f$, t);
  end loop;
end;
$$;

-- Public dive sites can be read (not changed) by every signed-in user.
create policy "dive_site: read public" on public.dive_site for select to authenticated
  using (is_private = false and deleted_at is null);

-- Own photos of sightings: private bucket, one folder per user.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('sighting-photos', 'sighting-photos', false, 5242880, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do nothing;

create policy "sighting-photos: read own" on storage.objects for select to authenticated
  using (bucket_id = 'sighting-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "sighting-photos: upload own" on storage.objects for insert to authenticated
  with check (bucket_id = 'sighting-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "sighting-photos: update own" on storage.objects for update to authenticated
  using (bucket_id = 'sighting-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "sighting-photos: delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'sighting-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
