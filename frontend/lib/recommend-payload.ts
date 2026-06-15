export interface RecommendRequestBody {
  query?: string;
  players_min?: number | null;
  players_max?: number | null;
  playtime_min?: number | null;
  playtime_max?: number | null;
  weight_min?: number | null;
  weight_max?: number | null;
  mechanics?: number[];
  categories?: number[];
  reference_game_id?: number | null;
  alpha?: number;
  top_k?: number;
}

export function buildRecommendBody(input: {
  query: string;
  playersMin: string;
  playersMax: string;
  playtimeMin: string;
  playtimeMax: string;
  weightMin: string;
  weightMax: string;
  mechanicsIds: number[];
  categoryIds: number[];
  referenceGameId: number | null;
  alpha: number;
  topK: number;
}): RecommendRequestBody {
  const body: RecommendRequestBody = {
    top_k: input.topK,
    alpha: input.alpha,
  };

  const q = input.query.trim();
  if (q) body.query = q;

  const pMin = input.playersMin.trim();
  const pMax = input.playersMax.trim();
  if (pMin) body.players_min = parseInt(pMin, 10);
  if (pMax) body.players_max = parseInt(pMax, 10);

  const ptMin = input.playtimeMin.trim();
  const ptMax = input.playtimeMax.trim();
  if (ptMin) body.playtime_min = parseInt(ptMin, 10);
  if (ptMax) body.playtime_max = parseInt(ptMax, 10);

  const wMin = input.weightMin.trim();
  const wMax = input.weightMax.trim();
  if (wMin) body.weight_min = parseFloat(wMin);
  if (wMax) body.weight_max = parseFloat(wMax);

  if (input.mechanicsIds.length) body.mechanics = input.mechanicsIds;
  if (input.categoryIds.length) body.categories = input.categoryIds;

  if (input.referenceGameId != null) {
    body.reference_game_id = input.referenceGameId;
  }

  return body;
}
