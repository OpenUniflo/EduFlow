-- `writes` follows the existing node mapping shape: key = parent State field,
-- value = JSON Pointer into the child output. Output compatibility therefore
-- checks the pointer's first field, not the parent State field name.
CREATE OR REPLACE FUNCTION workflow_private.workflow_reference_mapping_check(
  p_target_definition jsonb,
  p_inputs jsonb,
  p_writes jsonb
) RETURNS void LANGUAGE plpgsql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
declare
  schema jsonb;
  required_field text;
  supplied_field text;
  output_pointer text;
  output_field text;
begin
  if jsonb_typeof(p_inputs) <> 'object' or jsonb_typeof(p_writes) <> 'object' then
    raise exception 'WORKFLOW_REFERENCE_MAPPING';
  end if;
  schema := p_target_definition->'inputSchema';
  if jsonb_typeof(schema)='object' then
    if jsonb_typeof(schema->'required')='array' then
      for required_field in select jsonb_array_elements_text(schema->'required') loop
        if not (p_inputs ? required_field) then raise exception 'WORKFLOW_REFERENCE_MAPPING'; end if;
      end loop;
    end if;
    if schema->'additionalProperties'='false'::jsonb then
      for supplied_field in select jsonb_object_keys(p_inputs) loop
        if not (coalesce(schema->'properties','{}'::jsonb) ? supplied_field) then raise exception 'WORKFLOW_REFERENCE_MAPPING'; end if;
      end loop;
    end if;
  end if;
  schema := p_target_definition->'outputSchema';
  if jsonb_typeof(schema)='object' and schema->'additionalProperties'='false'::jsonb then
    for supplied_field, output_pointer in select key,value from jsonb_each_text(p_writes) loop
      if output_pointer='' then continue; end if;
      if left(output_pointer,1)<>'/' then raise exception 'WORKFLOW_REFERENCE_MAPPING'; end if;
      output_field := split_part(substr(output_pointer,2),'/',1);
      output_field := replace(replace(output_field,'~1','/'),'~0','~');
      if not (coalesce(schema->'properties','{}'::jsonb) ? output_field) then
        raise exception 'WORKFLOW_REFERENCE_MAPPING';
      end if;
    end loop;
  end if;
end $$;

revoke all on function workflow_private.workflow_reference_mapping_check(jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function workflow_private.workflow_reference_mapping_check(jsonb,jsonb,jsonb) to service_role;
notify pgrst, 'reload schema';
