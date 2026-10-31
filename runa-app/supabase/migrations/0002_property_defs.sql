-- Пользовательские свойства объектов (этап 1.5).
-- Определение свойства живёт на уровне системы; значения лежат в objects.props по ID свойства.
create table public.property_defs (
  id         uuid primary key,
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  system_id  uuid not null references public.systems(id) on delete cascade,
  name       text not null default '',
  kind       text not null,
  config     jsonb not null default '{}'::jsonb,
  applies_to text[],
  sort_key   text collate "C" not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index property_defs_owner_idx  on public.property_defs (owner_id);
create index property_defs_system_idx on public.property_defs (system_id);

alter table public.property_defs enable row level security;

create policy "property_defs: владелец читает"  on public.property_defs for select to authenticated using ((select auth.uid()) = owner_id);
create policy "property_defs: владелец создаёт" on public.property_defs for insert to authenticated
  with check ((select auth.uid()) = owner_id and public.owns_system(system_id));
create policy "property_defs: владелец меняет"  on public.property_defs for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id and public.owns_system(system_id));
create policy "property_defs: владелец удаляет" on public.property_defs for delete to authenticated using ((select auth.uid()) = owner_id);
