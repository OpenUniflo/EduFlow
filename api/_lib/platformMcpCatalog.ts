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
  },
];
