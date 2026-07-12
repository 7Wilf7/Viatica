create table if not exists public.viatica_preference_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  collection text not null check (collection in ('merchant_rule', 'recurring_transaction')),
  item_key text not null,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (user_id, collection, item_key)
);

create index if not exists viatica_preference_items_user_updated_at_idx
  on public.viatica_preference_items (user_id, updated_at desc);

alter table public.viatica_preference_items enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'viatica_preference_items'
      and policyname = 'viatica_preference_items_owner_all'
  ) then
    create policy viatica_preference_items_owner_all
      on public.viatica_preference_items
      for all
      to authenticated
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end
$$;

grant select, insert, update, delete on public.viatica_preference_items to authenticated;
