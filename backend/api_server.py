import os
from typing import Optional

import psycopg
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

import time
import logging

# from db import pool
from dm import get_connection

logging.getLogger("psycopg.pool").setLevel(logging.INFO)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s"
)

def log_time(label: str, start: float):
    elapsed = time.perf_counter() - start
    logging.info(f"{label}: {elapsed:.3f}s")

from get_similar_v4 import (
    GAMES_TOP_K,
    SAMPLE_SIZE,
    get_cross_encoder,
    get_model,
    load_games_from_db,
    rerank_with_cross_encoder,
    search_similar_games,
    translator,
)


load_dotenv()

app = FastAPI(title="BoardGame Recommender API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)



# logging.info("До connect")

# t = time.time()

# conn = psycopg.connect(
#     os.getenv("DATABASE_URL"),
#     connect_timeout=5
# )

# logging.info(f"CONNECT OK: {time.time() - t:.2f}s")


class RecommendRequest(BaseModel):
    query: Optional[str] = None
    players_min: Optional[int] = None
    players_max: Optional[int] = None
    playtime_min: Optional[int] = None
    playtime_max: Optional[int] = None
    weight_min: Optional[float] = 0
    weight_max: Optional[float] = 5
    mechanics: Optional[list[int]] = None
    categories: Optional[list[int]] = None
    reference_game_id: Optional[int] = None
    alpha: float = 0.7
    top_k: int = Field(default=SAMPLE_SIZE, ge=1, le=100)
    translate_ru: bool = True


def _has_cyrillic(text: str) -> bool:
    return any("а" <= ch.lower() <= "я" or ch.lower() == "ё" for ch in text)



def _get_images_by_game_ids(game_ids: list[int]) -> dict[int, Optional[str]]:
    t0 = time.perf_counter()

    if not game_ids:
        return {}

    sql = """
        SELECT game_id, image_url
        FROM games
        WHERE game_id = ANY(%s)
    """
    out: dict[int, Optional[str]] = {}
    # with pool.connection() as conn:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (game_ids,))
            for game_id, image_url in cur.fetchall():
                out[int(game_id)] = image_url
    log_time("get images", t0)
    return out


def _table_has_column(cur, table_name: str, column_name: str) -> bool:
    cur.execute(
        """
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = %s
          AND column_name = %s
        LIMIT 1
        """,
        (table_name, column_name),
    )
    return cur.fetchone() is not None


def _get_game_details_by_ids(game_ids: list[int]) -> dict[int, dict]:
    t0 = time.perf_counter()
    if not game_ids:
        return {}
    games = load_games_from_db(game_ids)
    log_time("load game details", t0)

    by_id: dict[int, dict] = {}
    for g in games:
        gid = int(g["game_id"])
        by_id[gid] = {
            "description": g.get("description"),
            "min_players": int(g["min_players"]) if g.get("min_players") is not None else None,
            "max_players": int(g["max_players"]) if g.get("max_players") is not None else None,
            "year": int(g["year"]) if g.get("year") is not None else None,
            "mechanics": g.get("mechanics") or [],
            "categories": g.get("categories") or [],
        }
    return by_id


def _row_to_payload(row: tuple, image_url: Optional[str] = None) -> dict:
    (
        game_id,
        name,
        rating,
        weight,
        playtime,
        _text_distance,
        _mechanics_score,
        _strong_mechanics_count,
        _matched_mechanics,
        _max_mechanic_score,
        _category_score,
        _max_category_score,
        _mechanics_penalty,
        _matched_core_names,
        _final_score,
    ) = row
    return {
        "game_id": int(game_id),
        "name": name,
        "rating": float(rating) if rating is not None else None,
        "weight": float(weight) if weight is not None else None,
        "playtime": int(playtime) if playtime is not None else None,
        "image_url": image_url,
    }


@app.get("/health")
def health():
    return {"ok": True}


@app.get("/games/search")
def search_games_by_name(q: str = Query(min_length=1), limit: int = Query(default=20, ge=1, le=100)):
    sql = """
        SELECT game_id, name, image_url
        FROM games
        WHERE name ILIKE %s
        ORDER BY rating DESC NULLS LAST, name ASC
        LIMIT %s
    """
    items = []
    # with pool.connection() as conn:
    with get_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(sql, (f"%{q.strip()}%", limit))
            for game_id, name, image_url in cur.fetchall():
                items.append(
                    {
                        "game_id": int(game_id),
                        "name": name,
                        "image_url": image_url,
                    }
                )
    return {"games": items}


@app.get("/meta")
def meta():
    mechanics = []
    categories = []
    # with pool.connection() as conn:
    with get_connection() as conn:
        with conn.cursor() as cur:
            mech_has_desc = _table_has_column(cur, "mechanics", "description")
            cat_has_desc = _table_has_column(cur, "categories", "description")

            mechanics_sql = (
                "SELECT mechanic_id, name, description FROM mechanics ORDER BY name ASC"
                if mech_has_desc
                else "SELECT mechanic_id, name, NULL::text as description FROM mechanics ORDER BY name ASC"
            )
            categories_sql = (
                "SELECT category_id, name, description FROM categories ORDER BY name ASC"
                if cat_has_desc
                else "SELECT category_id, name, NULL::text as description FROM categories ORDER BY name ASC"
            )

            cur.execute(mechanics_sql)
            mechanics = [
                {"id": int(mid), "name": name, "description": desc}
                for mid, name, desc in cur.fetchall()
            ]
            cur.execute(categories_sql)
            categories = [
                {"id": int(cid), "name": name, "description": desc}
                for cid, name, desc in cur.fetchall()
            ]
    return {"mechanics": mechanics, "categories": categories}


@app.post("/recommend")
def recommend(payload: RecommendRequest):
    total_start = time.perf_counter()

    query = (payload.query or "").strip()
    logging.info(f"START recommend | query='{query}'")
    if not query and payload.reference_game_id is None:
        raise HTTPException(
            status_code=422,
            detail="Нужен либо query, либо reference_game_id",
        )

    search_query = query

    t0 = time.perf_counter()
    if query and payload.translate_ru and _has_cyrillic(query):
        search_query = translator(query)
    log_time("translation", t0)

    t0 = time.perf_counter()
    try:
        results = search_similar_games(
            query=search_query,
            players_min=payload.players_min,
            players_max=payload.players_max,
            playtime_min=payload.playtime_min,
            playtime_max=payload.playtime_max,
            weight_min=payload.weight_min,
            weight_max=payload.weight_max,
            mechanics=payload.mechanics,
            categories=payload.categories,
            reference_game_id=payload.reference_game_id,
            alpha=payload.alpha,
            top_k=SAMPLE_SIZE,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка поиска: {e}")

    log_time("vector_search (SQL + embeddings)", t0)

    t0 = time.perf_counter()
    try:
        if payload.reference_game_id and search_query:
            ref_game = load_games_from_db([payload.reference_game_id])[0]
            formatted_ref = (
                f"Reference game:\n{ref_game['name']}\n\nUser preferences:\n{search_query}"
            )
            reranked = rerank_with_cross_encoder(formatted_ref, results)
        elif search_query:
            reranked = rerank_with_cross_encoder(search_query, results)
        else:
            # only reference game mode
            ref_game = load_games_from_db([payload.reference_game_id])[0]
            fallback_q = ref_game["name"] or "reference game"
            reranked = rerank_with_cross_encoder(fallback_q, results)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Ошибка rerank: {e}")
    
    log_time("cross_encoder_rerank", t0)


    t0 = time.perf_counter()

    final = reranked[:GAMES_TOP_K]
    game_ids = [int(item["primary_score"][0]) for item in final]
    image_by_id = _get_images_by_game_ids(game_ids)
    details_by_id = _get_game_details_by_ids(game_ids)

    log_time("db enrichment (images + details)", t0)

    t0 = time.perf_counter()

    games = []
    for item in final:
        row = item["primary_score"]
        game_id = int(row[0])
        model = _row_to_payload(row=row, image_url=image_by_id.get(game_id))
        details = details_by_id.get(game_id, {})
        model.update(details)
        games.append(model)

    log_time("response build", t0)

    log_time("TOTAL REQUEST", total_start)

    return {
        "query_used": search_query if search_query else None,
        "count": len(games),
        "games": games,
    }


@app.on_event("startup")
async def startup_event():
    get_model()
    get_cross_encoder()