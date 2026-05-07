import os
from psycopg_pool import ConnectionPool

pool = ConnectionPool(
    conninfo=os.getenv("DATABASE_URL"),
    min_size=1,
    max_size=10,
    timeout=30,
    kwargs={
        "autocommit": True,
        "connect_timeout": 5,
    }
)