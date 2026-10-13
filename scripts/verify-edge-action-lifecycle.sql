-- Local transactional lifecycle regression; all changes roll back.
begin;
do $$
declare chosen_edge text; action_id uuid;
begin
  select e.id into chosen_edge from knowledge_edges e join knowledge_nodes s on s.id=e.source_node_id join knowledge_nodes t on t.id=e.target_node_id where e.lifecycle_status='active' and e.relation='prerequisite' and s.scope='global' and t.scope='global' and s.status='active' and t.status='active' limit 1;
  insert into knowledge_edge_actions(edge_id,type,title,description,estimated_minutes,difficulty,expected_evidence) values(chosen_edge,'practice_task','archive regression','local only',1,1,'record') returning id into action_id;
  update knowledge_edges set lifecycle_status='deprecated' where id=chosen_edge;
  update knowledge_edge_actions set status='archived' where id=action_id;
  begin
    update knowledge_edge_actions set status='active' where id=action_id;
    raise exception 'Incorrectly reactivated invalid action';
  exception when check_violation then null;
  end;
  raise notice 'PASS stale action can archive but cannot reactivate';
end $$;
rollback;
