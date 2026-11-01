import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Check, CirclePlus, MoreHorizontal, Palette, Search, Sparkles, X } from "lucide-react";
import type { MockSession } from "@/features/auth/types";
import { DOMAIN_COLOR_PALETTE, UNCLASSIFIED_DOMAIN_COLOR } from "@/features/knowledge/domain/domainColors";
import { acceptCandidate, assignNodeDomain, assignNodesToDomain, createDomain, ignoreCandidate, reviewProposal, updateDomain, useDomainGovernance, validateDomainAssignmentTargets } from "@/features/knowledge/domain/domainStore";
import { getDomainMembers } from "@/features/knowledge/domain/domainValidation";
import type { DomainAssignmentCandidate, DomainProposal, KnowledgeDomain } from "@/features/knowledge/domain/domainTypes";
import { userKnowledgeAccess } from "@/features/knowledge/repository/KnowledgeRepository";
import type { KnowledgeEdge, KnowledgeNode } from "@/features/knowledge/types";
import { applicationServices } from "@/app/services/applicationServices";
import { EduFlowAssistant } from "@/features/assistant/components/EduFlowAssistant";
import { Button, Pill } from "@/shared/ui";
import "./domainAdmin.css";

const UNCLASSIFIED_MOVE_TARGET = "__unclassified__";

type SourceFilter = "all" | "admin" | "auto";
type NodeCandidateGroup = { node: KnowledgeNode; candidates: DomainAssignmentCandidate[] };

function sortCandidates<T extends { score: number }>(items: T[]) {
  return items.slice().sort((left, right) => right.score - left.score);
}

function scopeLabel(scope: KnowledgeNode["scope"]) {
  return scope === "global" ? "Global" : scope === "tenant" ? "Tenant" : "User";
}

function sourceLabel(source: "admin" | "auto", confidence?: number) {
  return source === "admin" ? "管理员固定" : `自动归类${typeof confidence === "number" ? ` ${Math.round(confidence * 100)}%` : ""}`;
}

function relationLabel(edge: KnowledgeEdge, incoming: boolean) {
  if (edge.relation === "related") return "相关";
  if (edge.relation === "enables") return incoming ? "支撑" : "被支撑";
  return incoming ? "先修" : "后续";
}

