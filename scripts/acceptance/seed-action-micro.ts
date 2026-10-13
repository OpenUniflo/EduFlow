/** Publish explicit teaching content, never learner progress or fabricated results. */
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { shortageExposureMicro } from '../../src/demo/learning/shortageExposureMicro.js';
const server = createClient(process.env.ACCEPTANCE_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } });
const fixture = shortageExposureMicro;
const existing = await server.from('micro_learning_paths').select('id,status').eq('id', fixture.path.id).maybeSingle(); assert.ifError(existing.error);
if (existing.data) { assert.equal(existing.data.status, 'published'); console.log('Teaching path already published; not rewriting content.'); }
else {
  assert.ifError((await server.from('micro_learning_paths').insert({ ...fixture.path, status: 'draft' })).error);
  assert.ifError((await server.from('micro_units').insert(fixture.unit)).error);
  assert.ifError((await server.from('micro_steps').insert(fixture.steps)).error);
  assert.ifError((await server.from('micro_learning_paths').update({ status: 'published' }).eq('id', fixture.path.id).eq('status', 'draft')).error);
  console.log(JSON.stringify({ publishedPath: fixture.path.id, steps: fixture.steps.length, officialStateWritten: false }));
}
