alter table public.viatica_preferences
  add column if not exists starting_assets numeric not null default 0;
