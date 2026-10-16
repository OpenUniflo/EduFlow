export type GraphView = "ability" | "world" | "lane";

export function graphFrameSrc(view: GraphView) {
  return `/dynamic-workspace/graph/index.html?embed=1&bare=1&view=${view}`;
}
