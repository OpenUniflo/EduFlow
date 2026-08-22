export function clampCarouselIndex(index: number, itemCount: number) {
  return Math.max(0, Math.min(Math.max(0, itemCount - 1), index));
}

export function knowledgeCarouselCardClass(index: number, activeIndex: number) {
  return `learning-knowledge-card ${index === activeIndex ? "active" : "side"}`;
}
