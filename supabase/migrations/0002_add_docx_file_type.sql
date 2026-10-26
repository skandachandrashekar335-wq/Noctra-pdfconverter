-- Add structural DOCX conversions to an existing Noctra history table.
-- Safe to run after 0001; no rows are rewritten.

alter table public.conversions
  drop constraint if exists conversions_file_type_check;

alter table public.conversions
  add constraint conversions_file_type_check
  check (file_type in ('pdf', 'docx', 'pptx'));
