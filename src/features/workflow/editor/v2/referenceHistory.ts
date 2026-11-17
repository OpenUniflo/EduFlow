/**
 * Browser-history adapter for a fixed-reference editor overlay.
 *
 * A reference target is a real, independently addressable Workflow, so the
 * address bar must show `/works/<target>`. The overlay itself is held in the
 * already-mounted parent editor; this module pushes one native history entry
 * per overlay level and coordinates Back/Forward without asking React Router to
 * remount the parent. Nothing here is persisted or treated as authority: a
 * reload starts from the URL alone and opens the target as a normal Workflow.
 */

type ReferenceHistoryEntry = {
  key: string;
  url: string;
  parentPath: string;
  parentHref: string;
  onHistoryClose: () => void;
  canHistoryClose: () => boolean;
  closing: boolean;
  forceClose: boolean;
};

type StackEntry = Pick<ReferenceHistoryEntry, "url" | "parentPath"> &
  Partial<Pick<ReferenceHistoryEntry, "key" | "canHistoryClose" | "forceClose">>;

export type ReferencePopResolution = {
  /** Index of the first entry to close; entries.length closes none. */
  closeFrom: number;
  /** The URL still belongs to this overlay stack, so the router must not remount. */
  stopRouter: boolean;
};

/** Pure Back/Forward decision so nested overlays can be tested without a DOM. */
export function resolveReferencePopState(pathname: string, entries: readonly StackEntry[]): ReferencePopResolution {
  if (!entries.length) return { closeFrom: 0, stopRouter: false };
  const top = entries[entries.length - 1];
  // Forward to the overlay's own URL while its level is still mounted.
  if (pathname === top.url) return { closeFrom: entries.length, stopRouter: true };
  // Back (or go(n)) to a caller URL closes that level and every level above it.
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (entries[index].parentPath === pathname) return { closeFrom: index, stopRouter: true };
  }
  // A skipped level whose own target URL was reached keeps that level visible.
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (entries[index].url === pathname) return { closeFrom: index + 1, stopRouter: true };
  }
  return { closeFrom: 0, stopRouter: false };
}

export type ReferenceHistoryBackPlan =
  | { kind: "router" }
  | { kind: "keep" }
  | { kind: "close"; closeFrom: number; stopRouter: boolean }
  | { kind: "restore"; closeFrom: number; restoreSteps: number };

/**
 * Browser Back must ask the same question as the visible return action before
 * it discards a target draft. This pure plan distinguishes a clean close from a
 * protected one and tells the caller how many native entries to walk forward to
 * restore the addressable target URL without pushing a duplicate entry.
 */
export function planReferenceHistoryBack(pathname: string, entries: readonly StackEntry[]): ReferenceHistoryBackPlan {
  if (!entries.length) return { kind: "router" };
  const resolution = resolveReferencePopState(pathname, entries);
  if (resolution.closeFrom >= entries.length) return { kind: "keep" };
  const needsConfirmation = entries.slice(resolution.closeFrom).some(entry => {
    if (entry.forceClose) return false;
    return entry.canHistoryClose ? !entry.canHistoryClose() : false;
  });
  if (needsConfirmation) return { kind: "restore", closeFrom: resolution.closeFrom, restoreSteps: entries.length - resolution.closeFrom };
  return { kind: "close", closeFrom: resolution.closeFrom, stopRouter: resolution.stopRouter };
}

const entries: ReferenceHistoryEntry[] = [];
const rememberedParent = new Map<string, { path: string; href: string }>();
const releaseTimers = new Map<string, number>();
const leaveHandlers = new Map<string, () => boolean>();

type PendingHistoryClose = {
  /** Index of the first overlay level the user asked to leave. */
  closeFrom: number;
  /** Waiting for the address bar to walk forward to the still-mounted top level. */
  restoring: boolean;
  /** The editor that currently shows the leave dialog, if any. */
  promptedKey: string | null;
  restoreAttempts: number;
};

let pendingClose: PendingHistoryClose | null = null;
let restoreTimer: number | null = null;
let continueTimer: number | null = null;

function targetUrl(workflowId: string): string {
  return `/works/${encodeURIComponent(workflowId)}`;
}

