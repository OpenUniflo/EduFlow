-- Stage 3: ordered assistant timeline parts and idempotent action records.
--
-- `parts` stores the AI SDK UI message parts. Card parts keep only stable
-- object references; display data is re-read from current product state.
-- Legacy rows keep their `content` and `structured_content` and are rendered
-- through the same timeline without a destructive backfill.

alter table public.assistant_messages
  add column if not exists parts jsonb;

alter table public.assistant_messages
  add constraint assistant_messages_parts_array
  check (parts is null or jsonb_typeof(parts) = 'array') not valid;

alter table public.assistant_messages
  validate constraint assistant_messages_parts_array;

comment on column public.assistant_messages.parts is
  'Ordered AI SDK UI message parts (text + display card references). Null for legacy rows; the API synthesizes parts from content/structured_content.';

-- Button-action replies are written by the server and must not duplicate when
-- a client retries or an evaluation result is recorded more than once.
alter table public.assistant_messages
  add column if not exists dedupe_key text;

create unique index if not exists assistant_messages_dedupe_key_idx
  on public.assistant_messages (dedupe_key)
  where dedupe_key is not null;

comment on column public.assistant_messages.dedupe_key is
  'Server-owned idempotency key for template action replies (for example one evaluation Result).';

-- The attempt remembers the conversation it came from so an evaluation result
-- can appear in that thread after the learner has left the page.
alter table public.learning_attempts
  add column if not exists assistant_session_id uuid references public.assistant_sessions(id) on delete set null;

create index if not exists learning_attempts_assistant_session_idx
  on public.learning_attempts (assistant_session_id)
  where assistant_session_id is not null;
