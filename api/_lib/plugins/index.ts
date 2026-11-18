import { planningPlugin } from "./planning.js";
import { knowledgePlugin } from "./knowledge.js";
import { microPlugin } from "./micro.js";
import { coursesPlugin } from "./courses.js";
import { materialsPlugin } from "./materials.js";
import { progressPlugin } from "./progress.js";
import { navigationPlugin } from "./navigation.js";
import { assignmentPlugin } from "./assignment.js";
import { workspacePlugin } from "./workspace.js";

/** One registration point for feature plugins and their tool progress copy. */
export const assistantPlugins = [
  planningPlugin,
  knowledgePlugin,
  microPlugin,
  coursesPlugin,
  materialsPlugin,
  progressPlugin,
  navigationPlugin,
  assignmentPlugin,
  workspacePlugin
] as const;
