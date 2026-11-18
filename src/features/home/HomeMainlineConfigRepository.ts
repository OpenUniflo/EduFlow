import { supabaseClient } from "@/shared/api/supabaseClient";

export type HomeMainlineExample = {
  id: string;
  order: number;
  kind: "product" | "knowledge" | "start";
  label: string;
  prompt: string;
};

export type HomeMainlineConfig = {
  starterCourseId: string | null;
  examples: HomeMainlineExample[];
};

export const EMPTY_HOME_MAINLINE_CONFIG: HomeMainlineConfig = { starterCourseId: null, examples: [] };

export type HomeMainlineConfigRepository = {
  load(): Promise<HomeMainlineConfig>;
  cached(): HomeMainlineConfig | null;
};

type Row = Record<string, unknown>;
const text = (value: unknown) => typeof value === "string" ? value : "";

/**
 * Reads only the environment-owned Home configuration. A missing table, a
 * disabled row or a malformed row is an empty configuration: the page then
 * hides the starter entry and examples instead of inventing content.
 */
export class SupabaseHomeMainlineConfigRepository implements HomeMainlineConfigRepository {
  private value: HomeMainlineConfig | null = null;
  private pending: Promise<HomeMainlineConfig> | null = null;

  cached() { return this.value; }

  load() {
    if (this.value) return Promise.resolve(this.value);
    if (this.pending) return this.pending;
    this.pending = this.read().then((config) => {
      this.value = config;
      return config;
    }).catch(() => {
      this.value = EMPTY_HOME_MAINLINE_CONFIG;
      return this.value;
    }).finally(() => { this.pending = null; });
    return this.pending;
  }

  private async read(): Promise<HomeMainlineConfig> {
    const [configResult, exampleResult] = await Promise.all([
      supabaseClient.from("home_mainline_config").select("starter_course_id").eq("id", "default").maybeSingle(),
      supabaseClient.from("home_mainline_examples").select("id,display_order,kind,label,prompt").eq("enabled", true).order("display_order")
    ]);
    if (configResult.error || exampleResult.error) return EMPTY_HOME_MAINLINE_CONFIG;
    const config = (configResult.data ?? null) as Row | null;
    const starter = config ? text(config.starter_course_id).trim() : "";
    const examples = ((exampleResult.data ?? []) as Row[]).flatMap((row): HomeMainlineExample[] => {
      const kind = text(row.kind);
      const label = text(row.label).trim();
      const prompt = text(row.prompt).trim();
      if (!["product", "knowledge", "start"].includes(kind) || !label || !prompt) return [];
      return [{ id: text(row.id), order: Number(row.display_order) || 0, kind: kind as HomeMainlineExample["kind"], label, prompt }];
    });
    return { starterCourseId: starter || null, examples };
  }
}
