import type { SourceLocation } from "@/features/material/parsing/types";
import type { KnowledgeCandidate } from "./types";

export function normalizeKnowledgeSurface(value: string): string {
  return value.normalize("NFKC")
    .trim()
    .replace(/[\s\u00a0]+/g, " ")
    .replace(/[，,。.!！?？:：;；]+$/g, "")
    .toLocaleLowerCase("zh-CN");
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = normalizeKnowledgeSurface(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function sourceKey(source: SourceLocation) {
  return [source.sourceMaterialId, source.sourceType, source.rawBlockId, source.ordinal, source.page ?? "", source.slide ?? ""].join(":");
}

function uniqueSources(values: SourceLocation[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = sourceKey(value);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function normalizeCandidates(candidates: KnowledgeCandidate[]): KnowledgeCandidate[] {
  return candidates.map((candidate) => ({
    ...candidate,
    canonicalTitle: candidate.canonicalTitle.normalize("NFKC").trim().replace(/[\s\u00a0]+/g, " ").replace(/[，,。.!！?？:：;；]+$/g, ""),
    description: candidate.description.normalize("NFKC").trim().replace(/[\s\u00a0]+/g, " "),
    aliases: uniqueStrings(candidate.aliases.map((alias) => alias.normalize("NFKC").trim()).filter(Boolean)),
    masteryCriteria: uniqueStrings(candidate.masteryCriteria.map((criterion) => criterion.normalize("NFKC").trim()).filter(Boolean)),
    sourceRefs: uniqueSources(candidate.sourceRefs)
  }));
}

function surfaces(candidate: KnowledgeCandidate) {
  return new Set([candidate.canonicalTitle, ...candidate.aliases].map(normalizeKnowledgeSurface));
}

function overlaps(left: Set<string>, right: Set<string>) {
  return Array.from(left).some((value) => right.has(value));
}

export function deduplicateWithinIngestion(candidates: KnowledgeCandidate[]) {
  const normalized = normalizeCandidates(candidates);
  const parent = normalized.map((_, index) => index);
  const find = (index: number): number => parent[index] === index ? index : (parent[index] = find(parent[index]));
  const union = (left: number, right: number) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) parent[Math.max(leftRoot, rightRoot)] = Math.min(leftRoot, rightRoot);
  };
  const candidateSurfaces = normalized.map(surfaces);
  normalized.forEach((_, left) => normalized.slice(left + 1).forEach((__, offset) => {
    const right = left + offset + 1;
    if (overlaps(candidateSurfaces[left], candidateSurfaces[right])) union(left, right);
  }));
  const groups = new Map<number, KnowledgeCandidate[]>();
  normalized.forEach((candidate, index) => groups.set(find(index), [...(groups.get(find(index)) ?? []), candidate]));
  const merged = Array.from(groups.values()).map((group) => {
    const primary = group[0];
    const aliases = uniqueStrings(group.flatMap((candidate) => [
      ...candidate.aliases,
      ...(normalizeKnowledgeSurface(candidate.canonicalTitle) === normalizeKnowledgeSurface(primary.canonicalTitle) ? [] : [candidate.canonicalTitle])
    ]));
    return {
      ...primary,
      aliases,
      masteryCriteria: uniqueStrings(group.flatMap((candidate) => candidate.masteryCriteria)),
      sourceRefs: uniqueSources(group.flatMap((candidate) => candidate.sourceRefs))
    };
  });
  return { candidates: merged, duplicateCount: candidates.length - merged.length };
}
