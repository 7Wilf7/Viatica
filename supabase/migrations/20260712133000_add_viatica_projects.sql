create table if not exists public.viatica_projects (
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 80),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, name)
);

create index if not exists viatica_projects_user_updated_at_idx
  on public.viatica_projects (user_id, updated_at desc);

alter table public.viatica_projects enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'viatica_projects'
      and policyname = 'viatica_projects_owner_all'
  ) then
    create policy viatica_projects_owner_all
      on public.viatica_projects
      for all
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;

grant select, insert, update, delete on public.viatica_projects to authenticated;
