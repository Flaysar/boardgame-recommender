/** Ответ бэкенда для одной рекомендованной игры (snake_case, как в Python). */
export interface RecommendedGameRaw {
  game_id: number;
  name: string;
  rating?: number | null;
  weight?: number | null;
  playtime?: number | null;
  image_url?: string | null;
  min_players?: number | null;
  max_players?: number | null;
  year?: number | null;
  description?: string | null;
  mechanics?: string[] | null;
  categories?: string[] | null;
}

/** Нормализованная модель для UI. */
export interface RecommendedGame {
  gameId: number;
  name: string;
  rating: number | null;
  weight: number | null;
  playtime: number | null;
  imageUrl: string | null;
  minPlayers: number | null;
  maxPlayers: number | null;
  year: number | null;
  description: string | null;
  mechanics: string[];
  categories: string[];
}

export interface GameSearchHitRaw {
  game_id: number;
  name: string;
  image_url?: string | null;
}

export interface GameSearchHit {
  gameId: number;
  name: string;
  imageUrl: string | null;
}

export interface FilterOption {
  id: number;
  name: string;
  description?: string | null;
}

export interface MetaResponseRaw {
  mechanics?: FilterOption[];
  categories?: FilterOption[];
}
