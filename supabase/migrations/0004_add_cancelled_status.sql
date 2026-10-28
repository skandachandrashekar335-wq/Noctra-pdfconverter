-- Cancelled browser jobs are distinct from failed conversions.
alter table public.conversions
  drop constraint if exists conversions_status_check;

alter table public.conversions
  add constraint conversions_status_check
  check (status in ('pending', 'processing', 'completed', 'failed', 'cancelled'));
