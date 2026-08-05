import type {
  KnowledgeMapping,
  KnowledgeMappingRelation,
  KnowledgeNode,
  KnowledgePromotionRequest
} from "./types";

export type KnowledgeActor = {
  id: string;
  globalAdmin?: boolean;
  tenantAdminOf?: string[];
};

export function canPublishKnowledgeRevision(actor: KnowledgeActor, node: KnowledgeNode) {
  if (node.scope === "global") return actor.globalAdmin === true;
  if (node.scope === "tenant") return Boolean(node.ownerId && actor.tenantAdminOf?.includes(node.ownerId));
  return node.ownerId === actor.id;
}

export function canConfirmPersonalMapping(actor: KnowledgeActor, source: KnowledgeNode) {
  return source.scope === "user" && source.ownerId === actor.id;
}

export function confirmKnowledgeMapping(input: {
  id: string;
  actor: KnowledgeActor;
  source: KnowledgeNode;
  target: KnowledgeNode;
  relation: KnowledgeMappingRelation;
  confirmedAt: string;
  suggestedConfidence?: number;
}): KnowledgeMapping {
  const isOwnerMapping = canConfirmPersonalMapping(input.actor, input.source);
  const isTenantMapping = input.source.scope === "tenant" && Boolean(input.source.ownerId && input.actor.tenantAdminOf?.includes(input.source.ownerId));
  if (!isOwnerMapping && !isTenantMapping && !input.actor.globalAdmin) throw new Error("Actor cannot confirm this mapping.");
  if (input.source.id === input.target.id) throw new Error("A node cannot map to itself.");
  return {
    id: input.id,
    sourceNodeId: input.source.id,
    targetNodeId: input.target.id,
    relation: input.relation,
    confirmedBy: input.actor.id,
    confirmedAt: input.confirmedAt,
    suggestedConfidence: input.suggestedConfidence
  };
}

export function canReviewPromotion(actor: KnowledgeActor, request: KnowledgePromotionRequest) {
  if (request.targetScope === "global") return actor.globalAdmin === true;
  return Boolean(request.targetOwnerId && actor.tenantAdminOf?.includes(request.targetOwnerId));
}

export function approvePromotion(
  actor: KnowledgeActor,
  request: KnowledgePromotionRequest,
  targetNodeId: string,
  reviewedAt: string
): KnowledgePromotionRequest {
  if (!canReviewPromotion(actor, request)) throw new Error("Actor cannot review this promotion request.");
  return { ...request, status: "approved", reviewedBy: actor.id, reviewedAt, selectedTargetNodeId: targetNodeId };
}
