/** Floating inspector width helpers. Presentation-only: never touches React Flow or layout. */
export const INSPECTOR_MIN_WIDTH = 360;
export const INSPECTOR_MAX_WIDTH = 720;
export const INSPECTOR_DEFAULT_WIDTH = 460;
export const INSPECTOR_WIDE_WIDTH = 640;
export const INSPECTOR_WIDTH_STORAGE_KEY = "eduflow.workflow.inspectorWidth";

type ReadableStorage = { getItem(key: string): string | null } | null | undefined;
type WritableStorage = { setItem(key: string, value: string): void } | null | undefined;

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
}

/** Rounds and clamps a dragged width into the supported inspector range. */
export function clampPanelWidth(value: number, min = INSPECTOR_MIN_WIDTH, max = INSPECTOR_MAX_WIDTH): number {
  if (!Number.isFinite(value)) return min;
  const lower = Math.min(min, max), upper = Math.max(min, max);
  return Math.min(upper, Math.max(lower, Math.round(value)));
}

/** Reads the persisted inspector width; invalid or unreadable values fall back to null. */
export function readStoredPanelWidth(storage?: ReadableStorage): number | null {
  const target = storage === undefined ? browserStorage() : storage;
  if (!target) return null;
  try {
    const raw = target.getItem(INSPECTOR_WIDTH_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? clampPanelWidth(parsed) : null;
  } catch { return null; }
}

/** Persists the inspector width; storage failures are ignored because this is an optional preference. */
export function storePanelWidth(width: number, storage?: WritableStorage): void {
  const target = storage === undefined ? browserStorage() : storage;
  if (!target) return;
  try { target.setItem(INSPECTOR_WIDTH_STORAGE_KEY, String(clampPanelWidth(width))); } catch { /* ignore */ }
}
