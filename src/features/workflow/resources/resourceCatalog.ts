import type { JsonValue, WorkflowConfiguration, WorkflowDefinitionV2, WorkflowEnvironment, WorkflowTool } from "../domain/v2/types";
import { workflowResourceReferences, type WorkflowResourceReference } from "../domain/v2/resourceReferences";
import type { FunctionVersion } from "../editor/v2/FunctionExecutionFields";
import { apiDisplayUrl } from "./apiResourceModel";
import { isFixtureConnection, type CatalogConnection } from "./resourceModel";
import { providerDisplayName, providerModelRefs, providerModelSummary } from "./providerModel";
import type { FunctionDraft, ResourceEditorTarget } from "./ResourceEditor";

export type WorkflowResourceDisplay = {
  key: string;
  kind: "provider" | "api" | "function" | "variable";
  title: string;
  badge: string;
  meta: string;
  mono?: boolean;
  platform?: boolean;
  usage: string;
  section: "providers" | "apis" | "functions" | "variables";
  edit?: ResourceEditorTarget;
};

function latestConnection(connections: readonly CatalogConnection[], ref: string): CatalogConnection | undefined {
  const matching = connections.filter(connection => connection.ref === ref);
  return matching
    .slice()
    .sort((left, right) => Number(left.disabled) - Number(right.disabled) || right.version - left.version)[0];
}

function referencedConnection(connections: readonly CatalogConnection[], ref: string): CatalogConnection | undefined {
  const exact = connections.find(connection => connection.connectionKey === ref);
  return latestConnection(connections, exact?.ref ?? ref) ?? exact;
}

function usageLabel(reference: WorkflowResourceReference) {
  return [...new Set(reference.usages.map(usage => usage.label))].join("、");
}

function typeLabelOf(value: JsonValue | undefined): string {
  if (Array.isArray(value)) return "列表";
  if (typeof value === "number") return "数字";
  if (typeof value === "boolean") return "布尔";
  if (value && typeof value === "object") return "对象";
  return "文本";
}

/** Resolves the shared node reference scan against the current catalogs for display. */
export function resolveWorkflowResources(input: {
  definition: WorkflowDefinitionV2;
  connections?: readonly CatalogConnection[] | null;
  functions?: readonly FunctionVersion[] | null;
  tools?: readonly WorkflowTool[];
  environment?: WorkflowEnvironment;
  variableConfiguration?: WorkflowConfiguration | null;
  variableValues?: Record<string, string | number | boolean>;
}): WorkflowResourceDisplay[] {
  const connections = (input.connections ?? []).filter(connection => !isFixtureConnection(connection));
  const functions = (input.functions ?? []) as Array<FunctionVersion & { description?: string }>;
  const tools = input.tools ?? [];
  const variables = input.variableConfiguration?.variables ?? [];
  return workflowResourceReferences(input.definition).map((reference): WorkflowResourceDisplay => {
    const usage = usageLabel(reference);
    if (reference.kind === "provider") {
      const connection = referencedConnection(connections, reference.ref);
      if (connection) {
        return {
          key: reference.key,
          kind: "provider",
          title: providerDisplayName(connection),
          badge: "模型供应商",
          meta: providerModelSummary(providerModelRefs(connection)),
          usage,
          section: "providers",
          edit: { kind: "provider", mode: "edit", ref: connection.ref },
        };
      }
      const platform = input.environment?.providers.find(provider => provider.ref === reference.ref);
      return {
        key: reference.key,
        kind: "provider",
        title: platform?.name || reference.ref,
        badge: "模型供应商",
        meta: platform ? providerModelSummary(platform.modelRefs) : "供应商引用暂不可用",
        usage,
        section: "providers",
        platform: Boolean(platform),
        edit: platform ? undefined : { kind: "provider", mode: "edit", ref: reference.ref },
      };
    }
    if (reference.kind === "api") {
      const connection = connections.find(item => item.connectionKey === reference.ref) ?? connections.find(item => item.ref === reference.ref);
      if (connection) {
        return {
          key: reference.key,
          kind: "api",
          title: String(connection.content.name ?? connection.ref),
          badge: "API",
          meta: apiDisplayUrl(connection.content),
          mono: true,
          usage,
          section: "apis",
          edit: { kind: "api", mode: "edit", ref: connection.ref },
        };
      }
      const tool = tools.find(item => item.ref === reference.ref);
      if (tool) {
        return {
          key: reference.key,
          kind: "api",
          title: tool.name,
          badge: "API",
          meta: `${tool.ref} · 平台提供`,
          mono: true,
          usage,
          section: "apis",
          platform: (tool.origin ?? "environment") !== "user",
          edit: { kind: "api", mode: "create", platformTool: tool },
        };
      }
      return {
        key: reference.key,
        kind: "api",
        title: reference.ref,
        badge: "API",
        meta: "API 引用暂不可用",
        mono: true,
        usage,
        section: "apis",
      };
    }
    if (reference.kind === "function") {
      if (reference.inline) {
        const language = String(reference.inline.config.language ?? "python");
        const config = reference.inline.config;
        return {
          key: reference.key,
          kind: "function",
          title: reference.inline.label,
          badge: "函数",
          meta: `${language === "javascript" ? "JavaScript" : "Python"} · 本流程代码`,
          usage,
          section: "functions",
          edit: {
            kind: "function",
            mode: "create",
            name: reference.inline.label,
            initial: {
              name: reference.inline.label,
              language: language === "javascript" ? "javascript" : "python",
              description: String(config.description ?? ""),
              code: String(config.code ?? ""),
              inputSchema: (config.inputSchema as FunctionDraft["inputSchema"]) ?? { type: "object", properties: {} },
              outputSchema: (config.outputSchema as FunctionDraft["outputSchema"]) ?? { type: "object", properties: {} },
            },
          },
        };
      }
      const version = reference.usages.find(item => typeof item.functionVersion === "number")?.functionVersion;
      const fn = functions
        .filter(item => item.ref === reference.ref && (version === undefined || item.version === version))
        .sort((left, right) => right.version - left.version)[0]
        ?? functions.filter(item => item.ref === reference.ref).sort((left, right) => right.version - left.version)[0];
      return {
        key: reference.key,
        kind: "function",
        title: String(fn?.name ?? reference.ref),
        badge: "函数",
        meta: fn ? `${String(fn.language ?? "python") === "javascript" ? "JavaScript" : "Python"} · 固定版本 v${fn.version}` : "函数引用暂不可用",
        usage,
        section: "functions",
        edit: fn ? { kind: "function", mode: "edit", ref: fn.ref, version: fn.version } : { kind: "function", mode: "edit", ref: reference.ref, ...(version ? { version } : {}) },
      };
    }
    const variable = variables.find(item => item.key === reference.ref);
    const value = input.variableValues?.[reference.ref] ?? variable?.value;
    return {
      key: reference.key,
      kind: "variable",
      title: reference.ref,
      badge: "变量",
      meta: `${typeLabelOf(value as JsonValue)} · ${String(value ?? "未提供")}`.slice(0, 60),
      usage,
      section: "variables",
    };
  });
}
