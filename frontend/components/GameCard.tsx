import type { RecommendedGame } from "@/types/game";
import {
  complexityLabel,
  formatPlayers,
  formatPlaytime,
} from "@/lib/games";

type Props = { game: RecommendedGame; rank: number };

export function GameCard({ game, rank }: Props) {
  return (
    <article className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
      <div className="grid gap-4 p-4 md:grid-cols-[240px_1fr] md:p-5">
        <div className="relative h-[180px] overflow-hidden rounded-xl bg-zinc-100 md:h-[220px]">
          {game.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={game.imageUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center text-5xl text-zinc-400">
              🎲
            </div>
          )}
          <div className="absolute left-2 top-2 flex h-8 min-w-8 items-center justify-center rounded-full bg-white/90 px-2 text-sm font-semibold text-zinc-700">
            #{rank}
          </div>
        </div>

        <div className="min-w-0">
          <h3 className="text-xl font-semibold leading-tight text-zinc-900">{game.name}</h3>
          <dl className="mt-3 grid gap-2 text-sm text-zinc-700 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Рейтинг</dt>
              <dd className="font-medium">{game.rating != null ? game.rating.toFixed(1) : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Сложность</dt>
              <dd>
                {game.weight != null
                  ? `${game.weight.toFixed(1)} · ${complexityLabel(game.weight)}`
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Время партии</dt>
              <dd>{formatPlaytime(game.playtime)}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">Игроки</dt>
              <dd>{formatPlayers(game.minPlayers, game.maxPlayers)}</dd>
            </div>
          </dl>

          {game.year != null && (
            <p className="mt-2 text-sm text-zinc-600">Год выпуска: {game.year}</p>
          )}

          {game.description && (
            <p className="mt-3 line-clamp-4 text-sm leading-relaxed text-zinc-700">
              {game.description}
            </p>
          )}

          <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
            <div>
              <p className="mb-1 uppercase tracking-wide text-zinc-500">Механики</p>
              <p className="text-zinc-700">
                {game.mechanics.length
                  ? game.mechanics.slice(0, 8).join(", ")
                  : "Нет данных по механикам"}
              </p>
            </div>
            <div>
              <p className="mb-1 uppercase tracking-wide text-zinc-500">Категории</p>
              <p className="text-zinc-700">
                {game.categories.length
                  ? game.categories.slice(0, 8).join(", ")
                  : "Нет данных по категориям"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
