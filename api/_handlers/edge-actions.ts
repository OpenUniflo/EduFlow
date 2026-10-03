import { z } from 'zod';
import { createServerSupabase, createUserSupabase } from '../_lib/supabase.js';
import { ApiError, handleApi, json, methodNotAllowed } from '../_lib/http.js';
import { allRows, dataOrThrow } from '../_lib/query.js';
import { requirePublishedCourse } from '../_lib/courseMembership.js';
const id = z.string().min(1).max(512);
const template = z.object({ id: z.uuid().optional(), edge_id: id, type: z.enum(['micro_learning', 'practice_task']), title: z.string().trim().min(1).max(240), description: z.string().max(12000), estimated_minutes: z.number().int().min(1).max(10080), difficulty: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]), resource_requirements: z.array(id).max(30), required_capability_ids: z.array(id).max(30), expected_evidence: z.string().trim().min(1).max(12000), status: z.enum(['active', 'archived']) }).strict();
const binding = z.object({ course_id: id, action_id: z.uuid(), context: z.string().max(12000), contact: z.string().max(2000), instructions: z.string().max(12000), resources: z.array(z.object({ key: id, label: z.string().max(240), reference: z.string().max(4000), available: z.boolean() }).strict()).max(30), available: z.boolean() }).strict();
const bodySchema = z.discriminatedUnion('action', [z.object({ action: z.literal('save-template'), template }).strict(), z.object({ action: z.literal('save-binding'), binding }).strict()]);
export default handleApi(async (request, response) => {
  const { client, user } = await createUserSupabase(request);
  response.setHeader('Cache-Control', 'private, no-store');
  if (request.method === 'GET') {
    const courseId = typeof request.query.courseId === 'string' ? request.query.courseId : '';
    if (!courseId) throw new ApiError(400, 'course_required', 'courseId is required');
    await requirePublishedCourse(client, courseId);
    const [actions, bindings] = await Promise.all([
      allRows(client.from('knowledge_edge_actions').select('*').eq('status', 'active').order('id'), 'Global edge actions'),
      allRows(client.from('course_action_bindings').select('*').eq('course_id', courseId).order('id'), 'Course action resources'),
    ]);
    json(response, 200, { actions, bindings }); return;
  }
  if (request.method !== 'POST') return methodNotAllowed(response, ['GET', 'POST']);
  const parsed = bodySchema.safeParse(request.body);
  if (!parsed.success) throw new ApiError(400, 'invalid_action_request', 'Invalid edge action request');
  const server = createServerSupabase();
  const roleResult = await server.from('profiles').select('role').eq('id', user.id).single();
  const profile = dataOrThrow(roleResult.data, roleResult.error, 'Action governance authority');
  const body = parsed.data;
  if (body.action === 'save-template') {
    if (profile.role !== 'admin') throw new ApiError(403, 'global_action_forbidden', 'Global administrator required');
    const value = { ...body.template, provenance: { kind: 'admin', actor_id: user.id } };
    const result = body.template.id ? await server.from('knowledge_edge_actions').update(value).eq('id', body.template.id).select().single() : await server.from('knowledge_edge_actions').insert(value).select().single();
    if (result.error?.code === '23514') throw new ApiError(422, 'invalid_action_edge', '行动必须属于有效的全局能力关系，执行类型和关系不可更改。');
    json(response, 200, { action: dataOrThrow(result.data, result.error, 'Save global action') }); return;
  }
  // Match the existing teacher/admin authoring role; also require visible course ownership context.
  if (!['teacher', 'admin'].includes(profile.role)) throw new ApiError(403, 'binding_forbidden', 'Teacher or administrator required');
  await requirePublishedCourse(client, body.binding.course_id);
  const templateResult = await client.from('knowledge_edge_actions').select('id').eq('id', body.binding.action_id).eq('status', 'active').maybeSingle();
  if (!dataOrThrow(templateResult.data, templateResult.error, 'Binding template')) throw new ApiError(404, 'action_not_found', 'Active action not found');
  const result = await server.from('course_action_bindings').upsert({ ...body.binding, updated_at: new Date().toISOString() }, { onConflict: 'course_id,action_id' }).select().single();
  json(response, 200, { binding: dataOrThrow(result.data, result.error, 'Save course resources') });
});
