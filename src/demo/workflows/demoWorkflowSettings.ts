import type { PersistedWorkflowSettings } from "@/features/workflow/repository/WorkflowPersistence";
import type { EnvironmentConfig } from "@/features/workflow/runtime/types";

export const demoEnvironments: EnvironmentConfig[] = [
  {
    id: "development",
    name: "Development",
    baseUrl: "https://api.dev.eduflow.local/v1",
    apiKey: "dev_mock_key",
    model: "gpt-4.1-mini",
    searchApiUrl: "https://search.dev.eduflow.local/query",
    searchApiKey: "dev_search_key",
    databaseUrl: "postgres://localhost:5432/eduflow_dev",
    fileStoragePath: "/tmp/eduflow/dev",
    note: "本地开发和课堂演示使用。"
  },
  {
    id: "staging",
    name: "Staging",
    baseUrl: "https://api.staging.eduflow.local/v1",
    apiKey: "staging_mock_key",
    model: "gpt-4.1",
    searchApiUrl: "https://search.staging.eduflow.local/query",
    searchApiKey: "staging_search_key",
    databaseUrl: "postgres://staging.internal:5432/eduflow",
    fileStoragePath: "s3://eduflow-staging/files",
    note: "接近线上配置的集成测试环境。"
  },
  {
    id: "production",
    name: "Production",
    baseUrl: "https://api.eduflow.local/v1",
    apiKey: "",
    model: "gpt-4.1",
    searchApiUrl: "https://search.eduflow.local/query",
    searchApiKey: "",
    databaseUrl: "postgres://prod.internal:5432/eduflow",
    fileStoragePath: "s3://eduflow-prod/files",
    note: "生产环境示例，密钥留空。"
  }
];

export const demoWorkflowSettings: PersistedWorkflowSettings = {
  dailyReminder: true,
  compactMode: false,
  emailDigest: true,
  environments: demoEnvironments,
  activeEnvironmentId: demoEnvironments[0].id
};
