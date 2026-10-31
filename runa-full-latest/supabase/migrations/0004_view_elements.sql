-- Элементы, которые живут только на конкретном холсте: стикеры, рамки, подписи.
create table public.view_elements (
  id         uuid primary key,
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  system_id  uuid not null references public.systems(id) on delete cascade,
  view_id    uuid not null references public.views(id) on delete cascade deferrable initially deferred,
  kind       text not null,
  data       jsonb not null default '{}'::jsonb
);
create index view_elements_owner_idx  on public.view_elements (owner_id);
create index view_elements_system_idx on public.view_elements (system_id);
create index view_elements_view_idx   on public.view_elements (view_id);
create index relationships_type_idx   on public.relationships (system_id, type);

alter table public.view_elements enable row level security;
create policy "view_elements: владелец читает"  on public.view_elements for select to authenticated using ((select auth.uid()) = owner_id);
create policy "view_elements: владелец создаёт" on public.view_elements for insert to authenticated
  with check ((select auth.uid()) = owner_id and public.owns_system(system_id));
create policy "view_elements: владелец меняет"  on public.view_elements for update to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id and public.owns_system(system_id));
create policy "view_elements: владелец удаляет" on public.view_elements for delete to authenticated using ((select auth.uid()) = owner_id);
