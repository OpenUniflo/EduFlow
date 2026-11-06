/**
 * Structural completeness check for a finished answer. This is not intent
 * classification: it only catches a generation that stopped mid-sentence or at
 * the token limit, so a half sentence is never persisted as the answer.
 */
export function looksIncompleteAnswer(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if ((trimmed.match(/```/g)?.length ?? 0) % 2 === 1) return true;
  if (/[。！？!?…；;）)」』”’"`|\]]$/.test(trimmed)) return false;
  if (/[，,、：:—\-]$/.test(trimmed)) return true;
  if (/[*_~]$/.test(trimmed)) return true;
  const lastLine = trimmed.split("\n").pop()?.trim() ?? "";
  if (/^[-*]\s+\*\*[^*]+\*\*$/.test(lastLine)) return true;
  // Function words that almost never end a complete Chinese sentence. This is
  // deliberately narrower than "any word": an imperative such as "告诉我" is
  // complete even without punctuation.
  if (/(?:的|了|着|过|和|与|及|或|而|但|并|且|因为|所以|如果|那么|虽然|然而|例如|比如|包括|对于|关于|通过|在|从|把|被|将|给|对|为|于|就|也|还|又|很|更|最|太|才|再|先|然后|接着|以及|等|中|时|能)$/.test(trimmed)) return true;
  if (/(?:the|a|an|and|or|of|to|in|is|are|was|were|with|for|from|that|this|by|as|at|on|it)$/i.test(trimmed)) return true;
  return false;
}
