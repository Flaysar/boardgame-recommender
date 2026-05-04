"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { FilterOption, GameSearchHit, RecommendedGame } from "@/types/game";
import { normalizeRecommended, normalizeSearchHit } from "@/lib/games";
import { buildRecommendBody } from "@/lib/recommend-payload";
import {
  extractErrorMessage,
  extractGamesFromRecommendResponse,
} from "@/lib/parse-recommend";
import { GameCard } from "@/components/GameCard";

function useDebounced<T>(value: T, ms: number): T {
  const [d, setD] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setD(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return d;
}

function DualRangeField(props: {
  title: string;
  min: number;
  max: number;
  step?: number;
  valueMin: number;
  valueMax: number;
  onMinChange: (v: number) => void;
  onMaxChange: (v: number) => void;
  suffix?: string;
  precision?: number;
}) {
  const [activeThumb, setActiveThumb] = useState<"min" | "max" | null>(null);
  const step = props.step ?? 1;
  const precision = props.precision ?? 0;
  const minText = props.valueMin.toFixed(precision);
  const maxText = props.valueMax.toFixed(precision);
  const range = props.max - props.min || 1;
  const leftPct = ((props.valueMin - props.min) / range) * 100;
  const rightPct = ((props.valueMax - props.min) / range) * 100;

  function parseBound(raw: string, fallback: number): number {
    const n = Number(raw.replace(",", "."));
    if (Number.isNaN(n)) return fallback;
    return Math.max(props.min, Math.min(n, props.max));
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <div className="flex items-center justify-between text-sm">
        <p className="font-medium text-zinc-800">{props.title}</p>
        <p className="text-zinc-600">
          {minText} - {maxText} {props.suffix ?? ""}
        </p>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-xs text-zinc-600">
          Мин
          <input
            type="number"
            min={props.min}
            max={props.max}
            step={step}
            value={minText}
            onChange={(e) => {
              const n = parseBound(e.target.value, props.valueMin);
              props.onMinChange(Math.min(n, props.valueMax));
            }}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
          />
        </label>
        <label className="text-xs text-zinc-600">
          Макс
          <input
            type="number"
            min={props.min}
            max={props.max}
            step={step}
            value={maxText}
            onChange={(e) => {
              const n = parseBound(e.target.value, props.valueMax);
              props.onMaxChange(Math.max(n, props.valueMin));
            }}
            className="mt-1 w-full rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm"
          />
        </label>
      </div>
      <div className="relative mt-4">
        <div className="h-2 rounded-full bg-zinc-200" />
        <div
          className="pointer-events-none absolute top-0 h-2 rounded-full bg-orange-400"
          style={{
            left: `${leftPct}%`,
            width: `${Math.max(rightPct - leftPct, 0)}%`,
          }}
        />
        <input
          type="range"
          min={props.min}
          max={props.max}
          step={step}
          value={props.valueMin}
          onMouseDown={() => setActiveThumb("min")}
          onTouchStart={() => setActiveThumb("min")}
          onChange={(e) =>
            props.onMinChange(
              Math.min(Number(e.target.value), props.valueMax),
            )
          }
          className={`dual-range-input absolute top-[-6px] h-5 w-full appearance-none bg-transparent accent-orange-500 ${
            activeThumb === "min" ? "z-30" : "z-20"
          }`}
        />
        <input
          type="range"
          min={props.min}
          max={props.max}
          step={step}
          value={props.valueMax}
          onMouseDown={() => setActiveThumb("max")}
          onTouchStart={() => setActiveThumb("max")}
          onChange={(e) =>
            props.onMaxChange(
              Math.max(Number(e.target.value), props.valueMin),
            )
          }
          className={`dual-range-input absolute top-[-6px] h-5 w-full appearance-none bg-transparent accent-orange-500 ${
            activeThumb === "max" ? "z-30" : "z-20"
          }`}
        />
      </div>
    </div>
  );
}

export function RecommendationStudio() {
  const [query, setQuery] = useState("");
  const [playersMin, setPlayersMin] = useState(1);
  const [playersMax, setPlayersMax] = useState(12);
  const [playtimeMin, setPlaytimeMin] = useState(0);
  const [playtimeMax, setPlaytimeMax] = useState(720);
  const [weightMin, setWeightMin] = useState(0);
  const [weightMax, setWeightMax] = useState(5);
  const [playersTouched, setPlayersTouched] = useState(false);
  const [playtimeTouched, setPlaytimeTouched] = useState(false);
  const [weightTouched, setWeightTouched] = useState(false);
  const [mechanicsIds, setMechanicsIds] = useState<number[]>([]);
  const [categoryIds, setCategoryIds] = useState<number[]>([]);
  const [referenceGameId, setReferenceGameId] = useState<number | null>(null);
  const [referenceHit, setReferenceHit] = useState<GameSearchHit | null>(null);
  const [alpha, setAlpha] = useState(0.55);
  const [topK] = useState(20);
  const [metaMechanics, setMetaMechanics] = useState<FilterOption[]>([]);
  const [metaCategories, setMetaCategories] = useState<FilterOption[]>([]);
  const [mechanicSearch, setMechanicSearch] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [gameSearchInput, setGameSearchInput] = useState("");
  const debouncedGameQ = useDebounced(gameSearchInput, 280);
  const [searchHits, setSearchHits] = useState<GameSearchHit[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const [games, setGames] = useState<RecommendedGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/meta")
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        setMetaMechanics(j.mechanics ?? []);
        setMetaCategories(j.categories ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (debouncedGameQ.trim().length < 2) {
      setSearchHits([]);
      setSearchLoading(false);
      return;
    }
    let cancelled = false;
    setSearchLoading(true);
    fetch(
      `/api/games/search?q=${encodeURIComponent(debouncedGameQ.trim())}`,
    )
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const raw = Array.isArray(j.games) ? j.games : [];
        setSearchHits(raw.map(normalizeSearchHit));
      })
      .catch(() => {
        if (!cancelled) setSearchHits([]);
      })
      .finally(() => {
        if (!cancelled) setSearchLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedGameQ]);

  const mechanicPickList = useMemo(() => {
    const q = mechanicSearch.trim().toLowerCase();
    return metaMechanics
      .filter((item) =>
        q ? item.name.toLowerCase().includes(q) : true,
      )
      .slice(0, 300);
  }, [metaMechanics, mechanicSearch]);

  const categoryPickList = useMemo(() => {
    const q = categorySearch.trim().toLowerCase();
    return metaCategories
      .filter((item) =>
        q ? item.name.toLowerCase().includes(q) : true,
      )
      .slice(0, 120);
  }, [metaCategories, categorySearch]);

  const submit = useCallback(async () => {
    setError(null);
    if (!query.trim() && referenceGameId == null) {
      setError("Введите запрос или выберите референс-игру.");
      return;
    }

    const body = buildRecommendBody({
      query,
      playersMin: playersTouched ? String(playersMin) : "",
      playersMax: playersTouched ? String(playersMax) : "",
      playtimeMin: playtimeTouched ? String(playtimeMin) : "",
      playtimeMax: playtimeTouched ? String(playtimeMax) : "",
      weightMin: weightTouched ? String(weightMin) : "",
      weightMax: weightTouched ? String(weightMax) : "",
      mechanicsIds,
      categoryIds,
      referenceGameId,
      alpha: referenceGameId != null ? alpha : 0.65,
      topK,
    });

    setLoading(true);
    setGames([]);
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(
          extractErrorMessage(data) ??
            `Запрос не удался (${res.status})`,
        );
        return;
      }

      const rawList = extractGamesFromRecommendResponse(data);
      setGames(rawList.map(normalizeRecommended));
    } catch {
      setError("Не удалось выполнить запрос.");
    } finally {
      setLoading(false);
    }
  }, [
    alpha,
    categoryIds,
    mechanicsIds,
    playersTouched,
    playersMax,
    playersMin,
    playtimeTouched,
    playtimeMax,
    playtimeMin,
    query,
    referenceGameId,
    topK,
    weightTouched,
    weightMax,
    weightMin,
  ]);

  function pickReference(hit: GameSearchHit) {
    setReferenceGameId(hit.gameId);
    setReferenceHit(hit);
    setGameSearchInput("");
    setSearchHits([]);
  }

  function clearReference() {
    setReferenceGameId(null);
    setReferenceHit(null);
  }

  function toggleId(list: number[], id: number, set: (n: number[]) => void) {
    if (list.includes(id)) set(list.filter((x) => x !== id));
    else set([...list, id]);
  }

  function resetAllFilters() {
    setPlayersMin(1);
    setPlayersMax(12);
    setPlaytimeMin(0);
    setPlaytimeMax(720);
    setWeightMin(0);
    setWeightMax(5);
    setPlayersTouched(false);
    setPlaytimeTouched(false);
    setWeightTouched(false);
    setMechanicsIds([]);
    setCategoryIds([]);
    setMechanicSearch("");
    setCategorySearch("");
    setReferenceGameId(null);
    setReferenceHit(null);
    setAlpha(0.55);
  }

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 sm:px-6 lg:px-8">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-orange-600">
              Похожие настольные игры
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
              Подбор по смыслу запроса
            </h1>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="grid gap-5 lg:grid-cols-2">
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <label className="block text-sm font-medium text-zinc-800">
              Описание желаемой игры
            </label>
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              rows={5}
              placeholder='Например: «кооператив на одного против игры с картами событий, не слишком долго»…'
              className="mt-2 w-full resize-none rounded-xl border border-zinc-300 bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
            />
            <h2 className="mt-4 text-sm font-medium text-zinc-800">
              Референс-игра{" "}
              <span className="font-normal text-zinc-500">(по желанию)</span>
            </h2>
            <p className="mt-1 text-xs text-zinc-500">
              Выбери игру по названию, чтобы подмешать ее embedding к текстовому запросу.
            </p>
            <div className="relative mt-3">
              <input
                type="search"
                value={gameSearchInput}
                onChange={(e) => setGameSearchInput(e.target.value)}
                placeholder="Найти игру по названию…"
                className="w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
                autoComplete="off"
              />
              {searchLoading && (
                <span className="absolute right-3 top-2.5 text-xs text-zinc-500">
                  …
                </span>
              )}
              {searchHits.length > 0 && (
                <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-zinc-200 bg-white py-1 text-sm shadow-xl">
                  {searchHits.map((h) => (
                    <li key={h.gameId}>
                      <button
                        type="button"
                        onClick={() => pickReference(h)}
                        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-zinc-50"
                      >
                        {h.imageUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={h.imageUrl}
                            alt=""
                            className="size-9 rounded-lg object-cover"
                          />
                        ) : (
                          <span className="flex size-9 items-center justify-center rounded-lg bg-zinc-200 text-lg">
                            🎲
                          </span>
                        )}
                        <span className="line-clamp-2">{h.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {referenceHit && (
              <div className="mt-4">
                <details className="group rounded-xl border border-zinc-200 bg-zinc-50 p-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      {referenceHit.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={referenceHit.imageUrl} alt="" className="size-10 rounded-lg object-cover" />
                      ) : (
                        <span className="flex size-10 items-center justify-center rounded-lg bg-zinc-200">🎲</span>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs text-zinc-500">Референс-игра</p>
                        <p className="truncate text-sm font-medium text-zinc-800">{referenceHit.name}</p>
                      </div>
                    </div>
                    <span className="text-xs text-zinc-500 group-open:rotate-180">▾</span>
                  </summary>
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={clearReference}
                      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100"
                    >
                      Снять выбор
                    </button>
                  </div>
                </details>

                <div className="mt-3 flex justify-between text-xs text-zinc-500">
                  <span>Больше текста запроса</span>
                  <span>Больше референс-игры</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(alpha * 100)}
                  onChange={(e) =>
                    setAlpha(parseInt(e.target.value, 10) / 100)
                  }
                  className="mt-2 w-full accent-orange-500"
                />
                <p className="mt-1 text-[11px] text-zinc-500">
                  alpha: {alpha.toFixed(2)}
                </p>
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-medium text-zinc-800">Фильтры</h2>
              <button
                type="button"
                onClick={resetAllFilters}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
              >
                Сбросить фильтры
              </button>
            </div>
            <div className="mt-3 space-y-3">
              <DualRangeField
                title="Количество игроков"
                min={1}
                max={12}
                valueMin={playersMin}
                valueMax={playersMax}
                onMinChange={(v) => {
                  setPlayersTouched(true);
                  setPlayersMin(v);
                }}
                onMaxChange={(v) => {
                  setPlayersTouched(true);
                  setPlayersMax(v);
                }}
              />
              <DualRangeField
                title="Время партии"
                min={0}
                max={720}
                valueMin={playtimeMin}
                valueMax={playtimeMax}
                onMinChange={(v) => {
                  setPlaytimeTouched(true);
                  setPlaytimeMin(v);
                }}
                onMaxChange={(v) => {
                  setPlaytimeTouched(true);
                  setPlaytimeMax(v);
                }}
                suffix="мин"
              />
              <DualRangeField
                title="Сложность"
                min={0}
                max={5}
                step={0.1}
                valueMin={weightMin}
                valueMax={weightMax}
                onMinChange={(v) => {
                  setWeightTouched(true);
                  setWeightMin(v);
                }}
                onMaxChange={(v) => {
                  setWeightTouched(true);
                  setWeightMax(v);
                }}
                precision={1}
              />

              <div>
                <h3 className="text-sm font-medium text-zinc-700">Механики</h3>
                <input
                  type="search"
                  value={mechanicSearch}
                  onChange={(e) => setMechanicSearch(e.target.value)}
                  placeholder="Поиск механики..."
                  className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
                />
                <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 p-2">
                  {mechanicPickList.map((m) => (
                    <label
                      key={m.id}
                      title={m.description ?? "Описание недоступно"}
                      className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 text-xs hover:bg-zinc-100"
                    >
                      <input
                        type="checkbox"
                        checked={mechanicsIds.includes(m.id)}
                        onChange={() =>
                          toggleId(
                            mechanicsIds,
                            m.id,
                            setMechanicsIds,
                          )
                        }
                        className="mt-0.5 accent-orange-500"
                      />
                      <span>{m.name}</span>
                    </label>
                  ))}
                  {!mechanicPickList.length && (
                    <p className="text-xs text-zinc-500">
                      {metaMechanics.length
                        ? "Ничего не найдено."
                        : "Список механик недоступен."}
                    </p>
                  )}
                </div>
              </div>

              <div>
                <h3 className="text-sm font-medium text-zinc-700">Категории</h3>
                <input
                  type="search"
                  value={categorySearch}
                  onChange={(e) => setCategorySearch(e.target.value)}
                  placeholder="Поиск категории..."
                  className="mt-2 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200"
                />
                <div className="mt-2 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-zinc-200 bg-zinc-50 p-2">
                  {categoryPickList.map((c) => (
                    <label
                      key={c.id}
                      title={c.description ?? "Описание недоступно"}
                      className="flex cursor-pointer items-start gap-2 rounded px-1 py-0.5 text-xs hover:bg-zinc-100"
                    >
                      <input
                        type="checkbox"
                        checked={categoryIds.includes(c.id)}
                        onChange={() =>
                          toggleId(categoryIds, c.id, setCategoryIds)
                        }
                        className="mt-0.5 accent-orange-500"
                      />
                      <span>{c.name}</span>
                    </label>
                  ))}
                  {!categoryPickList.length && (
                    <p className="text-xs text-zinc-500">
                      {metaCategories.length
                        ? "Ничего не найдено."
                        : "Список категорий недоступен."}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={submit}
            disabled={loading}
            className="rounded-xl bg-orange-500 px-5 py-3 text-sm font-semibold text-white hover:bg-orange-400 disabled:opacity-60"
          >
            {loading ? "Ищем игры..." : "Подобрать игры"}
          </button>
          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>

        <main className="min-h-[320px]">
          {games.length === 0 && !loading && (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-24 text-center">
              <p className="text-4xl opacity-40">☰</p>
              <p className="mt-4 max-w-md text-sm text-zinc-600">
                Здесь появятся карточки рекомендаций после нажатия кнопки.
              </p>
            </div>
          )}

          {loading && (
            <div className="grid gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="animate-pulse rounded-2xl border border-zinc-200 bg-white"
                >
                  <div className="h-40 rounded-t-2xl bg-zinc-100" />
                  <div className="space-y-3 p-4">
                    <div className="h-4 w-[80%] rounded bg-zinc-200" />
                    <div className="h-3 w-full rounded bg-zinc-100" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {!loading && games.length > 0 && (
            <div className="grid gap-3">
              {games.map((g, i) => (
                <GameCard key={g.gameId} game={g} rank={i + 1} />
              ))}
            </div>
          )}
        </main>
      </div>

    </div>
  );
}
