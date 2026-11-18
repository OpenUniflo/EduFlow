/**
 * Selection presentation rules shared by the Archive course plane and the
 * learner course tree: how far unrelated nodes fade, which nodes are still
 * pickable, who owns a node's one name, and what hover looks like in each LOD
 * stage. Geometry never changes: only stroke and opacity.
 */

export const SELECTION_DIM_OPACITY = 0.2;

/** Opacity of a node given whether it belongs to the one-hop relation. */
export function selectionOpacity(related: boolean, base = 1): number {
  return Math.max(0, Math.min(1, base)) * (related ? 1 : SELECTION_DIM_OPACITY);
}

/**
 * Dimmed nodes remain clickable. Only a node that is actually not drawn
 * (opacity at or below this floor) leaves the pick set.
 */
export function isPickable(opacity: number): boolean {
  return Number.isFinite(opacity) && opacity > 0.02;
}

/** A card that still shows its own title must not receive a second name. */
export function cardShowsOwnName(input: { cardVisible: boolean; pointMix: number; cardNameOpacity: number; isCapability?: boolean }): boolean {
  if (input.isCapability) return false;
  return input.cardVisible && input.pointMix < 0.5 && input.cardNameOpacity > 0.5;
}

export type NameOwner = "card" | "outside" | "none";

/** Exactly one owner for a node's name at any moment. */
export function nameOwnerFor(input: { cardShowsName: boolean; outsideNameVisible: boolean }): NameOwner {
  if (input.cardShowsName) return "card";
  if (input.outsideNameVisible) return "outside";
  return "none";
}

/** Name opacity inside a card; unrelated cards keep their copy hidden. */
export function cardNameOpacity(cardName: number, related: boolean): number {
  return related ? Math.max(0, Math.min(1, cardName)) : 0;
}

export type LodHoverStage = "full" | "pill" | "dot" | "none";
export type HoverStyle = "outline" | "ring" | "none";

/**
 * Full cards and capsules brighten their outline. Only a point gets a ring
 * outside the marker, so a circle can never sit on card text.
 */
export function hoverStyleFor(stage: LodHoverStage): HoverStyle {
  if (stage === "full" || stage === "pill") return "outline";
  if (stage === "dot") return "ring";
  return "none";
}
