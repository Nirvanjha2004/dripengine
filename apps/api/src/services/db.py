import asyncpg
import os
from dotenv import load_dotenv

load_dotenv()

_pool = None


async def get_pool() -> asyncpg.Pool:
    """
    Returns the shared asyncpg connection pool.
    Created once on first call, reused after that.
    """
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(
            dsn=os.getenv("DATABASE_URL"),
            min_size=2,
            max_size=10,
        )
    return _pool


async def close_pool():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


async def init_db():
    """
    Creates the tables if they don't exist yet.
    Run once on startup.

    Tables:
      contacts        - one row per unique email, stores properties + timezone
      enrollments     - one row per (email, sequence_id), tracks current step
      contact_events  - append-only log of every event fired per contact
    """
    pool = await get_pool()
    async with pool.acquire() as conn:
        await conn.execute("""
            CREATE TABLE IF NOT EXISTS contacts (
                email       TEXT PRIMARY KEY,
                name        TEXT,
                timezone    TEXT NOT NULL DEFAULT 'UTC',
                properties  JSONB NOT NULL DEFAULT '{}'
            );

            CREATE TABLE IF NOT EXISTS enrollments (
                id           SERIAL PRIMARY KEY,
                email        TEXT NOT NULL,
                sequence_id  TEXT NOT NULL,
                current_step TEXT,
                enrolled_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                unenrolled_at TIMESTAMPTZ,
                status       TEXT NOT NULL DEFAULT 'active',
                UNIQUE (email, sequence_id)
            );

            CREATE TABLE IF NOT EXISTS contact_events (
                id          SERIAL PRIMARY KEY,
                email       TEXT NOT NULL,
                event_name  TEXT NOT NULL,
                properties  JSONB NOT NULL DEFAULT '{}',
                fired_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );

            CREATE INDEX IF NOT EXISTS idx_contact_events_email
                ON contact_events (email);

            CREATE INDEX IF NOT EXISTS idx_enrollments_email_seq
                ON enrollments (email, sequence_id);
        """)