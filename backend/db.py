# import os
# from psycopg_pool import ConnectionPool

# pool = ConnectionPool(
#     conninfo=os.getenv("DATABASE_URL"),
#     min_size=1,
#     max_size=10,

#     timeout=15,

#     max_lifetime=60 * 5,
#     max_idle=60,

#     num_workers=3,

#     kwargs={
#         "autocommit": True,

#         "connect_timeout": 5,

#         "keepalives": 1,
#         "keepalives_idle": 30,
#         "keepalives_interval": 10,
#         "keepalives_count": 5,

#         "application_name": "boardgame-recommender",

#         "options": "-c statement_timeout=60000"
#     },

#     check=ConnectionPool.check_connection
# )

import os
import psycopg
import logging

logger = logging.getLogger(__name__)

def build_db_url():
    return (
        f"postgresql://{os.getenv('POSTGRES_USER')}:"
        f"{os.getenv('POSTGRES_PASSWORD')}@"
        f"{os.getenv('POSTGRES_HOST')}:"
        f"{os.getenv('POSTGRES_PORT')}/"
        f"{os.getenv('POSTGRES_DB')}"
    )

def get_connection():
    dsn = build_db_url()

    logger.info(f"[DB] Connecting with DSN: {dsn}")

    return psycopg.connect(
        dsn,
        autocommit=True,
        connect_timeout=5,
    )