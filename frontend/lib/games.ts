import type {
  RecommendedGame,
  RecommendedGameRaw,
  GameSearchHit,
  GameSearchHitRaw,
} from "@/types/game";

export function normalizeRecommended(raw: RecommendedGameRaw): RecommendedGame {
  return {
    gameId: raw.game_id,
    name: raw.name,
    rating: raw.rating ?? null,
    weight: raw.weight ?? null,
    playtime: raw.playtime ?? null,
    imageUrl: raw.image_url ?? null,
    minPlayers: raw.min_players ?? null,
    maxPlayers: raw.max_players ?? null,
    year: raw.year ?? null,
    description: raw.description ?? null,
    mechanics: Array.isArray(raw.mechanics) ? raw.mechanics : [],
    categories: Array.isArray(raw.categories) ? raw.categories : [],
  };
}

export function normalizeSearchHit(raw: GameSearchHitRaw): GameSearchHit {
  return {
    gameId: raw.game_id,
    name: raw.name,
    imageUrl: raw.image_url ?? null,
  };
}

export function complexityLabel(weight: number | null): string {
  if (weight == null) return "—";
  if (weight < 2) return "Лёгкая";
  if (weight < 3) return "Средне-лёгкая";
  if (weight < 3.5) return "Средняя";
  if (weight < 4) return "Средне-тяжёлая";
  return "Тяжёлая";
}

export function formatPlaytime(minutes: number | null): string {
  if (minutes == null) return "—";
  if (minutes < 60) return `${minutes} мин`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} ч ${m} мин` : `${h} ч`;
}

export function formatPlayers(
  minPlayers: number | null,
  maxPlayers: number | null,
): string {
  if (minPlayers == null && maxPlayers == null) return "—";
  if (minPlayers != null && maxPlayers != null) return `${minPlayers}-${maxPlayers}`;
  if (minPlayers != null) return `от ${minPlayers}`;
  return `до ${maxPlayers}`;
}
