/**
 * One Escape rule for every page-level Object Shell. While a modal layer is
 * open, that modal owns the key and the shell behind it must stay open.
 *
 * Native modals expose `dialog[open]`; the app's lightweight confirm/picker
 * overlays are divs with `role="dialog"` and `aria-modal="true"`. The check is
 * made at keydown time, so listener registration order can never close the
 * shell before the modal has handled the key.
 */
export const OPEN_MODAL_SELECTOR = 'dialog[open], [role="dialog"][aria-modal="true"]';

export function hasOpenModalLayer(root: ParentNode | null | undefined = typeof document === "undefined" ? null : document): boolean {
  return Boolean(root?.querySelector(OPEN_MODAL_SELECTOR));
}

/** A page-level shell may handle Escape only when no modal layer is open. */
export function shouldHandleShellEscape(event: KeyboardEvent, root?: ParentNode | null): boolean {
  return event.key === "Escape" && !event.defaultPrevented && !hasOpenModalLayer(root);
}
