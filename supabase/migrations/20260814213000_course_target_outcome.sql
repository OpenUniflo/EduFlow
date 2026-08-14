alter table public.courses
  add column target_outcome text;

alter table public.courses
  add constraint courses_target_outcome_nonempty check (target_outcome is null or length(btrim(target_outcome)) > 0);
