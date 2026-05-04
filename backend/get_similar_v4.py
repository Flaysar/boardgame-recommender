import logging
import os
from typing import Optional
import math

import psycopg
from pgvector.psycopg import register_vector
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer
from sentence_transformers import CrossEncoder
import requests


# -----------------------------
# TRANSLATION
# -----------------------------
def translator(ru_text: str) -> str:
    load_dotenv()

    API_KEY = os.getenv("TRANSLATOR_API_KEY")
    folder_id = os.getenv("YANDEX_CATALOG_ID")

    if not API_KEY or not folder_id:
        raise RuntimeError("TRANSLATOR_API_KEY или YANDEX_CATALOG_ID не найдены")

    body = {
        "targetLanguageCode": "en",
        "sourceLanguageCode": "ru",
        "texts": [ru_text],
        "folderId": folder_id,
    }

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Api-Key {API_KEY}",
    }

    response = requests.post(
        "https://translate.api.cloud.yandex.net/translate/v2/translate",
        json=body,
        headers=headers,
        timeout=30,
    )
    response.raise_for_status()

    data = response.json()
    return data["translations"][0]["text"]


# -----------------------------
# MODEL
# -----------------------------
MODEL_NAME = "all-MiniLM-L6-v2"
model = None

def get_model():
    global model
    if model is None:
        model = SentenceTransformer(MODEL_NAME)
    return model

CROSS_ENCODER_MODEL = "cross-encoder/ms-marco-MiniLM-L-6-v2"
cross_encoder = None

def get_cross_encoder():
    global cross_encoder
    if cross_encoder is None:
        cross_encoder = CrossEncoder(CROSS_ENCODER_MODEL)
    return cross_encoder

TEXT_WEIGHT = 0.65
MECHANICS_WEIGHT = 0.22
CATEGORY_WEIGHT = 0.13
MECHANICS_TOP_K = 15
NEUTRAL_MECHANICS_DISTANCE = 1.5
MECHANICS_LIMIT = 0.30
CORE_MECHANICS_WEIGHT = 0.25
SAMPLE_SIZE = 100
GAMES_TOP_K = 8

def get_embedding(text: str):
    embedding = get_model().encode(text, normalize_embeddings=True)
    return embedding.tolist()

def get_game_embedding_by_id(game_id: int):
    database_url = os.getenv("DATABASE_URL")

    with psycopg.connect(database_url) as conn:
        register_vector(conn)
        with conn.cursor() as cur:
            cur.execute(
                "SELECT embedding FROM game_embeddings WHERE game_id = %s",
                (game_id,)
            )
            row = cur.fetchone()
            
            if not row or row[0] is None:
                return None

            return row[0]
        

def normalize(vec):
    # print(vec[:7] + vec[-7:])
    norm = math.sqrt(sum(x * x for x in vec))
    if norm == 0:
        return vec
    return [x / norm for x in vec]

def to_int(x):
    try:
        return int(x)
    except:
        return None


def to_float(x):
    try:
        return float(x)
    except:
        return None


def complexity_label(weight):
    if weight is None:
        return None
    if weight < 2:
        return "light"
    if weight < 3:
        return "medium-light"
    if weight < 3.5:
        return "medium"
    if weight < 4:
        return "medium-heavy"
    return "heavy"


def playtime_label(playtime):
    if playtime is None:
        return None
    if playtime <= 30:
        return "short"
    if playtime <= 90:
        return "medium-length"
    return "long"


def players_label(min_players, max_players):
    if min_players and max_players:
        return f"for {min_players}-{max_players} players"
    if min_players:
        return f"for at least {min_players} players"
    if max_players:
        return f"for up to {max_players} players"
    return None

