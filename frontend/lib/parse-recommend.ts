import type { RecommendedGameRaw } from "@/types/game";

export function extractGamesFromRecommendResponse(
  json: unknown,
): RecommendedGameRaw[] {
  if (Array.isArray(json)) {
    return json as RecommendedGameRaw[];
  }
  if (!json || typeof json !== "object") return [];
  const o = json as Record<string, unknown>;
  if (Array.isArray(o.games)) return o.games as RecommendedGameRaw[];
  if (Array.isArray(o.results)) return o.results as RecommendedGameRaw[];
  if (Array.isArray(o.items)) return o.items as RecommendedGameRaw[];
  return [];
}

export function extractErrorMessage(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  if (typeof o.error === "string") return o.error;
  if (typeof o.message === "string") return o.message;
  if (typeof o.detail === "string") return o.detail;
  if (Array.isArray(o.detail) && o.detail.length) {
    const first = o.detail[0] as Record<string, unknown>;
    if (typeof first?.msg === "string") return first.msg as string;
  }
  return null;
}
