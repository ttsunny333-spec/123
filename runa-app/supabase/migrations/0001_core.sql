-- Runa: ядро данных (этап 1).
-- Системы, универсальные объекты с иерархией, типизированные связи.
-- Каждая строка принадлежит владельцу; совместный доступ добавим позже через memberships.

create table public.systems (
  id          uuid primary key,
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null default '',
  icon        text,
  sort_key    text collate "C" not null,
  settings    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz
);
create index systems_owner_idx on public.systems (owner_id);

create table public.objects (
  id          uuid primary key,
  owner_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  system_id   uuid not null references public.systems(id) on delete cascade,
  type        text not null,
  title       text not null default '',
  parent_id   uuid references public.objects(id) on delete cascade deferrable initially deferred,
  sort_key    text collate "C" not null,
  props       jsonb not null default '{}'::jsonb,
  content     jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz,
  constraint objects_not_own_parent check (parent_id is distinct from id)
);
create index objects_owner_idx  on public.objects (owner_id);
create index objects_system_idx on public.objects (system_id);
create index objects_parent_idx on public.objects (parent_id);
create index objects_archived_idx on public.objects (owner_id) where archived_at is not null;

create table public.relationships (
  id         uuid primary key,
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  system_id  uuid not null references public.systems(id) on delete cascade,
  type       text not null,
  from_id    uuid not null references public.objects(id) on delete cascade deferrable initially deferred,
  to_id      uuid not null references public.objects(id) on delete cascade deferrable initially deferred,
  props      jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint relationships_not_self check (from_id <> to_id)
);
create index relationships_owner_idx  on public.relationships (owner_id);
create index relationships_system_idx on public.relationships (system_id);
create index relationships_from_idx   on public.relationships (from_id);
create index relationships_to_idx     on public.relationships (to_id);

-- ---------- RLS ----------
alter table public.systems       enable row level security;
alter table public.objects       enable row level security;
alter table public.relationships enable row level security;

create policy "systems: владелец читает"  on public.systems for select to authenticated using ((select auth.uid()) = owner_id);
create policy "systems: владелец создаёт" on public.systems for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy "systems: владелец меняет"  on public.systems for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "systems: владелец удаляет" on public.systems for delete to authenticated using ((select auth.uid()) = owner_id);

-- Объект можно положить только в собственную систему.
create or replace function public.owns_system(sid uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.systems s where s.id = sid and s.owner_id = (select auth.uid()));
$$;
revoke execute on function public.owns_system(uuid) from public, anon;
grant execute on function public.owns_system(uuid) to authenticated;

create policy "objects: владелец читает"  on public.objects for select to authenticated using ((select auth.uid()) = owner_id);
create policy "objects: владелец создаёт" on public.objects for insert to authenticated
  with check ((select auth.uid()) = owner_id and public.owns_system(system_id));
create policy "objects: владелец меняет"  on public.objects for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id and public.owns_system(system_id));
create policy "objects: владелец удаляет" on public.objects for delete to authenticated using ((select auth.uid()) = owner_id);

create policy "relationships: владелец читает"  on public.relationships for select to authenticated using ((select auth.uid()) = owner_id);
create policy "relationships: владелец создаёт" on public.relationships for insert to authenticated
  with check ((select auth.uid()) = owner_id and public.owns_system(system_id));
create policy "relationships: владелец меняет"  on public.relationships for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id and public.owns_system(system_id));
create policy "relationships: владелец удаляет" on public.relationships for delete to authenticated using ((select auth.uid()) = owner_id);

-- Функция не требует повышенных прав: RLS на systems и так даёт видеть только свои системы.
alter function public.owns_system(uuid) security invoker;
