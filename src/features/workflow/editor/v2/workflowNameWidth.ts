export const WORKFLOW_NAME_MIN_WIDTH = 60;
export const WORKFLOW_NAME_MAX_WIDTH = 360;
/** Keeps the rendered glyphs clear of the ellipsis threshold by a few pixels. */
export const WORKFLOW_NAME_WIDTH_SLACK = 4;

/**
 * Typography properties copied from the real input to the hidden measuring span.
 * Shorthand `font` is copied first, then the longhands that the shorthand does not cover.
 */
const TYPOGRAPHY_PROPERTIES = [
  "font",
  "font-family",
  "font-size",
  "font-weight",
  "font-style",
  "font-stretch",
  "font-kerning",
  "font-optical-sizing",
  "font-size-adjust",
  "font-synthesis",
  "font-variant",
  "font-variant-caps",
  "font-variant-east-asian",
  "font-variant-ligatures",
  "font-variant-numeric",
  "font-feature-settings",
  "font-variation-settings",
  "letter-spacing",
  "word-spacing",
  "text-transform",
  "text-rendering",
  "line-height"
] as const;

function pixels(value: string): number {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Give the hidden span exactly the typography the input uses for its value text. */
export function inheritInputTypography(input: HTMLInputElement, measure: HTMLElement): void {
  const computed = getComputedStyle(input);
  for (const property of TYPOGRAPHY_PROPERTIES) {
    const value = computed.getPropertyValue(property);
    if (value) measure.style.setProperty(property, value);
  }
}

/** Width the input spends on chrome rather than on text, read from its computed box model. */
export function inputChromeWidth(input: HTMLInputElement): number {
  const computed = getComputedStyle(input);
  return pixels(computed.paddingLeft) + pixels(computed.paddingRight)
    + pixels(computed.borderLeftWidth) + pixels(computed.borderRightWidth);
}

/** Fractional text width, so rounding down cannot leave the last glyph clipped. */
export function measureInputTextWidth(input: HTMLInputElement, measure: HTMLElement): number {
  inheritInputTypography(input, measure);
  return Math.max(measure.getBoundingClientRect().width, measure.scrollWidth);
}

export function workflowNameInputWidth(measuredTextWidth: number, chromeWidth = 0): number {
  const inner = Math.ceil(measuredTextWidth) + Math.ceil(Math.max(0, chromeWidth)) + WORKFLOW_NAME_WIDTH_SLACK;
  return Math.min(WORKFLOW_NAME_MAX_WIDTH, Math.max(WORKFLOW_NAME_MIN_WIDTH, inner));
}
