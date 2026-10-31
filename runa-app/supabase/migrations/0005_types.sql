-- Фаза A: пользовательские типы объектов, типы связей, дополнительные типы у объекта.
create table public.object_types (
  id         uuid primary key,
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  system_id  uuid not null references public.systems(id) on delete cascade,
  name       text not null default '',
  icon       text,
  color      text,
  sort_key   text collate "C" not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index object_types_owner_idx  on public.object_types (owner_id);
create index object_types_system_idx on public.object_types (system_id);

create table public.relation_types (
  id           uuid primary key,
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  system_id    uuid not null references public.systems(id) on delete cascade,
  name         text not null default '',
  inverse_name text not null default '',
  directed     boolean not null default true,
  acyclic      boolean not null default false,
  color        text,
  sort_key     text collate "C" not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index relation_types_owner_idx  on public.relation_types (owner_id);
create index relation_types_system_idx on public.relation_types (system_id);

alter table public.objects add column extra_types text[] not null default '{}';

alter table public.object_types   enable row level security;
alter table public.relation_types enable row level security;
-- политики: владелец читает/создаёт/меняет/удаляет (как для остальных таблиц системы)
