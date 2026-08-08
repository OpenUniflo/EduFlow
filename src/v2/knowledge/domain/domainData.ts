import type { KnowledgeDomain } from "./domainTypes";

const DEMO_TIME = "2026-08-01T00:00:00.000Z";

function domain(id: string, name: string, description: string, canonicalColor: string): KnowledgeDomain {
  return { id, scope: "global", name, description, canonicalColor, status: "active", createdBy: "global-admin-demo", createdAt: DEMO_TIME, updatedBy: "global-admin-demo", updatedAt: DEMO_TIME };
}

export const initialKnowledgeDomains: KnowledgeDomain[] = [
  domain("agentic-ai", "Agentic AI", "规划、工具、记忆、运行时、评测与治理组成的智能体系统知识。", "#6F8FEA"),
  domain("python-engineering", "Python Engineering", "从 Python 运行模型到异步、后端架构与生产部署的工程能力。", "#53B89A"),
  domain("machine-learning", "Machine Learning", "从统计学习到深度学习的数据驱动建模方法。", "#9A7EDC"),
  domain("education-ai", "Education AI", "知识图谱、生成式 AI、学习分析与教学设计的交叉领域。", "#42AFC4"),
  domain("language-learning", "Language Learning", "语法、表达、阅读、写作与跨文化交流。", "#DD789A"),
  domain("business-analysis", "Business Analysis", "连接数据、商业问题与决策的分析能力。", "#E59A56"),
  domain("life-sciences", "Life Sciences", "生命结构、遗传、进化、生态与复杂生物系统。", "#76A94E")
];
