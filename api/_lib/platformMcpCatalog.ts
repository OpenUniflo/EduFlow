/**
 * Platform-owned MCP catalog metadata.
 *
 * These services are part of EduFlow's product catalog, not administrator
 * supplements and not registry cache rows. They are merged into catalog reads
 * in memory and are never written to Supabase.
 */
export type PlatformMcpService = {
  id: string;
  sourceId: string;
  name: string;
  title: string;
  description: string;
  version: string;
  url: string;
  transport: "streamable-http" | "sse";
  authHint: "oauth" | "none" | "api-key" | "bearer" | "unknown";
  category: string;
  suggestedRef: string;
  featured: boolean;
  connectMode: "config" | "quick" | "login";
  oauthScopes: readonly string[];
  oauthResourceMetadataUrl?: string;
};

export const PLATFORM_MCP_SERVICES: readonly PlatformMcpService[] = [
  {
    id: "platform-qichacha-company",
    sourceId: "qichacha-company",
    name: "Qichacha 企业工商",
    title: "企查查企业工商",
    description: "查询企业工商登记等公开企业信息的企查查（Qichacha）数据服务，通过服务方登录授权连接。",
    version: "",
    url: "https://agent.qcc.com/mcp/company/stream",
    transport: "streamable-http",
    authHint: "oauth",
    category: "data",
    suggestedRef: "qichacha_company",
    featured: true,
    connectMode: "login",
    oauthScopes: ["mcp:tools"],
    oauthResourceMetadataUrl: "https://agent.qcc.com/mcp/.well-known/oauth-protected-resource/company/stream",
  },
  {
    id: "platform-linear",
    sourceId: "linear",
    name: "Linear",
    title: "Linear 工单",
    description: "查询 Linear 团队的工作区、项目与工单，通过服务方登录授权连接。",
    version: "",
    url: "https://mcp.linear.app/mcp",
    transport: "streamable-http",
    authHint: "oauth",
    category: "productivity",
    suggestedRef: "linear",
    featured: true,
    connectMode: "login",
    oauthScopes: ["read"],
  },
  {
    id: "platform-notion",
    sourceId: "notion",
    name: "Notion",
    title: "Notion 知识库",
    description: "读取 Notion 工作区中的页面与数据库，通过服务方登录授权连接。",
    version: "",
    url: "https://mcp.notion.com/mcp",
    transport: "streamable-http",
    authHint: "oauth",
    category: "productivity",
    suggestedRef: "notion",
    featured: true,
    connectMode: "login",
    oauthScopes: ["default"],
  },
  {
    id: "platform-cloudbase-cn",
    sourceId: "cloudbase-cn",
    name: "Tencent CloudBase (China)",
    title: "腾讯云开发 CloudBase（国内站）",
    description: "连接腾讯云开发国内站的云函数、数据库与存储资源，通过服务方登录授权。",
    version: "",
    url: "https://tcb-api.cloud.tencent.com/mcp/v1",
    transport: "streamable-http",
    authHint: "oauth",
    category: "developer",
    suggestedRef: "cloudbase_cn",
    featured: true,
    connectMode: "login",
    oauthScopes: ["mcp:full"],
  },
  {
    id: "platform-cloudbase-intl",
    sourceId: "cloudbase-intl",
    name: "Tencent CloudBase (International)",
    title: "腾讯云开发 CloudBase（国际站）",
    description: "连接腾讯云开发国际站的云函数、数据库与存储资源，通过服务方登录授权。",
    version: "",
    url: "https://tcb-api.tencentcloud.com/mcp/v1",
    transport: "streamable-http",
    authHint: "oauth",
    category: "developer",
    suggestedRef: "cloudbase_intl",
    featured: true,
    connectMode: "login",
    oauthScopes: ["mcp:full"],
  },
  {
    id: "platform-aliyun-yunxiao",
    sourceId: "aliyun-yunxiao",
    name: "Aliyun Yunxiao",
    title: "阿里云云效",
    description: "读取阿里云云效的项目、需求、代码库与流水线信息，通过服务方登录授权。",
    version: "",
    url: "https://openapi-rdc.aliyuncs.com/ai/mcp",
    transport: "streamable-http",
    authHint: "oauth",
    category: "developer",
    suggestedRef: "aliyun_yunxiao",
    featured: true,
    connectMode: "login",
    // The service publishes no scopes. Login mode therefore sends no scope
    // parameter and the server still rejects any scope it did not declare.
    oauthScopes: [],
  },
  {
    id: "platform-atlassian-rovo",
    sourceId: "atlassian-rovo",
    name: "Atlassian Rovo",
    title: "Atlassian Rovo",
    description: "只读查询 Jira 工单与 Confluence 页面，通过 Atlassian 登录授权连接。",
    version: "",
    url: "https://mcp.atlassian.com/v2/mcp",
    transport: "streamable-http",
    authHint: "oauth",
    category: "productivity",
    suggestedRef: "atlassian_rovo",
    featured: true,
    connectMode: "login",
    oauthScopes: [
      "read:me",
      "read:account",
      "read:jira:agent-interface",
      "search:jira:agent-interface",
      "read:confluence:agent-interface",
      "search:confluence:agent-interface",
    ],
  },
  {
    id: "platform-sentry",
    sourceId: "sentry",
    name: "Sentry",
    title: "Sentry 错误监控",
    description: "读取 Sentry 组织下的项目与错误事件，通过服务方登录授权连接。",
    version: "",
    url: "https://mcp.sentry.dev/mcp",
    transport: "streamable-http",
    authHint: "oauth",
    category: "developer",
    suggestedRef: "sentry",
    featured: true,
    connectMode: "login",
    oauthScopes: ["org:read"],
  },
  {
    id: "platform-canva",
    sourceId: "canva",
    name: "Canva",
    title: "Canva 设计",
    description: "读取 Canva 账号资料、设计元数据与设计内容，通过服务方登录授权连接。",
    version: "",
    url: "https://mcp.canva.com/mcp",
    transport: "streamable-http",
    authHint: "oauth",
    category: "creative",
    suggestedRef: "canva",
    featured: true,
    connectMode: "login",
    oauthScopes: ["profile:read", "design:meta:read", "design:content:read"],
  },
  {
    id: "platform-globalentity",
    sourceId: "globalentity",
    name: "GlobalEntity",
    title: "GlobalEntity 企业数据",
    description: "查询全球企业的注册与公开信息，通过服务方登录授权连接。",
    version: "",
    url: "https://www.globalentityapi.com/mcp",
    transport: "streamable-http",
    authHint: "oauth",
    category: "data",
    suggestedRef: "globalentity",
    featured: true,
    connectMode: "login",
    oauthScopes: ["company:read"],
  },
];
