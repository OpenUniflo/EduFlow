-- Forward-only classification for serialized tool-call protocol variants that
-- the first guard did not cover (for example `<tool_use name="...">`).
-- Content is preserved; every list/detail response hides it and every model
-- history read filters it. Idempotent and safe to re-run.

update public.assistant_messages
set invalid_reason = 'protocol_leak'
where role = 'assistant'
  and (invalid_reason is null or invalid_reason = '')
  and (
    content ~* '<\s*/?\s*(tool_use|tool_call|function_call|tool_result|function_result)\b'
    or content ~ '<\s*/?\s*[|｜]{1,2}\s*DSML\s*[|｜]{1,2}'
    or content ~* '(^|\n)[[:space:]]*<(invoke|parameter)[[:space:]]+name[[:space:]]*='
  );
