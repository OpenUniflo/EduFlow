-- Assistant protocol leaks are hidden, not rewritten. The original content is
-- retained for audit, while every model-history and timeline read excludes it.

alter table public.assistant_messages
  add column if not exists invalid_reason text;

comment on column public.assistant_messages.invalid_reason is
  'Set when a persisted assistant reply must not be shown or sent back to a model (for example protocol_leak). Content is retained for audit.';

-- Idempotent backfill: this statement can be executed again without changing
-- already marked rows. Match protocol structure only, never the word "DSML".
update public.assistant_messages
set invalid_reason = 'protocol_leak'
where role = 'assistant'
  and invalid_reason is null
  and content ~* '<[[:space:]]*/?[[:space:]]*[|｜]{1,2}[[:space:]]*DSML[[:space:]]*[|｜]{1,2}';

create index if not exists assistant_messages_invalid_reason_idx
  on public.assistant_messages (session_id)
  where invalid_reason is not null;