export function DomainManagementPage({ session }: { session: MockSession }) {
  const actor = useMemo(() => ({ id: session.userId, capabilities: session.capabilities }), [session.capabilities, session.userId]);
  const access = useMemo(() => userKnowledgeAccess(session.userId), [session.userId]);
  const graph = useMemo(() => applicationServices.knowledgeRepository.getVisibleGraph(access), [access]);
  const visibleNodes = useMemo(() => graph.nodes.filter((node) => node.status === "active"), [graph.nodes]);
  const governance = useDomainGovernance();
  const activeDomains = governance.domains.filter((domain) => domain.status === "active");
  const archivedDomains = governance.domains.filter((domain) => domain.status === "archived");
  const [selectedDomainId, setSelectedDomainId] = useState(activeDomains[0]?.id ?? "");
  const [showArchived, setShowArchived] = useState(false);
  const [listQuery, setListQuery] = useState("");
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [moveTarget, setMoveTarget] = useState("");
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [draftColor, setDraftColor] = useState<string>(DOMAIN_COLOR_PALETTE[0]);
  const [message, setMessage] = useState("");
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const selectedDomain = governance.domains.find((item) => item.id === selectedDomainId);
  const assignmentByNode = useMemo(() => new Map(governance.assignments.map((item) => [item.nodeId, item])), [governance.assignments]);
  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const nodeById = useMemo(() => new Map(visibleNodes.map((node) => [node.id, node])), [visibleNodes]);
  const counts = useMemo(() => new Map(governance.domains.map((domain) => [domain.id, governance.assignments.filter((item) => item.domainId === domain.id && visibleNodeIds.has(item.nodeId)).length])), [governance.assignments, governance.domains, visibleNodeIds]);
  const unclassifiedCount = useMemo(() => visibleNodes.filter((node) => !assignmentByNode.has(node.id)).length, [assignmentByNode, visibleNodes]);
  const candidatesByNode = useMemo(() => {
    const map = new Map<string, DomainAssignmentCandidate[]>();
    governance.candidates.forEach((candidate) => {
      if (!visibleNodeIds.has(candidate.nodeId)) return;
      map.set(candidate.nodeId, sortCandidates([...(map.get(candidate.nodeId) ?? []), candidate]));
    });
    return map;
  }, [governance.candidates, visibleNodeIds]);
  const candidateGroups = useMemo<NodeCandidateGroup[]>(() => Array.from(candidatesByNode, ([nodeId, candidates]) => {
    const node = nodeById.get(nodeId);
    return node ? { node, candidates } : null;
  }).filter((group): group is NodeCandidateGroup => Boolean(group)).sort((left, right) => right.candidates[0].score - left.candidates[0].score), [candidatesByNode, nodeById]);
  const domainCandidates = useMemo(() => candidateGroups.filter((group) => group.candidates.some((candidate) => candidate.domainId === selectedDomainId)), [candidateGroups, selectedDomainId]);
  const sideCandidates = selectedDomainId ? domainCandidates : candidateGroups;
  const pendingProposals = useMemo(() => governance.proposals.filter((proposal) => proposal.status === "pending"), [governance.proposals]);
  const incidentByNode = useMemo(() => {
    const map = new Map<string, KnowledgeEdge[]>();
    graph.edges.forEach((edge) => {
      if (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)) return;
      map.set(edge.source, [...(map.get(edge.source) ?? []), edge]);
      map.set(edge.target, [...(map.get(edge.target) ?? []), edge]);
    });
    return map;
  }, [graph.edges, visibleNodeIds]);
  const selectedDomainAssignments = useMemo(() => governance.assignments.filter((item) => item.domainId === selectedDomainId && visibleNodeIds.has(item.nodeId)), [governance.assignments, selectedDomainId, visibleNodeIds]);
  const adminCount = selectedDomainAssignments.filter((item) => item.source === "admin").length;
  const autoCount = selectedDomainAssignments.filter((item) => item.source === "auto").length;
  const members = useMemo(() => {
    const base = getDomainMembers(visibleNodes, governance.assignments, selectedDomainId, query);
    if (!selectedDomainId || sourceFilter === "all") return base;
    return base.filter((node) => assignmentByNode.get(node.id)?.source === sourceFilter);
  }, [assignmentByNode, governance.assignments, query, selectedDomainId, sourceFilter, visibleNodes]);
  const filteredDomains = useMemo(() => {
    const needle = listQuery.trim().toLocaleLowerCase();
    return activeDomains.filter((domain) => !needle || `${domain.name} ${domain.description ?? ""}`.toLocaleLowerCase().includes(needle));
  }, [activeDomains, listQuery]);
  const selectedMember = selectedMemberId ? nodeById.get(selectedMemberId) ?? null : selectedNodeIds.length === 1 ? nodeById.get(selectedNodeIds[0]) ?? null : null;

  function notify(text: string) {
    setMessage(text);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(""), 2400);
  }

  function resetMemberSelection() {
    setSelectedNodeIds([]);
    setSelectedMemberId(null);
    setMoveTarget("");
  }

  function chooseDomain(domainId: string) {
    setSelectedDomainId(domainId);
    setEditorOpen(false);
    setSourceFilter("all");
    resetMemberSelection();
  }

  function moveSelected() {
    if (!moveTarget || !selectedNodeIds.length) return;
    try {
      if (moveTarget === UNCLASSIFIED_MOVE_TARGET) {
        selectedNodeIds.forEach((nodeId) => assignNodeDomain({ actor, access, nodeId, domainId: null }));
        notify(`已将 ${selectedNodeIds.length} 个节点移至未分类`);
      } else {
        assignNodesToDomain({ actor, access, nodeIds: selectedNodeIds, domainId: moveTarget });
        notify(`已移动 ${selectedNodeIds.length} 个节点，并固定为管理员归属`);
      }
      resetMemberSelection();
    } catch (error) {
      notify(error instanceof Error ? error.message : "移动失败");
    }
  }

  function createNewDomain() {
    if (!newName.trim()) return;
    try {
      const created = createDomain({ actor, name: newName.trim(), description: "管理员创建的知识领域。" });
      setSelectedDomainId(created.id);
      setCreating(false);
      setNewName("");
      setShowArchived(false);
      resetMemberSelection();
      notify("领域已创建");
    } catch (error) {
      notify(error instanceof Error ? error.message : "创建失败");
    }
  }

  function beginEdit() {
    if (!selectedDomain || selectedDomain.status !== "active") return;
    setDraftName(selectedDomain.name);
    setDraftDescription(selectedDomain.description ?? "");
    setDraftColor(selectedDomain.canonicalColor);
    setEditorOpen(true);
  }

  function saveEdit() {
    if (!selectedDomain) return;
    if (!draftName.trim()) {
      notify("领域名称不能为空");
      return;
    }
    try {
      updateDomain({ actor, domainId: selectedDomain.id, changes: { name: draftName.trim(), description: draftDescription.trim(), canonicalColor: draftColor } });
      setEditorOpen(false);
      notify("领域已保存");
    } catch (error) {
      notify(error instanceof Error ? error.message : "保存失败");
    }
  }

  function archiveSelectedDomain() {
    if (!selectedDomain) return;
    try {
      updateDomain({ actor, domainId: selectedDomain.id, changes: { status: "archived" } });
      setSelectedDomainId("");
      setEditorOpen(false);
      setShowArchived(true);
      resetMemberSelection();
      notify("领域已归档");
    } catch (error) {
      notify(error instanceof Error ? error.message : "领域归档失败");
    }
  }

  function acceptStoredCandidate(candidate: DomainAssignmentCandidate) {
    try {
      acceptCandidate({ actor, access, candidate });
      notify("建议已接受，并固定为管理员归属");
    } catch (error) {
      notify(error instanceof Error ? error.message : "接受建议失败");
    }
  }

  function createProposalDomain(proposal: DomainProposal) {
    try {
      validateDomainAssignmentTargets(proposal.suggestedNodeIds, access);
      const domain = createDomain({ actor, name: proposal.suggestedName, description: proposal.suggestedDescription, canonicalColor: proposal.suggestedColor });
      assignNodesToDomain({ actor, access, nodeIds: proposal.suggestedNodeIds, domainId: domain.id });
      reviewProposal({ actor, proposalId: proposal.id, status: "accepted" });
      notify("Proposal 已创建为正式领域并固定成员");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Proposal 节点验证失败");
    }
  }

  return (
    <section className="ef-domain-page">
      <aside className="ef-domain-list ef-ui-glass ef-ui-glass--regular ef-ui-glass--r-16" aria-label="知识领域">
        <div className="ef-domain-list-head">
          <h2>知识领域 · {activeDomains.length}</h2>
          <Button size="32" variant="ghost" icon={<CirclePlus size={15} aria-hidden />} onClick={() => setCreating(true)}>新建</Button>
        </div>
        <label className="ef-domain-list-search">
          <Search size={14} aria-hidden />
          <span className="ef-sr">搜索领域</span>
          <input value={listQuery} onChange={(event) => setListQuery(event.target.value)} placeholder="搜索领域" />
        </label>
        <div className="ef-domain-list-rows">
          {filteredDomains.map((domain) => (
            <button key={domain.id} type="button" className={`ef-domain-row${domain.id === selectedDomainId ? " is-on" : ""}`} onClick={() => chooseDomain(domain.id)}>
              <i style={{ background: domain.canonicalColor }} aria-hidden="true" />
              <span>{domain.name}</span>
              <em>{counts.get(domain.id) ?? 0}</em>
            </button>
          ))}
          {!filteredDomains.length ? <p className="ef-domain-list-empty">没有匹配的领域</p> : null}
          <div className="ef-domain-divider" aria-hidden="true" />
          <button type="button" className={`ef-domain-row is-unclassified${!selectedDomainId && selectedDomain?.status !== "archived" ? " is-on" : ""}`} onClick={() => chooseDomain("")}>
            <i aria-hidden="true" />
            <span>未分类</span>
            <em>{unclassifiedCount}</em>
          </button>
          <button type="button" className={`ef-domain-row${showArchived ? " is-open" : ""}`} onClick={() => setShowArchived((value) => !value)} aria-expanded={showArchived}>
            <i className="is-archived" aria-hidden="true" />
            <span>已归档 · {archivedDomains.length}</span>
            <em />
          </button>
          {showArchived ? archivedDomains.map((domain) => (
            <button key={domain.id} type="button" className={`ef-domain-row is-archived-row${domain.id === selectedDomainId ? " is-on" : ""}`} onClick={() => chooseDomain(domain.id)}>
              <i style={{ background: domain.canonicalColor }} aria-hidden="true" />
              <span>{domain.name}</span>
              <em>{counts.get(domain.id) ?? 0}</em>
            </button>
          )) : null}
          {showArchived && !archivedDomains.length ? <p className="ef-domain-list-empty">暂无已归档领域</p> : null}
        </div>
        {creating ? (
          <div className="ef-domain-create">
            <label><span className="ef-sr">领域名称</span><input autoFocus value={newName} onChange={(event) => setNewName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") createNewDomain(); if (event.key === "Escape") setCreating(false); }} placeholder="领域名称" /></label>
            <div>
              <Button size="32" variant="primary" icon={<Check size={14} aria-hidden />} onClick={createNewDomain}>创建</Button>
              <Button size="32" variant="ghost" icon={<X size={14} aria-hidden />} onClick={() => { setCreating(false); setNewName(""); }} aria-label="取消创建" />
            </div>
          </div>
        ) : null}
      </aside>

      <section className="ef-domain-center ef-ui-glass ef-ui-glass--regular ef-ui-glass--r-16" aria-label={selectedDomain?.name ?? "未分类"}>
        <div className="ef-domain-center-head">
          {selectedDomain ? (
            <>
              <i className="ef-domain-color" style={{ background: selectedDomain.canonicalColor }} aria-hidden="true" />
              <div className="ef-domain-heading">
                <b>{selectedDomain.name}</b>
                <small>{selectedDomain.description || "暂无说明"}</small>
              </div>
              {selectedDomain.status === "active" ? <Button size="32" variant="secondary" onClick={beginEdit}>编辑领域</Button> : <Pill tone="quiet">已归档</Pill>}
            </>
          ) : (
            <>
              <i className="ef-domain-color is-unclassified" aria-hidden="true" />
              <div className="ef-domain-heading">
                <b>未分类</b>
                <small>{unclassifiedCount} 个知识 · 待归入领域</small>
              </div>
            </>
          )}
        </div>

        {selectedDomain && selectedDomain.status === "active" ? (
          <div className="ef-domain-stats">
            <span><b>{counts.get(selectedDomain.id) ?? 0}</b>成员</span>
            <span><b>{adminCount}</b>管理员固定</span>
            <span><b>{autoCount}</b>自动归类</span>
            <span><b>{domainCandidates.length}</b>待处理建议</span>
          </div>
        ) : null}

        {editorOpen && selectedDomain ? (
          <div className="ef-domain-editor">
            <div className="ef-domain-editor-grid">
              <label><span>名称</span><input value={draftName} onChange={(event) => setDraftName(event.target.value)} /></label>
              <label className="is-wide"><span>说明</span><textarea value={draftDescription} onChange={(event) => setDraftDescription(event.target.value)} /></label>
            </div>
            <div className="ef-domain-color-row">
              <span><Palette size={14} aria-hidden />领域颜色</span>
              <div className="ef-domain-palette">{DOMAIN_COLOR_PALETTE.map((color) => <button key={color} type="button" style={{ background: color }} className={draftColor.toLowerCase() === color.toLowerCase() ? "is-on" : ""} onClick={() => setDraftColor(color)} aria-label={`使用颜色 ${color}`} />)}</div>
            </div>
            <div className="ef-domain-editor-actions">
              <Button size="32" variant="ghost" onClick={archiveSelectedDomain}>归档领域</Button>
              <span className="ef-domain-spacer" />
              <Button size="32" variant="ghost" onClick={() => setEditorOpen(false)}>取消</Button>
              <Button size="32" variant="primary" onClick={saveEdit}>保存</Button>
            </div>
          </div>
        ) : null}

        <div className="ef-domain-toolbar">
          <label className="ef-domain-search">
            <Search size={15} aria-hidden />
            <span className="ef-sr">搜索成员</span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索成员" />
          </label>
          {selectedDomain && selectedDomain.status === "active" ? (
            <label className="ef-domain-select">
              <span className="ef-sr">来源</span>
              <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}>
                <option value="all">全部来源</option>
                <option value="admin">管理员固定</option>
                <option value="auto">自动归类</option>
              </select>
            </label>
          ) : null}
        </div>

        {selectedNodeIds.length ? (
          <div className="ef-domain-batch" aria-label="批量操作">
            <span className="ef-domain-batch-count">已选 <b>{selectedNodeIds.length}</b> 个</span>
            <span className="ef-domain-batch-sep" aria-hidden="true" />
            <label className="ef-domain-batch-select">
              <span className="ef-sr">移动到</span>
              <select value={moveTarget} onChange={(event) => setMoveTarget(event.target.value)}>
                <option value="">移动到…</option>
                {selectedDomainId && selectedDomain?.status === "active" ? <option value={UNCLASSIFIED_MOVE_TARGET}>未分类</option> : null}
                {activeDomains.filter((domain) => domain.id !== selectedDomainId).map((domain) => <option key={domain.id} value={domain.id}>{domain.name}</option>)}
              </select>
            </label>
            <Button size="32" variant="primary" onClick={moveSelected} disabled={!moveTarget}>移动</Button>
            <Button size="32" variant="ghost" onClick={resetMemberSelection}>取消选择</Button>
          </div>
        ) : null}

        <div className="ef-domain-table-wrap">
          <table className="ef-domain-table">
            <thead>
              <tr>
                <th className="ef-domain-check-col"><input type="checkbox" className="ef-domain-check" aria-label="全选本页成员" checked={members.length > 0 && members.every((node) => selectedNodeIds.includes(node.id))} onChange={(event) => setSelectedNodeIds(event.target.checked ? members.map((node) => node.id) : [])} /></th>
                <th>知识</th>
                <th>{selectedDomainId ? "归属来源" : "建议领域"}</th>
                <th>关系</th>
                <th>范围</th>
                <th className="ef-domain-actions-col" />
              </tr>
            </thead>
            <tbody>
              {members.map((node) => {
                const assignment = assignmentByNode.get(node.id);
                const candidate = candidatesByNode.get(node.id)?.[0];
                const candidateDomain = candidate ? governance.domains.find((domain) => domain.id === candidate.domainId) : undefined;
                const checked = selectedNodeIds.includes(node.id);
                return (
                  <tr key={node.id} className={`${checked ? "is-selected " : ""}${selectedMemberId === node.id ? "is-detail" : ""}`.trim()}>
                    <td><input type="checkbox" className="ef-domain-check" checked={checked} aria-label={`选择 ${node.title}`} onChange={() => { setSelectedMemberId(node.id); setSelectedNodeIds((items) => checked ? items.filter((id) => id !== node.id) : [...items, node.id]); }} /></td>
                    <td><button type="button" className="ef-domain-node" onClick={() => setSelectedMemberId(node.id)}><i style={{ background: selectedDomain?.canonicalColor ?? UNCLASSIFIED_DOMAIN_COLOR }} aria-hidden="true" />{node.title}</button></td>
                    <td>
                      {assignment ? <span className={`ef-domain-source is-${assignment.source}`}>{assignment.source === "admin" ? <Check size={12} aria-hidden /> : <Sparkles size={12} aria-hidden />}{sourceLabel(assignment.source, assignment.confidence)}</span>
                        : candidate && candidateDomain ? <span className="ef-domain-suggestion"><i style={{ background: candidateDomain.canonicalColor }} aria-hidden="true" />{candidateDomain.name}<small>{Math.round(candidate.score * 100)}%</small></span>
                          : <span className="ef-domain-muted">暂无建议</span>}
                    </td>
                    <td><span className="ef-domain-relation">{incidentByNode.get(node.id)?.length ?? 0} 条</span></td>
                    <td><span className="ef-domain-scope">{scopeLabel(node.scope)}</span></td>
                    <td><div className="ef-domain-actions"><button type="button" className="ef-domain-more" aria-label={`查看 ${node.title}`} onClick={() => setSelectedMemberId(node.id)}><MoreHorizontal size={16} aria-hidden /></button></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!members.length ? <div className="ef-domain-empty" role="status"><Sparkles size={22} aria-hidden /><b>这里还没有匹配的知识</b><p>{query ? "换个关键词或来源筛选再试。" : selectedDomainId ? "该领域暂无成员。" : "当前没有未分类知识。"}</p></div> : null}
        </div>
      </section>

      <aside className="ef-domain-side ef-ui-glass ef-ui-glass--regular ef-ui-glass--r-16" aria-label={selectedMember ? `${selectedMember.title} 详情` : "归类建议"}>
        <header className="ef-domain-side-head">
          <span><Sparkles size={16} aria-hidden /></span>
          <div><small>{selectedMember ? `${scopeLabel(selectedMember.scope)} · ${selectedMember.type}` : selectedDomainId ? "自动发现" : "未分类 · Global"}</small><b>{selectedMember ? selectedMember.title : "归类建议"}</b></div>
        </header>
        <div className="ef-domain-side-body">
          {selectedMember ? (
            <MemberDetail node={selectedMember} candidates={candidatesByNode.get(selectedMember.id) ?? []} nodesById={nodeById} domains={governance.domains} edges={incidentByNode.get(selectedMember.id) ?? []} onAccept={acceptStoredCandidate} onIgnore={(nodeId) => { try { ignoreCandidate({ actor, nodeId }); notify("已忽略该知识的建议"); } catch (error) { notify(error instanceof Error ? error.message : "忽略失败"); } }} />
          ) : (
            <>
              {selectedDomain?.status === "archived" ? <p className="ef-domain-side-empty">已归档领域不再接收新归属建议。</p> : null}
              {sideCandidates.length ? sideCandidates.slice(0, 4).map(({ node, candidates }) => {
                const candidate = candidates.find((item) => item.domainId === selectedDomainId) ?? candidates[0];
                return (
                  <article className="ef-domain-suggestion-card" key={node.id}>
                    <b>把「{node.title}」归入「{selectedDomain?.name ?? governance.domains.find((domain) => domain.id === candidate.domainId)?.name ?? "领域"}」</b>
                    <span>语义 {Math.round(candidate.semanticScore * 100)}% · 结构 {Math.round(candidate.structuralScore * 100)}%</span>
                    <div className="ef-domain-card-actions">
                      <Button size="32" variant="primary" onClick={() => acceptStoredCandidate(candidate)}>接受建议</Button>
                      <Button size="32" variant="ghost" onClick={() => setSelectedMemberId(node.id)}>查看</Button>
                    </div>
                  </article>
                );
              }) : selectedDomain?.status !== "archived" ? <p className="ef-domain-side-empty">当前没有待处理归类建议。</p> : null}
              {pendingProposals.map((proposal) => (
                <article className="ef-domain-suggestion-card" key={proposal.id}>
                  <small>{proposal.suggestedNodeIds.length} 个知识 · 置信度 {Math.round(proposal.confidence * 100)}%</small>
                  <b>{proposal.suggestedName}</b>
                  <span>{proposal.suggestedDescription ?? "待管理员确认的领域提案。"}</span>
                  <div className="ef-domain-chips">{proposal.suggestedNodeIds.slice(0, 4).map((nodeId) => <span className="ef-domain-chip" key={nodeId}>{nodeById.get(nodeId)?.title ?? nodeId}</span>)}</div>
                  <div className="ef-domain-card-actions">
                    <Button size="32" variant="primary" onClick={() => createProposalDomain(proposal)}>创建领域</Button>
                    <Button size="32" variant="ghost" onClick={() => { try { reviewProposal({ actor, proposalId: proposal.id, status: "rejected" }); notify("已忽略提案"); } catch (error) { notify(error instanceof Error ? error.message : "忽略失败"); } }}>忽略</Button>
                  </div>
                </article>
              ))}
            </>
          )}
        </div>
      </aside>

      <div className={`ef-domain-toast${message ? " is-on" : ""}`} role="status" aria-live="polite">{message}</div>
      <EduFlowAssistant
        context={{ workspace: "system", experienceMode: "design", userRole: session.role, capabilities: session.capabilities, selectedObject: selectedDomainId || "unclassified" }}
        contextLabel={selectedDomain?.name ?? "未分类 Knowledge"}
      >
        <div className="ef-domain-assistant-actions">
          <button type="button" onClick={() => notify("Domain membership 只来自 DomainAssignment，不会从标签或课程推断。")}>解释归属规则</button>
          <button type="button" onClick={() => notify("Domain 颜色只改变语义编码，不会触发 Atlas relayout。")}>颜色会影响布局吗？</button>
        </div>
        <p className="ef-domain-assistant-note">System MVP 只提供治理上下文解释；Domain mutation 仍由页面上的管理员操作与既有校验执行。</p>
      </EduFlowAssistant>
    </section>
  );
}

function MemberDetail({ node, candidates, nodesById, domains, edges, onAccept, onIgnore }: {
  node: KnowledgeNode;
  candidates: DomainAssignmentCandidate[];
  nodesById: Map<string, KnowledgeNode>;
  domains: KnowledgeDomain[];
  edges: KnowledgeEdge[];
  onAccept: (candidate: DomainAssignmentCandidate) => void;
  onIgnore: (nodeId: string) => void;
}) {
  const top = candidates[0];
  const topDomain = top ? domains.find((domain) => domain.id === top.domainId)?.name : undefined;
  return (
    <div className="ef-domain-detail">
      <p className="ef-domain-detail-copy">{node.description || "暂无说明"}</p>
      <section className="ef-domain-detail-section">
        <div className="ef-domain-detail-title"><b>相邻知识</b><span>{edges.length} 条关系</span></div>
        {edges.length ? edges.slice(0, 6).map((edge) => {
          const incoming = edge.target === node.id;
          const other = nodesById.get(incoming ? edge.source : edge.target);
          return <div className="ef-domain-neighbor" key={edge.id}><i aria-hidden="true" /><span>{other?.title ?? (incoming ? edge.source : edge.target)}</span><em>{relationLabel(edge, incoming)}</em></div>;
        }) : <p className="ef-domain-side-empty">暂无相邻知识。</p>}
      </section>
      {top ? (
        <section className="ef-domain-detail-section">
          <div className="ef-domain-detail-title"><b>建议归属</b><span>置信度 {Math.round(top.score * 100)}%</span></div>
          <p className="ef-domain-detail-suggestion">{topDomain ? `建议归入「${topDomain}」` : "存在待确认的归类建议"}</p>
          <div className="ef-domain-confidence" aria-hidden="true"><i style={{ width: `${Math.round(top.score * 100)}%` }} /></div>
          <p className="ef-domain-detail-note">语义 {Math.round(top.semanticScore * 100)}% · 结构 {Math.round(top.structuralScore * 100)}%。移动后为管理员固定归属，不会被自动归类覆盖。</p>
          <div className="ef-domain-card-actions"><Button size="32" variant="primary" onClick={() => onAccept(top)}>接受建议</Button><Button size="32" variant="ghost" onClick={() => onIgnore(node.id)}>忽略</Button></div>
        </section>
      ) : <p className="ef-domain-side-empty">当前知识没有自动归类建议。</p>}
    </div>
  );
}
