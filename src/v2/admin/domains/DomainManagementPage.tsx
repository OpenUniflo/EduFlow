import { useMemo, useState } from "react";
import { Archive, Check, ChevronRight, CirclePlus, Palette, Search, Sparkles, X } from "lucide-react";
import type { MockSession } from "../../../app/model";
import { GlobalNav } from "../../components/GlobalNav";
import { DOMAIN_COLOR_PALETTE, UNCLASSIFIED_DOMAIN_COLOR } from "../../knowledge/domain/domainColors";
import { acceptCandidate, assignNodeDomain, assignNodesToDomain, createDomain, ignoreCandidate, reviewProposal, updateDomain, useDomainGovernance, validateDomainAssignmentTargets } from "../../knowledge/domain/domainStore";
import { getDomainMembers } from "../../knowledge/domain/domainValidation";
import { userKnowledgeAccess } from "../../knowledge/repository/KnowledgeRepository";
import { applicationServices } from "../../services/applicationServices";

const UNCLASSIFIED_MOVE_TARGET = "__unclassified__";

export function DomainManagementPage({ session, onLogout }: { session: MockSession; onLogout: () => void }) {
  const actor = useMemo(() => ({ id: session.email, capabilities: session.capabilities }), [session.capabilities, session.email]);
  const access = useMemo(() => userKnowledgeAccess(session.email), [session.email]);
  const visibleNodes = useMemo(() => applicationServices.knowledgeRepository.getVisibleGraph(access).nodes, [access]);
  const governance = useDomainGovernance();
  const [tab, setTab] = useState<"management" | "suggestions">("management");
  const [selectedDomainId, setSelectedDomainId] = useState(governance.domains.find((item) => item.status === "active")?.id ?? "");
  const [query, setQuery] = useState("");
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [moveTarget, setMoveTarget] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [message, setMessage] = useState("");
  const selectedDomain = governance.domains.find((item) => item.id === selectedDomainId);
  const assignmentByNode = useMemo(() => new Map(governance.assignments.map((item) => [item.nodeId, item])), [governance.assignments]);
  const visibleNodeIds = useMemo(() => new Set(visibleNodes.filter((node) => node.status === "active").map((node) => node.id)), [visibleNodes]);
  const counts = useMemo(() => new Map(governance.domains.map((domain) => [domain.id, governance.assignments.filter((item) => item.domainId === domain.id && visibleNodeIds.has(item.nodeId)).length])), [governance.domains, governance.assignments, visibleNodeIds]);
  const members = useMemo(() => getDomainMembers(visibleNodes, governance.assignments, selectedDomainId, query), [governance.assignments, query, selectedDomainId, visibleNodes]);
  const unclassifiedCount = visibleNodes.filter((node) => node.status === "active" && !assignmentByNode.has(node.id)).length;
  const candidateGroups = useMemo(() => [...new Set(governance.candidates.map((item) => item.nodeId))].map((nodeId) => ({ node: visibleNodes.find((node) => node.id === nodeId), candidates: governance.candidates.filter((item) => item.nodeId === nodeId).sort((a, b) => b.score - a.score) })).filter((group) => group.node), [governance.candidates, visibleNodes]);

  function notify(text: string) { setMessage(text); window.setTimeout(() => setMessage(""), 2200); }

  function moveSelected() {
    if (!moveTarget || !selectedNodeIds.length) return;
    if (moveTarget === UNCLASSIFIED_MOVE_TARGET) {
      selectedNodeIds.forEach((nodeId) => assignNodeDomain({ actor, access, nodeId, domainId: null }));
      notify(`已将 ${selectedNodeIds.length} 个节点移至未分类`);
    } else {
      assignNodesToDomain({ actor, access, nodeIds: selectedNodeIds, domainId: moveTarget });
      notify(`已移动 ${selectedNodeIds.length} 个节点，并固定为管理员归属`);
    }
    setMoveTarget("");
    setSelectedNodeIds([]);
  }

  function createNewDomain() {
    if (!newName.trim()) return;
    const created = createDomain({ actor, name: newName.trim(), description: "管理员创建的知识领域。" });
    setSelectedDomainId(created.id);
    setCreating(false);
    setNewName("");
    notify("领域已创建");
  }

  return (
    <main className="domain-admin-page">
      <GlobalNav active="admin" session={session} onLogout={onLogout} />
      <header className="domain-admin-header"><div><span>KNOWLEDGE GOVERNANCE</span><h1>知识领域管理</h1><p>领域负责语义分类与颜色治理，不参与知识图布局。</p></div><div className="domain-admin-tabs"><button className={tab === "management" ? "active" : ""} onClick={() => setTab("management")}>领域管理</button><button className={tab === "suggestions" ? "active" : ""} onClick={() => setTab("suggestions")}>自动建议 <i>{candidateGroups.length + governance.proposals.filter((item) => item.status === "pending").length}</i></button></div></header>

      {tab === "management" ? <section className="domain-admin-grid">
        <aside className="domain-list-panel domain-panel">
          <div className="domain-panel-title"><h2>知识领域</h2><button onClick={() => setCreating(true)} aria-label="新建领域"><CirclePlus size={18} /></button></div>
          <label className="domain-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索领域或节点" /></label>
          <div className="domain-list">
            {governance.domains.filter((domain) => domain.status === "active" && (!query || domain.name.toLowerCase().includes(query.toLowerCase()) || domain.id === selectedDomainId)).map((domain) => <button key={domain.id} className={domain.id === selectedDomainId ? "active" : ""} onClick={() => { setSelectedDomainId(domain.id); setSelectedNodeIds([]); }}><i style={{ background: domain.canonicalColor }} /><span><strong>{domain.name}</strong></span><b>{counts.get(domain.id) ?? 0}</b><ChevronRight size={14} /></button>)}
            <button className={!selectedDomainId ? "active" : ""} onClick={() => setSelectedDomainId("")}><i style={{ background: UNCLASSIFIED_DOMAIN_COLOR }} /><span><strong>未分类</strong><small>Valid state</small></span><b>{unclassifiedCount}</b></button>
          </div>
          {creating ? <div className="domain-create-box"><input autoFocus value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="领域名称" /><div><button onClick={createNewDomain}><Check size={14} />创建</button><button onClick={() => setCreating(false)}><X size={14} /></button></div></div> : null}
        </aside>

        <section className="domain-members-panel domain-panel">
          <div className="domain-panel-title"><div><h2>{selectedDomain?.name ?? "未分类"}</h2><p>{members.length} Knowledge Nodes</p></div>{selectedNodeIds.length ? <div className="domain-move-control"><select value={moveTarget} onChange={(event) => setMoveTarget(event.target.value)}><option value="">Move to Domain</option>{selectedDomainId ? <option value={UNCLASSIFIED_MOVE_TARGET}>未分类</option> : null}{governance.domains.filter((item) => item.status === "active" && item.id !== selectedDomainId).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button onClick={moveSelected}>移动 {selectedNodeIds.length}</button></div> : null}</div>
          <div className="domain-member-list">{members.map((node) => { const assignment = assignmentByNode.get(node.id); const checked = selectedNodeIds.includes(node.id); return <label key={node.id} className={checked ? "selected" : ""}><input type="checkbox" checked={checked} onChange={() => setSelectedNodeIds((items) => checked ? items.filter((id) => id !== node.id) : [...items, node.id])} /><i style={{ background: selectedDomain?.canonicalColor ?? UNCLASSIFIED_DOMAIN_COLOR }} /><span><strong>{node.title}</strong><small>{node.description}</small></span>{assignment ? <em className={assignment.source}>{assignment.source === "admin" ? "Admin" : `Auto ${Math.round((assignment.confidence ?? 0) * 100)}%`}{assignment.pinned ? " · Pinned" : ""}</em> : <em>Unclassified</em>}</label>; })}</div>
        </section>

        <aside className="domain-detail-panel domain-panel">{selectedDomain ? <>
          <div className="domain-detail-hero"><i style={{ background: selectedDomain.canonicalColor }} /><span><small>KNOWLEDGE DOMAIN</small><h2>{selectedDomain.name}</h2><p>{counts.get(selectedDomain.id) ?? 0} nodes</p></span></div>
          <label><span>Name</span><input value={selectedDomain.name} onChange={(event) => updateDomain({ actor, domainId: selectedDomain.id, changes: { name: event.target.value } })} /></label>
          <label><span>Description</span><textarea value={selectedDomain.description ?? ""} onChange={(event) => updateDomain({ actor, domainId: selectedDomain.id, changes: { description: event.target.value } })} /></label>
          <label><span>Canonical Color</span><div className="domain-color-input"><Palette size={16} /><input key={selectedDomain.canonicalColor} defaultValue={selectedDomain.canonicalColor} onBlur={(event) => { if (/^#[0-9a-f]{6}$/i.test(event.target.value)) updateDomain({ actor, domainId: selectedDomain.id, changes: { canonicalColor: event.target.value } }); else event.target.value = selectedDomain.canonicalColor; }} /></div></label>
          <div className="domain-color-palette">{DOMAIN_COLOR_PALETTE.map((color) => <button key={color} style={{ background: color }} className={selectedDomain.canonicalColor.toLowerCase() === color.toLowerCase() ? "active" : ""} onClick={() => updateDomain({ actor, domainId: selectedDomain.id, changes: { canonicalColor: color } })} aria-label={`使用颜色 ${color}`} />)}</div>
          <button className="domain-archive" onClick={() => { try { updateDomain({ actor, domainId: selectedDomain.id, changes: { status: "archived" } }); setSelectedDomainId(""); } catch (error) { notify(error instanceof Error ? error.message : "领域归档失败"); } }}><Archive size={15} />Archive Domain</button>
        </> : <div className="domain-unclassified-detail"><i style={{ background: UNCLASSIFIED_DOMAIN_COLOR }} /><h2>未分类</h2><p>低置信度节点可以保持未分类。系统不会强行归入最近领域。</p></div>}</aside>
      </section> : <section className="domain-suggestions-layout">
          <div className="domain-suggestion-column"><div className="domain-suggestion-heading"><Sparkles size={18} /><span><h2>Node Assignment Suggestions</h2><p>语义 60% + 结构 40%；管理员结果会固定。</p></span></div>{candidateGroups.map(({ node, candidates }) => { const top = candidates[0]; return <article className="domain-suggestion-card" key={node!.id}><div><small>Current · Unclassified</small><h3>{node!.title}</h3><p>{node!.description}</p></div><div className="domain-score-list">{candidates.map((candidate) => { const domain = governance.domains.find((item) => item.id === candidate.domainId); return <span key={candidate.domainId}><i style={{ background: domain?.canonicalColor }} /><strong>{domain?.name}</strong><b>{Math.round(candidate.score * 100)}%</b></span>; })}</div><div className="domain-review-actions"><button className="primary" onClick={() => { acceptCandidate({ actor, access, candidate: top }); notify("建议已接受并固定为管理员归属"); }}>接受</button><select aria-label="选择其他领域" defaultValue="" onChange={(event) => { if (event.target.value) { acceptCandidate({ actor, access, candidate: top, domainId: event.target.value }); notify("已选择其他领域并固定"); } }}><option value="">选择其他领域</option>{governance.domains.filter((item) => item.status === "active").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button onClick={() => ignoreCandidate({ actor, nodeId: node!.id })}>忽略</button></div></article>; })}{!candidateGroups.length ? <div className="domain-empty">当前没有待处理的节点归属建议。</div> : null}</div>
        <div className="domain-suggestion-column"><div className="domain-suggestion-heading"><CirclePlus size={18} /><span><h2>Domain Proposals</h2><p>发现结果必须经管理员确认，不会直接创建领域。</p></span></div>{governance.proposals.filter((item) => item.status === "pending").map((proposal) => <article className="domain-suggestion-card" key={proposal.id}><div className="proposal-title"><i style={{ background: proposal.suggestedColor }} /><span><small>{proposal.suggestedNodeIds.length} nodes · confidence {Math.round(proposal.confidence * 100)}%</small><h3>{proposal.suggestedName}</h3><p>{proposal.suggestedDescription}</p></span></div><div className="proposal-node-chips">{proposal.suggestedNodeIds.slice(0, 8).map((id) => <span key={id}>{visibleNodes.find((node) => node.id === id)?.title ?? id}</span>)}</div><div className="domain-review-actions"><button className="primary" onClick={() => { try { validateDomainAssignmentTargets(proposal.suggestedNodeIds, access); const domain = createDomain({ actor, name: proposal.suggestedName, description: proposal.suggestedDescription, canonicalColor: proposal.suggestedColor }); assignNodesToDomain({ actor, access, nodeIds: proposal.suggestedNodeIds, domainId: domain.id }); reviewProposal({ actor, proposalId: proposal.id, status: "accepted" }); notify("Proposal 已创建为正式领域并固定成员"); } catch (error) { notify(error instanceof Error ? error.message : "Proposal 节点验证失败"); } }}>创建领域</button><button onClick={() => reviewProposal({ actor, proposalId: proposal.id, status: "rejected" })}>忽略</button></div></article>)}</div>
      </section>}
      <div className={`domain-admin-toast ${message ? "show" : ""}`}>{message}</div>
    </main>
  );
}
