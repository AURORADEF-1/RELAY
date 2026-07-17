import type {
  TakeuchiPartCatalogRecord,
  TakeuchiPartSuggestion,
} from "@/lib/takeuchi-parts-catalog";

export type SemanticPartMatch = {
  id: string;
  score: number;
  reason: string;
};

export function buildSemanticPartCandidates(
  suggestions: TakeuchiPartSuggestion[],
  catalog: TakeuchiPartCatalogRecord[],
  limit = 80,
) {
  const rankedIds = new Set(suggestions.map((part) => part.id));
  return [
    ...suggestions,
    ...catalog.filter((part) => !rankedIds.has(part.id)),
  ].slice(0, limit);
}

export function parseSemanticPartMatches(payload: unknown) {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const matches = (payload as { matches?: unknown }).matches;
  if (!Array.isArray(matches)) {
    return [];
  }

  return matches
    .map((match): SemanticPartMatch | null => {
      if (!match || typeof match !== "object") {
        return null;
      }

      const candidate = match as { id?: unknown; score?: unknown; reason?: unknown };
      if (typeof candidate.id !== "string" || typeof candidate.reason !== "string") {
        return null;
      }

      const score = typeof candidate.score === "number" ? candidate.score : Number(candidate.score);
      if (!Number.isFinite(score)) {
        return null;
      }

      return {
        id: candidate.id,
        score: Math.max(0, Math.min(100, Math.round(score))),
        reason: candidate.reason.trim().slice(0, 140),
      };
    })
    .filter((match): match is SemanticPartMatch => Boolean(match?.reason));
}

export function mergeSemanticPartMatches(
  catalog: TakeuchiPartCatalogRecord[],
  matches: SemanticPartMatch[],
  limit = 12,
) {
  const byId = new Map(catalog.map((part) => [part.id, part]));

  return matches
    .map((match): TakeuchiPartSuggestion | null => {
      const part = byId.get(match.id);
      if (!part) {
        return null;
      }

      return {
        ...part,
        matchScore: match.score,
        matchReason: match.reason,
      };
    })
    .filter((part): part is TakeuchiPartSuggestion => Boolean(part))
    .slice(0, limit);
}