function currentHref(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function withoutMarker(state: unknown): unknown {
  if (!state || typeof state !== "object") return state;
  const next = { ...(state as Record<string, unknown>) };
  delete next.eduflowReferenceKey;
  return next;
}

function clearPendingClose(): void {
  pendingClose = null;
  if (restoreTimer !== null) {
    window.clearTimeout(restoreTimer);
    restoreTimer = null;
  }
  if (continueTimer !== null) {
    window.clearTimeout(continueTimer);
    continueTimer = null;
  }
}

function finishRestore(): void {
  if (!pendingClose) return;
  pendingClose.restoring = false;
  if (restoreTimer !== null) {
    window.clearTimeout(restoreTimer);
    restoreTimer = null;
  }
  requestPendingConfirmation();
}

function restoreTop(steps: number): void {
  if (!pendingClose) return;
  if (restoreTimer !== null) window.clearTimeout(restoreTimer);
  window.history.go(steps);
  // Forward history is expected to exist after Back. If a browser cannot walk
  // it (for example an extension rewrote history), keep the target addressable
  // rather than leaving the editor mounted under a caller URL.
  restoreTimer = window.setTimeout(() => {
    restoreTimer = null;
    if (!pendingClose?.restoring) return;
    const top = entries[entries.length - 1];
    if (top) window.history.pushState({ ...(window.history.state ?? {}), eduflowReferenceKey: top.key }, "", top.url);
    finishRestore();
  }, 600);
}

function requestPendingConfirmation(): void {
  if (!pendingClose || pendingClose.restoring) return;
  if (entries.length <= pendingClose.closeFrom) {
    clearPendingClose();
    return;
  }
  const top = entries[entries.length - 1];
  if (top.forceClose || top.canHistoryClose()) {
    pendingClose.promptedKey = null;
    closeReferenceHistory(top.key);
    return;
  }
  if (pendingClose.promptedKey === top.key) return;
  const handler = leaveHandlers.get(top.key);
  if (!handler) {
    // No mounted editor can own this draft (for example a stale entry during
    // teardown). Keep the current level mounted and let the next Back retry.
    clearPendingClose();
    return;
  }
  pendingClose.promptedKey = top.key;
  if (!handler()) {
    // The draft settled between planning and prompting (for example autosave).
    // The mounted editor says it is clean, so close without inventing a
    // confirmation or leaving a stale pending request behind.
    pendingClose.promptedKey = null;
    closeReferenceHistory(top.key);
  }
}

function schedulePendingConfirmation(): void {
  if (!pendingClose || pendingClose.restoring || continueTimer !== null) return;
  continueTimer = window.setTimeout(() => {
    continueTimer = null;
    requestPendingConfirmation();
  }, 30);
}

function closeEntriesFrom(closeFrom: number): void {
  const closing = entries.slice(closeFrom);
  entries.splice(closeFrom);
  for (const entry of closing.reverse()) {
    entry.closing = false;
    rememberedParent.delete(entry.key);
    entry.onHistoryClose();
  }
  schedulePendingConfirmation();
}

function onPopState(event: PopStateEvent) {
  if (!entries.length) return;
  if (pendingClose?.restoring) {
    event.stopImmediatePropagation();
    const top = entries[entries.length - 1];
    if (!top) { clearPendingClose(); return; }
    // A fast second Back can ask for an older ancestor while the first restore
    // is still walking forward; never narrow the set of levels to protect.
    const requested = resolveReferencePopState(window.location.pathname, entries);
    if (requested.closeFrom < pendingClose.closeFrom) pendingClose.closeFrom = requested.closeFrom;
    if (window.location.pathname === top.url) { finishRestore(); return; }
    // A single Back can skip several entries (or leave the overlay stack), so
    // walk forward one entry at a time until the mounted top URL is restored.
    if (pendingClose.restoreAttempts >= 50) {
      if (restoreTimer !== null) { window.clearTimeout(restoreTimer); restoreTimer = null; }
      window.history.pushState({ ...(window.history.state ?? {}), eduflowReferenceKey: top.key }, "", top.url);
      finishRestore();
      return;
    }
    pendingClose.restoreAttempts += 1;
    restoreTop(1);
    return;
  }
  const plan = planReferenceHistoryBack(window.location.pathname, entries);
  if (plan.kind === "router") return;
  if (plan.kind === "keep") { event.stopImmediatePropagation(); return; }
  if (plan.kind === "restore") {
    // Stay on the overlay and restore its URL before showing the leave dialog.
    event.stopImmediatePropagation();
    if (!pendingClose) pendingClose = { closeFrom: plan.closeFrom, restoring: true, promptedKey: null, restoreAttempts: 0 };
    else {
      pendingClose.closeFrom = Math.min(pendingClose.closeFrom, plan.closeFrom);
      pendingClose.restoring = true;
    }
    restoreTop(plan.restoreSteps);
    return;
  }
  if (plan.stopRouter) event.stopImmediatePropagation();
  closeEntriesFrom(plan.closeFrom);
}

function removeEntry(entry: ReferenceHistoryEntry) {
  const index = entries.indexOf(entry);
  if (index >= 0) entries.splice(index, 1);
}

/**
 * Registers one overlay level and, unless this exact entry already owns the
 * current URL (React StrictMode re-runs effects), pushes its addressable URL.
 */
export function openReferenceHistory({ key, targetWorkflowId, onHistoryClose, canHistoryClose = () => true }: {
  key: string;
  targetWorkflowId: string;
  onHistoryClose: () => void;
  canHistoryClose?: () => boolean;
}): void {
  if (typeof window === "undefined") return;
  const existing = entries.find(entry => entry.key === key);
  if (existing) { existing.onHistoryClose = onHistoryClose; existing.canHistoryClose = canHistoryClose; return; }
  const timer = releaseTimers.get(key);
  if (timer !== undefined) { window.clearTimeout(timer); releaseTimers.delete(key); }
  const url = targetUrl(targetWorkflowId);
  const markerMatches = window.history.state?.eduflowReferenceKey === key;
  const remembered = rememberedParent.get(key);
  let parentPath: string;
  let parentHref: string;
  if (markerMatches && remembered) {
    parentPath = remembered.path; parentHref = remembered.href;
  } else {
    parentPath = window.location.pathname;
    parentHref = currentHref();
    rememberedParent.set(key, { path: parentPath, href: parentHref });
    window.history.pushState({ ...(window.history.state ?? {}), eduflowReferenceKey: key }, "", url);
  }
  entries.push({ key, url, parentPath, parentHref, onHistoryClose, canHistoryClose, closing: false, forceClose: false });

}

/**
 * The mounted editor registers the same actionable leave dialog used by its
 * visible return button. Browser Back calls this instead of silently refusing.
 */
export function registerReferenceHistoryLeave(key: string, handler: () => boolean): () => void {
  leaveHandlers.set(key, handler);
  return () => { if (leaveHandlers.get(key) === handler) leaveHandlers.delete(key); };
}

/** "Continue editing" cancels only the pending browser-Back request. */
export function cancelReferenceHistoryLeave(key: string): void {
  if (pendingClose?.promptedKey !== key) return;
  clearPendingClose();
}

/**
 * Closes one level. The normal path walks history back so the parent entry is
 * restored; the popstate handler completes the React cleanup and suppresses
 * the router remount. Returns false when the level was never registered, e.g.
 * a close clicked before its mount effect ran.
 */
export function closeReferenceHistory(key: string): boolean {
  if (typeof window === "undefined") return false;
  const entry = entries.find(item => item.key === key);
  if (!entry) return false;
  if (entry.closing) return true;
  if (pendingClose?.promptedKey === key) pendingClose.promptedKey = null;
  entry.forceClose = true;
  if (window.location.pathname !== entry.url) {
    removeEntry(entry);
    rememberedParent.delete(key);
    entry.onHistoryClose();
    schedulePendingConfirmation();
    return true;
  }
  entry.closing = true;
  window.history.back();
  window.setTimeout(() => {
    if (!entries.includes(entry) || !entry.closing) return;
    window.history.replaceState(withoutMarker(window.history.state), "", entry.parentHref);
    removeEntry(entry);
    entry.closing = false;
    rememberedParent.delete(key);
    entry.onHistoryClose();
    schedulePendingConfirmation();
  }, 900);
  return true;
}

/** Unmount bookkeeping; never changes the current URL or closes the overlay. */
export function releaseReferenceHistory(key: string): void {
  if (typeof window === "undefined") return;
  const entry = entries.find(item => item.key === key);
  if (entry) removeEntry(entry);
  if (pendingClose?.promptedKey === key) clearPendingClose();
  // Keep the parent memory briefly so StrictMode's setup/cleanup/setup cycle
  // does not push the same URL twice.
  const timer = releaseTimers.get(key);
  if (timer !== undefined) {
    window.clearTimeout(timer);
  }
  releaseTimers.set(key, window.setTimeout(() => {
    releaseTimers.delete(key);
    rememberedParent.delete(key);
  }, 1000));
}

// Registered while App's static imports are evaluated, i.e. before
// createBrowserRouter adds its own popstate listener. At the window target both
// listeners run in registration order, so this one can suppress the router's
// remount while a reference stack owns the URL.
if (typeof window !== "undefined") window.addEventListener("popstate", onPopState, true);
