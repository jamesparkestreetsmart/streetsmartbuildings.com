"""Lightweight Supabase REST client using httpx directly.
Avoids the heavy supabase-py SDK which pulls in pyiceberg and other
problematic dependencies on some platforms.
"""

import os
import httpx
from dotenv import load_dotenv

root = os.path.join(os.path.dirname(__file__), "..", "..")
load_dotenv(os.path.join(root, ".env.local"))
load_dotenv(os.path.join(root, ".env"))

SUPABASE_URL = os.environ.get("SUPABASE_URL") or os.environ.get("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env")

REST_URL = f"{SUPABASE_URL}/rest/v1"
HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}


def select(table: str, columns: str = "*", params: dict | None = None) -> list[dict]:
    """SELECT query. params are query string filters like {'is_active': 'eq.true'}."""
    url = f"{REST_URL}/{table}?select={columns}"
    if params:
        for k, v in params.items():
            url += f"&{k}={v}"
    r = httpx.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.json()


def insert(table: str, rows: list[dict]) -> None:
    """INSERT rows (no conflict handling — for append-only tables like logs)."""
    url = f"{REST_URL}/{table}"
    r = httpx.post(url, json=rows, headers=HEADERS, timeout=60)
    r.raise_for_status()


def upsert(table: str, rows: list[dict], on_conflict: str) -> None:
    """UPSERT rows. on_conflict is the column(s) for conflict resolution."""
    url = f"{REST_URL}/{table}"
    h = {**HEADERS, "Prefer": "resolution=merge-duplicates"}
    # PostgREST uses the on_conflict query param
    r = httpx.post(f"{url}?on_conflict={on_conflict}", json=rows, headers=h, timeout=60)
    r.raise_for_status()
