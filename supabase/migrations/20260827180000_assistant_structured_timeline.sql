alter table public.assistant_messages
  add column structured_content jsonb;

alter table public.assistant_messages
  add constraint assistant_messages_structured_content_object
  check (structured_content is null or jsonb_typeof(structured_content) = 'object');

comment on column public.assistant_messages.structured_content is
  'Versioned learner-facing timeline content. The owning session RLS remains authoritative.';
