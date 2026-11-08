import { useEffect, useMemo, useState } from "react";
import type { MockSession } from "@/features/auth/types";
import { ArchiveNodePanel } from "@/features/archive/components/ArchiveChrome";
import { communityByNodeId, detectAtlasCommunities } from "@/features/archive/model/atlasCommunities";
import { useArchiveModelData } from "@/features/archive/model/useArchiveModel";
import "./knowledgePanel.css";

/**
 * The same Archive detail panel, hosted beside the Home conversation. It reads
 * the Archive page's shared graph/model path and never starts a Micro.
 */
export function KnowledgePanel({ session, nodeId, onClose, onOpenCourse, onSelectNode }: {
  session: MockSession;
  nodeId: string;
  onClose(): void;
  onOpenCourse(courseId: string, origin?: DOMRect): void;
  onSelectNode(nodeId: string): void;
}) {
  const { model } = useArchiveModelData(session);
  const [selectedId, setSelectedId] = useState(nodeId);
  useEffect(() => setSelectedId(nodeId), [nodeId]);
  const node = model?.nodeById.get(selectedId) ?? null;
  const communities = useMemo(() => model ? communityByNodeId(detectAtlasCommunities(model.nodes, model.edges)) : new Map(), [model]);
  if (!model || !node) {
    return <aside className="ef-home-knowledge-panel" aria-label="知识点档案"><p className="ef-home-knowledge-empty">这个知识点暂时无法加载。</p></aside>;
  }
  return <aside className="ef-home-knowledge-panel" aria-label={`${node.title} 知识详情`}>
    <ArchiveNodePanel
      node={node}
      model={model}
      edges={model.edges}
      topicName={communities.get(node.id)?.name ?? "未分类"}
      learners={[]}
      onClose={onClose}
      onSelectNode={(id) => { setSelectedId(id); onSelectNode(id); }}
      onOpenCourse={onOpenCourse}
    />
  </aside>;
}
