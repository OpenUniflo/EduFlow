-- Course authoring RPCs run with elevated database privileges and are invoked
-- only by the authenticated Vercel API after its teacher/admin check.
revoke all on function public.save_course_authoring_draft(text, uuid, integer, jsonb, integer)
  from public, anon, authenticated;
revoke all on function public.publish_course_authoring_draft_base(text, integer)
  from public, anon, authenticated;
revoke all on function public.publish_course_authoring_draft(text, integer)
  from public, anon, authenticated;

grant execute on function public.save_course_authoring_draft(text, uuid, integer, jsonb, integer)
  to service_role;
grant execute on function public.publish_course_authoring_draft_base(text, integer)
  to service_role;
grant execute on function public.publish_course_authoring_draft(text, integer)
  to service_role;
