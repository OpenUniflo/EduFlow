/** Cross-feature entry point for the single app-owned ⌘K surface. */
export const COMMAND_PALETTE_OPEN_EVENT = "eduflow:command-palette-open";

export type CommandPaletteOpenDetail = {
  query?: string;
  /** Marks the click as returning to the element that opened the overlay. */
  source?: string;
};

export function openCommandPalette(detail: CommandPaletteOpenDetail = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<CommandPaletteOpenDetail>(COMMAND_PALETTE_OPEN_EVENT, { detail }));
}
