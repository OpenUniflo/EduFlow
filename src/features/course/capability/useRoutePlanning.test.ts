import { beforeEach, expect, it, vi } from 'vitest';
// A synchronous hook host lets deferred API responses settle in controlled order,
// without coupling this request lifecycle test to a browser renderer.
const host = vi.hoisted(() => ({ slots: [] as any[], index: 0, effects: [] as (() => void)[] }));
vi.mock('react', () => ({
  useState(initial: any) { const i = host.index++; if (!(i in host.slots)) host.slots[i] = typeof initial === 'function' ? initial() : initial; return [host.slots[i], (value: any) => { host.slots[i] = typeof value === 'function' ? value(host.slots[i]) : value; }]; },
  useRef(initial: any) { const i = host.index++; return host.slots[i] ??= { current: initial }; },
  useCallback(fn: any, deps: any[]) { const i = host.index++; const old = host.slots[i]; if (!old || deps.some((d, j) => d !== old.deps[j])) host.slots[i] = { fn, deps }; return host.slots[i].fn; },
  useEffect(fn: any, deps: any[]) { const i = host.index++; const old = host.slots[i]; if (!old || deps.some((d, j) => d !== old.deps[j])) { host.effects.push(() => { old?.cleanup?.(); host.slots[i].cleanup = fn(); }); host.slots[i] = { deps }; } },
}));
vi.mock('@/shared/api/apiClient', () => ({ apiRequest: vi.fn(), ApiRequestError: class extends Error {} }));
import { apiRequest } from '@/shared/api/apiClient';
import { useRoutePlanning } from './useRoutePlanning';
const response = { activeVersion: { id: 'v1', constraints: { includeNodeIds: [], excludeNodeIds: [] } } };
function render(key = 'one') { host.index = 0; const control = useRoutePlanning('course', true, key); host.effects.splice(0).forEach(effect => effect()); return control; }
async function flush() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }
beforeEach(() => { host.slots = []; host.effects = []; vi.mocked(apiRequest).mockReset(); });
it('background refresh cannot unlock a pending preview or publish a preview from an old knowledge revision', async () => {
  vi.mocked(apiRequest).mockResolvedValueOnce(response);
  render(); await flush(); render().begin();
  let resolvePreview!: (value: unknown) => void;
  vi.mocked(apiRequest).mockImplementationOnce(() => new Promise(resolve => { resolvePreview = resolve; }));
  const pending = render().replan();
  vi.mocked(apiRequest).mockResolvedValueOnce(response);
  render('two'); await flush();
  const during = render('two'); expect(during.busy).toBe(true);
  during.mark('new'); expect(render('two').draft.includeNodeIds).toEqual([]);
  resolvePreview({ baseVersionId: 'v1', plan: { valid: true, route: {}, conflicts: [] } });
  await pending;
  expect(render('two').preview).toBeNull(); expect(render('two').busy).toBe(false);
});
it('cancelled editing cannot receive the pending preview', async () => {
  vi.mocked(apiRequest).mockResolvedValueOnce(response);
  render(); await flush(); render().begin();
  let resolvePreview!: (value: unknown) => void;
  vi.mocked(apiRequest).mockImplementationOnce(() => new Promise(resolve => { resolvePreview = resolve; }));
  const pending = render().replan(); render().cancel();
  resolvePreview({ baseVersionId: 'v1', plan: { valid: true, route: {}, conflicts: [] } }); await pending;
  expect(render().preview).toBeNull(); expect(render().editing).toBe(false);
});
