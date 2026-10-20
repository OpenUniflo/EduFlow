create function workflow_private.p5_delete_workflow_memory() returns trigger language plpgsql security definer set search_path='' as $$
declare segment text; begin
 segment:='w-'||left(encode(sha256(convert_to(to_json(old.workflow_id)::text,'UTF8')),'hex'),24);
 delete from workflow_memory.store where prefix like old.owner_user_id::text||'.%.'||segment||'.%';
 return old;
end $$;
revoke all on function workflow_private.p5_delete_workflow_memory() from public,anon,authenticated;
create trigger workflow_p5_delete_private_memory after delete on public.workflow_v2_definitions for each row execute function workflow_private.p5_delete_workflow_memory();
