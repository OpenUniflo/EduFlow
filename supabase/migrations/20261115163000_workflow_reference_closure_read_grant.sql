-- The resource-center closure read is called by the authenticated API client so
-- existing owner RLS remains in force. The function is SECURITY INVOKER and its
-- first read of workflow_revisions is RLS-filtered; the resolver only receives
-- that owned Definition. It is not a service-role bypass.
grant execute on function public.workflow_v2_reference_closure(uuid,text,integer) to authenticated;
notify pgrst, 'reload schema';
