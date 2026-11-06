import { expect, it, vi } from 'vitest';
import { tool } from 'ai';
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
import { z } from 'zod';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const mocks = vi.hoisted(() => ({ provider: vi.fn(), client: vi.fn(), tools: vi.fn() }));
vi.mock('@ai-sdk/openai-compatible', () => ({ createOpenAICompatible: () => mocks.provider }));
vi.mock('../../api/_lib/supabase.js', () => ({ createUserSupabase: mocks.client }));
vi.mock('../../api/_lib/env.js', () => ({ readLlmEnvironment: () => ({ llmModel: 'test-model', llmBaseUrl: 'https://test.invalid', llmApiKey: 'test-only' }) }));
vi.mock('../../api/_lib/assistantTools.js', () => ({ createAssistantTools: mocks.tools }));
import handler from '../../api/assistant';

type Mode = 'tool-once' | 'multi-tool' | 'natural-text' | 'leak-final' | 'empty-final' | 'incomplete-final';

function toolCallStream() {
  return {
    stream: simulateReadableStream({
      chunks: [
        { type: 'stream-start', warnings: [] },
        { type: 'tool-call', toolCallId: crypto.randomUUID(), toolName: 'lookup', input: '{}' },
        { type: 'finish', finishReason: { unified: 'tool-calls', raw: 'tool_calls' }, usage: usage() }
      ] as any
    }),
    warnings: []
  };
}

function simulatedText(delta: string, finish = 'stop') {
  const chunks: any[] = [{ type: 'stream-start', warnings: [] }];
  if (delta) {
    chunks.push({ type: 'text-start', id: 'answer' }, { type: 'text-delta', id: 'answer', delta }, { type: 'text-end', id: 'answer' });
  }
  chunks.push({ type: 'finish', finishReason: { unified: finish, raw: finish }, usage: usage() });
  return { stream: simulateReadableStream({ chunks }), warnings: [] };
}

function usage() {
  return { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } };
}

function harness(mode: Mode) {
  const records: Array<Record<string, any>> = [];
  const tables: string[] = [];
  const client = {
    from(table: string) {
      tables.push(table);
      const query: any = {
        select() { return query; },
        eq() { return query; },
        in() { return query; },
        or() { return query; },
        order() { return query; },
        limit() { return query; },
        insert(value: Record<string, any> | Array<Record<string, any>>) {
          for (const row of Array.isArray(value) ? value : [value]) records.push({ ...row, id: String(records.length), sequence: records.length });
          return query;
        },
        update() { return query; },
        maybeSingle: async () => ({ data: table === 'assistant_sessions' ? { id: 'owned-session', user_id: 'owned' } : null, error: null }),
        single: async () => ({ data: table === 'assistant_sessions' ? { id: 'owned-session', user_id: 'owned' } : null, error: null }),
        then(resolve: (result: unknown) => unknown) {
          const data = table === 'assistant_messages' ? [...records].reverse() : null;
          return Promise.resolve({ data, error: null }).then(resolve);
        }
      };
      return query;
    }
  };
  mocks.client.mockResolvedValue({ client, user: { id: 'owned' } });
  const read = vi.fn(async () => ({ title: 'Actual visible course' }));
  mocks.tools.mockReturnValue({ lookup: tool({ inputSchema: z.object({}), execute: read }) });
  let phase1Calls = 0;
  const model = new MockLanguageModelV4({
    doStream: async (options) => {
      phase1Calls += 1;
      if (mode === 'leak-final') return phase1Calls === 1 ? toolCallStream() : simulatedText('<｜｜DSML｜｜ calls>\n<｜｜DSML｜｜ invoke name="lookup">');
      if (mode === 'incomplete-final') return phase1Calls === 1 ? toolCallStream() : simulatedText('这是半句话，推理还在展开而纯行动的');
      if (mode === 'empty-final') return simulatedText('');
      if (mode === 'natural-text') return simulatedText('Natural final answer.');
      if (mode === 'multi-tool') return phase1Calls <= 3 ? toolCallStream() : simulatedText('Natural final answer.');
      return phase1Calls === 1 ? toolCallStream() : simulatedText('Natural final answer.');
    }
  });
  mocks.provider.mockReturnValue(model);
  return { records, tables, read, model };
}

