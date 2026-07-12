alter table public.viatica_transactions
  add column if not exists deleted_at timestamptz;

create index if not exists viatica_transactions_user_deleted_at_idx
  on public.viatica_transactions (user_id, deleted_at);
