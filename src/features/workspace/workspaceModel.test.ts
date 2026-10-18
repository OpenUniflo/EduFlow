import { expect, it } from "vitest";
import { laneColumns, mapLands, markChapters } from "./workspaceModel";

it("marks finished chapters, the current step, and the last goal from real knowledge", () => {
  const places = markChapters([
    { id: "a", title: "概念", order: 1, nodeIds: ["n1"] },
    { id: "b", title: "架构", order: 2, nodeIds: ["n2"] },
    { id: "c", title: "项目", order: 3, nodeIds: ["n3"] },
  ], new Set(["n1"]));
  expect(places.map((place) => place.state)).toEqual(["done", "now", "goal"]);
});

it("splits the course order into columns and groups the map by domain", () => {
  const columns = laneColumns(markChapters([
    { id: "a", title: "一", order: 1, nodeIds: [] },
    { id: "b", title: "二", order: 2, nodeIds: [] },
    { id: "c", title: "三", order: 3, nodeIds: [] },
    { id: "d", title: "四", order: 4, nodeIds: [] },
    { id: "e", title: "五", order: 5, nodeIds: [] },
  ], new Set()));
  expect(columns).toHaveLength(3);
  expect(columns[0]?.cards.map((card) => card.title)).toEqual(["一", "二"]);
  expect(mapLands([
    { id: "n1", title: "卷积", domain: "深度学习", state: "ahead" },
    { id: "n2", title: "工具", domain: "智能体", state: "now" },
  ]).map((land) => land.name)).toEqual(["深度学习", "智能体"]);
});
