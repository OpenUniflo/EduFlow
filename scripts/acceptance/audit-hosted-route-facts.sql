-- Read-only export for audit-hosted-route-facts.ts. This is not a visibility/RLS audit.
-- Save the `audit` JSON object locally; publish only the summary report, not raw state inputs.
select jsonb_build_object(
 'nodes',(select jsonb_agg(id order by id) from knowledge_nodes where status='active'),
 'edges',(select jsonb_agg(jsonb_build_object(
   'id',id,'source',source_node_id,'target',target_node_id,'relation',relation,
   'strength',case when relation='prerequisite' then to_jsonb(prerequisite_strength) else to_jsonb(associative_strength) end
 ) order by id) from knowledge_edges where lifecycle_status='active' and relation in ('prerequisite','enables')),
 'courses',(select jsonb_agg(jsonb_build_object(
   'id',c.id,
   'order',(select coalesce(jsonb_agg(jsonb_build_object('nodeId',cc.node_id,'lessonOrder',cl.display_order,'coverageOrder',cc.display_order)),'[]'::jsonb)
     from curriculum_coverages cc join curriculum_lessons cl on cl.id=cc.lesson_id and cl.course_id=cc.course_id where cc.course_id=c.id),
   'routes',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',v.id,'version',v.version_number,'includeNodeIds',v.include_node_ids,'excludeNodeIds',v.exclude_node_ids,
      'currentNodeIds',(select coalesce(jsonb_agg(s.node_id),'[]'::jsonb) from user_knowledge_states s where s.user_id=v.user_id and s.status in ('learned','practicing','mastered'))
   )),'[]'::jsonb) from personal_course_routes pr join personal_course_route_versions v on v.id=pr.active_version_id where pr.course_id=c.id)
 ) order by c.id) from courses c where c.lifecycle='published')
) as audit;