def build_source_text(game):
    parts = []

    if game["name"]:
        parts.append("Game: " + game["name"])
        parts.append("\n")

    if game["categories"]:
        parts.append("Categories: " + ", ".join(game["categories"]))
        parts.append("\n")

    if game["mechanics"]:
        parts.append("Core mechanics:\n" + ", ".join(game["mechanics"]))
        parts.append("\n")

    # if game["designers"]:
    #     parts.append("Designers: " + ", ".join(game["designers"]))
    #     parts.append("\n")

    weight = to_float(game["weight"])
    if weight:
        parts.append(f"Complexity: {complexity_label(weight)} ({weight})")

    plabel = players_label(game["min_players"], game["max_players"])
    if plabel:
        parts.append(plabel)

    if game["playtime"]:
        parts.append(f"{playtime_label(game['playtime'])} game ({game['playtime']} minutes)")

    if game["year"]:
        parts.append(f"Published in {game['year']}")

    if game["description"]:
        parts.append("Description: " + game["description"])

    return "\n".join(parts)


def load_games_from_db(game_ids):
    """
    Загружаем все нужные данные для сборки source_text
    """

    sql = """
        SELECT 
            g.game_id,
            g.name,
            g.year,
            g.min_players,
            g.max_players,
            g.playtime,
            g.description,
            g.weight,

            ARRAY(
                SELECT c.name
                FROM categories c
                JOIN games_categories gc ON gc.category_id = c.category_id
                WHERE gc.game_id = g.game_id
            ) AS categories,

            ARRAY(
                SELECT m.name
                FROM mechanics m
                JOIN games_mechanics gm ON gm.mechanic_id = m.mechanic_id
                WHERE gm.game_id = g.game_id
            ) AS mechanics,

            ARRAY(
                SELECT d.name
                FROM designers d
                JOIN games_designers gd ON gd.designer_id = d.designer_id
                WHERE gd.game_id = g.game_id
            ) AS designers

        FROM games g
        WHERE g.game_id = ANY(%s)
    """

    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        raise RuntimeError("DATABASE_URL не найден")

    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (game_ids,))
            results = cur.fetchall()

            columns = [desc[0] for desc in cur.description]

            games = []
            for row in results:
                game = dict(zip(columns, row))
                games.append(game)

            logging.info(f"Загружено игр: {len(games)}")
            # print(games)
            return games


def rerank_with_cross_encoder(query, results):
    """
    results — это то, что вернул SQL
    """

    pairs = []
    enriched = []

    game_ids = []
    dict_results = {}

    for row in results:
        (
            game_id,
            name,
            rating,
            weight,
            playtime,
            text_distance,
            mechanics_score,
            strong_mechanics_count,
            matched_mechanics,
            max_mechanic_score,
            category_score,
            max_category_score,
            mechanics_penalty,
            matched_core_names,
            final_score
        ) = row

        dict_results[game_id] = row

        game_ids.append(game_id)
        # print(f"Добавляем для кросс-энкодера: {name} (id={game_id})")

    games = load_games_from_db(game_ids)

    for game in games:

        source_text = build_source_text(game)
        # print(source_text)

        pairs.append((query, source_text))

        enriched.append({
            "game": game["name"],
            "primary_score": dict_results[game["game_id"]],
            "ce_score": 0.0
        })

    # главный шаг
    scores = get_cross_encoder().predict(pairs)
    # print(scores)

    for i, score in enumerate(scores):
        enriched[i]["ce_score"] = float(score)

    # сортировка (больше = лучше)
    enriched.sort(key=lambda x: x["ce_score"], reverse=True)

    return enriched


def mix_embeddings(
    text_embedding: Optional[list],
    refer_game_embedding: Optional[list],
    alpha: float = 0.7
):
    """
    alpha = 1.0 → только игра-референс
    alpha = 0.0 → только текст
    """

    if text_embedding is None and refer_game_embedding is None:
        raise ValueError("Both embeddings are None")

    if text_embedding is None:
        return normalize(refer_game_embedding)

    if refer_game_embedding is None:
        return normalize(text_embedding)

    mixed = [
        alpha * g + (1 - alpha) * t
        for g, t in zip(refer_game_embedding, text_embedding)
    ]

    return normalize(mixed)


