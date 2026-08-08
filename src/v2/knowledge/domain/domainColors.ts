export const UNCLASSIFIED_DOMAIN_COLOR = "#A7B0BF";

export const DOMAIN_COLOR_PALETTE = [
  "#6F8FEA", "#53B89A", "#9A7EDC", "#42AFC4",
  "#DD789A", "#E59A56", "#76A94E", "#D0A845",
  "#587FC2", "#45A391", "#B16FBB", "#D86F68",
  "#668CCF", "#3E9BB4", "#8B83C9", "#B78055"
] as const;

function rgb(hex: string) {
  const value = hex.replace("#", "");
  return [0, 2, 4].map((index) => Number.parseInt(value.slice(index, index + 2), 16));
}

export function chooseMostDistinctUnusedColor(usedColors: string[]) {
  const used = usedColors.map(rgb);
  if (!used.length) return DOMAIN_COLOR_PALETTE[0];
  return [...DOMAIN_COLOR_PALETTE].sort((left, right) => {
    const distance = (candidate: string) => Math.min(...used.map((item) => rgb(candidate).reduce((sum, channel, index) => sum + (channel - item[index]) ** 2, 0)));
    return distance(right) - distance(left);
  })[0];
}

export function isValidDomainColor(value: string) {
  return /^#[0-9a-f]{6}$/i.test(value);
}
