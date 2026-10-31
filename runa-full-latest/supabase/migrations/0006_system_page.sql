-- Система как страница: обложка и собственное содержимое (блоки).
alter table public.systems add column cover text;
alter table public.systems add column content jsonb;