def search_similar_games(
    query: str,
    players_min: Optional[int] = None,
    players_max: Optional[int] = None,
    playtime_min: Optional[int] = None,
    playtime_max: Optional[int] = None,
    weight_min: Optional[float] = 0,
    weight_max: Optional[float] = 5,
    mechanics: Optional[list[int]] = None,
    categories: Optional[list[int]] = None,
    reference_game_id: Optional[int] = None,
    alpha: float = 0.7,
    top_k: int = 5,
):
    database_url = os.getenv("DATABASE_URL")

    if not database_url:
        raise RuntimeError("DATABASE_URL не найден")

    text_embedding = None
    game_embedding = None
    refer_game_embedding = None

    where_clauses = ["ge.embedding IS NOT NULL"]
    where_params = []

    if query:
        text_embedding = get_embedding(query)

    if reference_game_id:
        refer_game_embedding = get_game_embedding_by_id(reference_game_id)
        where_clauses.append("g.game_id != %s")
        where_params.append(reference_game_id)

    query_embedding = mix_embeddings(
        text_embedding=text_embedding,
        refer_game_embedding=refer_game_embedding,
        alpha=alpha
    )

    # players — hard filter
    if players_min is not None and players_max is not None:
        where_clauses.append("g.min_players <= %s AND g.max_players >= %s")
        where_params.extend([players_min, players_max])
    elif players_min is not None:
        where_clauses.append("g.max_players >= %s")
        where_params.append(players_min)
    elif players_max is not None:
        where_clauses.append("g.min_players <= %s")
        where_params.append(players_max)

    # playtime — soft filter
    all_playtime = playtime_min is not None and playtime_max is not None
    if all_playtime:
        where_clauses.append("g.playtime BETWEEN GREATEST(0, %s - 60) AND %s + 60")
        where_params.extend([playtime_min, playtime_max])
    elif playtime_min is not None:
        where_clauses.append("g.playtime >= GREATEST(0, %s - 60)")
        where_params.append(playtime_min)
    elif playtime_max is not None:
        where_clauses.append("g.playtime <= %s + 60")
        where_params.append(playtime_max)

    # weight — soft filter
    if weight_min is not None and weight_max is not None:
        where_clauses.append("g.weight BETWEEN GREATEST(0, %s - 0.7) AND %s + 0.7")
        where_params.extend([weight_min, weight_max])
    elif weight_min is not None:
        where_clauses.append("g.weight >= GREATEST(0, %s - 0.7)")
        where_params.append(weight_min)
    elif weight_max is not None:
        where_clauses.append("g.weight <= %s + 0.7")
        where_params.append(weight_max)

    if mechanics:
        where_clauses.append("""
            EXISTS (
                SELECT 1
                FROM games_mechanics gm_filter
                WHERE gm_filter.game_id = g.game_id
                AND gm_filter.mechanic_id = ANY(%s)
            )
        """)
        where_params.append(mechanics)

    # categories filter
    if categories:
        where_clauses.append("""
            EXISTS (
                SELECT 1
                FROM games_categories gc_filter
                WHERE gc_filter.game_id = g.game_id
                AND gc_filter.category_id = ANY(%s)
            )
        """)
        where_params.append(categories)

    sql = f"""
    WITH query AS (
        SELECT %s::vector AS qvec
    ),

    total_games AS (
        SELECT COUNT(DISTINCT game_id)::float AS total
        FROM games
    ),
    mechanic_stats AS (
        SELECT
            gm.mechanic_id,
            COUNT(DISTINCT gm.game_id)::float AS games_count
        FROM games_mechanics gm
        GROUP BY gm.mechanic_id
    ),
    mechanics_scored AS (
        SELECT
            m.mechanic_id,
            m.name,
            (m.embedding <-> q.qvec) AS mech_distance,

            LOG(tg.total / NULLIF(ms.games_count, 0)) AS mechanic_idf,

            (
                LOG(tg.total / NULLIF(ms.games_count, 0))
                *
                EXP(-1.5 * (m.embedding <-> q.qvec))
            ) AS weighted_bonus

        FROM mechanics m
        CROSS JOIN query q
        CROSS JOIN total_games tg
        JOIN mechanic_stats ms
            ON ms.mechanic_id = m.mechanic_id
        WHERE m.embedding IS NOT NULL
    ),
    top_query_mechanics AS (
        SELECT mechanic_id
        FROM mechanics_scored
        ORDER BY weighted_bonus DESC
        LIMIT 5
    ),
    core_mechanic_match AS (
        SELECT
            gm.game_id,
            COUNT(*) AS matched_core,
            string_agg(m.name, ', ') AS matched_core_names
        FROM games_mechanics gm
        JOIN top_query_mechanics tqm
            ON tqm.mechanic_id = gm.mechanic_id
        LEFT JOIN mechanics m
            ON m.mechanic_id = gm.mechanic_id
        GROUP BY gm.game_id
    ),
    game_mechanics_match AS (
        SELECT
            gm.game_id,
            ms.name,
            ms.mech_distance,
            ms.mechanic_idf,
            ms.weighted_bonus
        FROM games_mechanics gm
        JOIN mechanics_scored ms
            ON ms.mechanic_id = gm.mechanic_id
    ),
        -- агрегируем
    game_mechanics_score AS (
        SELECT
            game_id,

            --SUM(
            --    CASE
            --        WHEN weighted_bonus > {MECHANICS_LIMIT} THEN weighted_bonus
            --        ELSE 0
            --    END
            --) AS mechanics_score,

            LOG(
                1 + SUM(
                    CASE
                        WHEN weighted_bonus > {MECHANICS_LIMIT} THEN weighted_bonus
                        ELSE 0
                    END
                )
            ) AS mechanics_score,

            MAX(weighted_bonus) AS max_mechanic_score,

            COUNT(*) FILTER (
                WHERE weighted_bonus > {MECHANICS_LIMIT}
            ) AS strong_mechanics_count,

            STRING_AGG(
                name || ', w: ' || ROUND(weighted_bonus::numeric, 2) || ' idf: ' || ROUND(mechanic_idf::numeric, 2) || ' distance: ' || ROUND(mech_distance::numeric, 2),
                ';\n'
                ORDER BY weighted_bonus DESC
            ) AS matched_mechanics

        FROM game_mechanics_match
        GROUP BY game_id
    ),
    categories_scored AS (
        SELECT
            c.category_id,
            c.name,
            (c.embedding <-> q.qvec) AS cat_distance,
            -- мягкий скор (без IDF)
            EXP(-1.5 * (c.embedding <-> q.qvec)) AS category_weight
        FROM categories c
        CROSS JOIN query q
        WHERE c.embedding IS NOT NULL
    ),
    game_category_match AS (
        SELECT
            gc.game_id,
            cs.name,
            cs.category_weight
        FROM games_categories gc
        JOIN categories_scored cs
            ON cs.category_id = gc.category_id
    ),
    game_category_score AS (
        SELECT
            game_id,
            -- saturation (как у механик)
            LOG(1 + SUM(category_weight)) AS category_score,
            MAX(category_weight) AS max_category_score,
            COUNT(*) FILTER (
                WHERE category_weight > 0.3
            ) AS strong_category_count
        FROM game_category_match
        GROUP BY game_id
    )
        SELECT
            g.game_id,
            g.name,
            g.rating,
            g.weight,
            g.playtime,

            -- обычный embedding distance
            (ge.embedding <-> q.qvec) AS text_distance,

            -- mechanics bonus
            COALESCE(gms.mechanics_score, 0) AS mechanics_score,

            COALESCE(gms.strong_mechanics_count, 0) AS strong_mechanics_count,

            COALESCE(gms.matched_mechanics, '') AS matched_mechanics,
            --'' as matched_mechanics,

            max_mechanic_score,

            COALESCE(gcs.category_score, 0) AS category_score,
            COALESCE(gcs.max_category_score, 0) AS max_category_score,

            COALESCE(
                    EXP(
                        -2.0 * (
                            COALESCE(gms.max_mechanic_score, 0)
                            + LOG(1 + COALESCE(gms.strong_mechanics_count, 0))
                        )
                    ),
                    1
            ) AS mechanics_penalty,

            matched_core_names,

            -- FINAL SCORE:
            -- embedding distance
            -- минус бонус за хорошие совпадения механик
            (
                {TEXT_WEIGHT} * (ge.embedding <-> q.qvec)
                -
                {MECHANICS_WEIGHT} * COALESCE(gms.mechanics_score + 1.5 * max_mechanic_score, 0)
                -
                {CATEGORY_WEIGHT} * COALESCE(gcs.category_score + 2 * gcs.max_category_score, 0)
                -- + 
                -- {CORE_MECHANICS_WEIGHT} * EXP(-1.0 * COALESCE(cm.matched_core, 0))
            --) 
            --* 
            --COALESCE(
            --        EXP(
            --            -2.0 * (
            --                COALESCE(gms.max_mechanic_score, 0)
            --                + LOG(1 + COALESCE(gms.strong_mechanics_count, 0))
            --            )
            --        ),
            --        1
            ) AS final_score

        FROM game_embeddings ge
        JOIN games g
            ON g.game_id = ge.game_id
            --and g.name = 'Keyflower'

        CROSS JOIN query q

        LEFT JOIN game_mechanics_score gms
            ON gms.game_id = g.game_id

        LEFT JOIN game_category_score gcs
            ON gcs.game_id = g.game_id

        LEFT JOIN core_mechanic_match cm 
            ON cm.game_id = g.game_id

        WHERE {" AND ".join(where_clauses)}

        ORDER BY
            final_score ASC,
            text_distance ASC

        LIMIT %s;
    """

    params = [query_embedding] + where_params + [top_k]

    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(sql, params)
            results = cur.fetchall()

    return results