async function call(response: ReturnType<typeof responseRecorder>, body: Record<string, unknown> = {}) {
  await handler(
    { method: 'POST', headers: {}, query: {}, body: { sessionId: 'owned-session', messages: [{ id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Which course is available?' }] }], context: { workspace: 'courses', experienceMode: 'learn' }, ...body } } as VercelRequest,
    response.response
  );
}

function responseRecorder() {
  let status = 0;
  let output = '';
  let body: unknown;
  const headers: Record<string, string> = {};
  const response = {
    writableFinished: false,
    destroyed: false,
    status(code: number) { status = code; return response; },
    json(value: unknown) { body = value; return response; },
    setHeader(key: string, value: string) { headers[key.toLocaleLowerCase()] = value; },
    setHeaders(values: Record<string, string>) { for (const [key, value] of Object.entries(values)) response.setHeader(key, value); },
    writeHead(code: number) { status = code; },
    write(chunk: Uint8Array | string) { output += typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk); return true; },
    flush() { return undefined; },
    once() { return response; },
    end() { response.writableFinished = true; },
    on() { return response; },
    removeListener() { return response; }
  };
  return { response: response as unknown as VercelResponse, status: () => status, output: () => output, body: () => body, headers: () => headers };
}

it('streams one bounded answer loop with research + card tools', async () => {
  const { records, read, model } = harness('tool-once');
  const recorder = responseRecorder();
  await call(recorder);
  expect(recorder.status()).toBe(200);
  expect(recorder.output()).toContain('Natural final answer.');
  expect(read).toHaveBeenCalledTimes(1);
  expect(model.doStreamCalls).toHaveLength(2);
  expect(records.filter((record) => record.role === 'assistant')).toEqual([expect.objectContaining({ content: 'Natural final answer.' })]);
  expect(new Set(recorder.output().match(/"type":"[a-z-]+"/g) ?? []).size).toBeGreaterThan(0);
});

it('handles several tool rounds and still produces one clean answer', async () => {
  const { records, read, model } = harness('multi-tool');
  const recorder = responseRecorder();
  await call(recorder);
  expect(recorder.status()).toBe(200);
  expect(recorder.output()).toContain('Natural final answer.');
  expect(read).toHaveBeenCalledTimes(3);
  expect(model.doStreamCalls).toHaveLength(4);
  expect(records.filter((record) => record.role === 'assistant')).toHaveLength(1);
});

it('streams an answer with no tool call', async () => {
  const { model } = harness('natural-text');
  const recorder = responseRecorder();
  await call(recorder);
  expect(recorder.status()).toBe(200);
  expect(recorder.output()).toContain('Natural final answer.');
  expect(model.doStreamCalls).toHaveLength(1);
});

it('does not send a marked protocol leak back to the model', async () => {
  const { records, model } = harness('natural-text');
  records.push(
    { id: 'old-user', sequence: 0, role: 'user', content: 'earlier question', message_kind: 'utterance', invalid_reason: null },
    { id: 'old-leak', sequence: 1, role: 'assistant', content: '<｜｜DSML｜｜ calls>\n<｜｜DSML｜｜ invoke name="lookup">', message_kind: 'utterance', invalid_reason: 'protocol_leak' }
  );
  const recorder = responseRecorder();
  await call(recorder);
  expect(recorder.status()).toBe(200);
  const sent = (model.doStreamCalls[0] as any).prompt as Array<{ role: string; content: unknown }>;
  const serialized = JSON.stringify(sent);
  expect(serialized).not.toContain('DSML');
  expect(serialized).toContain('earlier question');
  expect(serialized).toContain('Which course is available?');
});

it('surfaces a protocol leak as a stream error and persists no assistant row', async () => {
  const { records, model } = harness('leak-final');
  const recorder = responseRecorder();
  await call(recorder);
  expect(recorder.status()).toBe(200);
  expect(recorder.output()).not.toContain('DSML');
  expect(recorder.output()).not.toContain('Natural final answer.');
  expect(model.doStreamCalls).toHaveLength(2);
  expect(records.filter((record) => record.role === 'assistant')).toEqual([]);
});

it('marks a mid-sentence answer as incomplete and persists nothing', async () => {
  const { records } = harness('incomplete-final');
  const recorder = responseRecorder();
  await call(recorder);
  expect(recorder.status()).toBe(200);
  expect(recorder.output()).toContain('data-incomplete');
  expect(records.filter((record) => record.role === 'assistant')).toEqual([]);
});

it('does not persist an empty final answer', async () => {
  const { records } = harness('empty-final');
  const recorder = responseRecorder();
  await call(recorder);
  expect(recorder.status()).toBe(200);
  expect(records.filter((record) => record.role === 'assistant')).toEqual([]);
});

it('stores card parts as object references only', async () => {
  const { records } = harness('tool-once');
  const recorder = responseRecorder();
  await call(recorder);
  const assistant = records.find((record) => record.role === 'assistant') as Record<string, any>;
  expect(Array.isArray(assistant.parts)).toBe(true);
  expect(JSON.stringify(assistant.parts)).not.toContain('display');
});
