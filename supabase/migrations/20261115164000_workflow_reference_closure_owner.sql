-- SECURITY DEFINER is required to reach the private resolver. The function is
-- not a public bypass: it rejects any owner other than the authenticated caller
-- and service_role calls still pass an explicit owner. RLS is therefore kept
-- explicit for this read-only projection.
create or replace function public.workflow_v2_reference_closure(
  p_owner uuid,
  p_workflow text,
  p_revision integer
) returns jsonb language plpgsql security definer set search_path='' as $$
declare definition jsonb;
begin
  if (select auth.uid()) is distinct from p_owner then
    raise exception 'NOT_FOUND';
  end if;
  select revision.definition into definition
  from public.workflow_revisions revision
  where revision.owner_user_id=p_owner
    and revision.workflow_id=p_workflow
    and revision.revision=p_revision;
  if definition is null then raise exception 'NOT_FOUND'; end if;
  return workflow_private.workflow_reference_resolve(p_owner, definition);
end $$;

revoke all on function public.workflow_v2_reference_closure(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.workflow_v2_reference_closure(uuid,text,integer) to authenticated,service_role;
notify pgrst, 'reload schema';