if __name__ == "__main__":
    query = str.strip("""
        Экономическая настольная игра, в которой игроки используют рабочих разных цветов для размещения на общих и чужих территориях, участвуют в аукционе за тайлы и развивают свои поселения.
        """).strip()

    load_dotenv()

    if query:
        query = translator(query)
    reference_game_id = None

    union_query = None
    formatted_refer_info = None

    if reference_game_id and query:
        reference_game_info = load_games_from_db([reference_game_id])[0]
        formatted_refer_info = build_source_text(reference_game_info)
        union_query = f"Reference game:\n{formatted_refer_info}.\n\nUser preferences:\n{query}"
        print(f"Запрос: {union_query}")
    elif query:
        print(f"Запрос: {query}")
    else:
        print(f"Запрос не задан, поиск будет основан только на игре с id = {reference_game_id}")
        reference_game_info = load_games_from_db([reference_game_id])[0]
        formatted_refer_info = build_source_text(reference_game_info)

    results = search_similar_games(
        query,
        # weight_min=2.0,
        # weight_max=3.5,
        # mechanics=[29],
        # categories=[127],
        reference_game_id=reference_game_id,
        alpha=0.4,
        top_k=SAMPLE_SIZE,
    )   

    if union_query:
        reranked = rerank_with_cross_encoder(union_query, results)
    elif query:
        reranked = rerank_with_cross_encoder(query, results)
    else:
        reranked = rerank_with_cross_encoder(formatted_refer_info, results)

    final = reranked[:GAMES_TOP_K]

    print("\n🎲 Похожие игры:\n")
    # for game_id, name, rating, weight, playtime, text_distance, mechanics_score, strong_mechanics_count, matched_mechanics, max_mechanic_score, category_score, max_category_score, mechanics_penalty, matched_core_names, final_score in results:
    #     print(name)
    #     print(
    #         f"  rating: {rating} | weight: {weight} | playtime: {playtime} | "
    #         f"text_distance: {text_distance:.4f} | mechanics_score: {mechanics_score:.4f} | "
    #         f"strong_mechanics_count: {strong_mechanics_count} | "
    #         # f"matched_mechanics: {matched_mechanics} | "
    #         f"max_mechanic_score: {max_mechanic_score:.4f} | category_score: {category_score:.4f} | "
    #         f"max_category_score: {max_category_score:.4f} | mechanics_penalty: {mechanics_penalty:.4f} | final_score: {final_score:.4f}"
    #     )
    #     if matched_mechanics:
    #         print(f"  matched mechanics: {matched_mechanics}")
    #     if matched_core_names:
    #         print(f"  matched core mechanics: {matched_core_names}")
    #     print("-" * 60)

    for game in final:
        print(f"game: {game['game']}, final_score = {game['ce_score']}")
        # print{f"game['primary_score']}\n")