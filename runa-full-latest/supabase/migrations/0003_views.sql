-- Представления (этап 2): таблица, канбан и др. Настройки вида — в views.config,
-- положение объекта внутри конкретного вида (порядок в колонке, позиция на холсте) — в view_items.
create table public.views (
  id         uuid primary key,
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  system_id  uuid not null references public.systems(id) on delete cascade,
  host_id    uuid references public.objects(id) on delete cascade deferrable initially deferred,
  kind       text not null,
  name       text not null default '',
  config     jsonb not null default '{}'::jsonb,
  sort_key   text collate "C" not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index views_owner_idx  on public.views (owner_id);
create index views_system_idx on public.views (system_id);
create index views_host_idx   on public.views (host_id);

create table public.view_items (
  id         uuid primary key,
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  system_id  uuid not null references public.systems(id) on delete cascade,
  view_id    uuid not null references public.views(id) on delete cascade deferrable initially deferred,
  object_id  uuid not null references public.objects(id) on delete cascade deferrable initially deferred,
  layout     jsonb not null default '{}'::jsonb,
  unique (view_id, object_id)
);
create index view_items_owner_idx  on public.view_items (owner_id);
create index view_items_system_idx on public.view_items (system_id);
create index view_items_object_idx on public.view_items (object_id);

alter table public.views      enable row level security;
alter table public.view_items enable row level security;

create policy "views: владелец читает"  on public.views for select to authenticated using ((select auth.uid()) = owner_id);
create policy "views: владелец создаёт" on public.views for insert to authenticated
  with check ((select auth.uid()) = owner_id and public.owns_system(system_id));
create policy "views: владелец меняет"  on public.views for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id and public.owns_system(system_id));
create policy "views: владелец удаляет" on public.views for delete to authenticated using ((select auth.uid()) = owner_id);

create policy "view_items: владелец читает"  on public.view_items for select to authenticated using ((select auth.uid()) = owner_id);
create policy "view_items: владелец создаёт" on public.view_items for insert to authenticated
  with check ((select auth.uid()) = owner_id and public.owns_system(system_id));
create policy "view_items: владелец меняет"  on public.view_items for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id and public.owns_system(system_id));
create policy "view_items: владелец удаляет" on public.view_items for delete to authenticated using ((select auth.uid()) = owner_id);
