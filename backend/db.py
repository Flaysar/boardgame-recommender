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