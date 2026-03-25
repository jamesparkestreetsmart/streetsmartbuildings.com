#!/usr/bin/env python3
"""Seed zzz_price_history with daily OHLCV from Yahoo Finance.

Usage:
    python seed_price_history.py
    python seed_price_history.py --ticker AAPL
    python seed_price_history.py --limit 10
    python seed_price_history.py --start-date 2023-01-01
    python seed_price_history.py --dry-run

Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env file.
Safe to re-run (idempotent upsert on security_id + trade_date).
"""

import os
import sys
import json
import time
import math
import argparse
import logging
from datetime import date, datetime, timedelta
from pathlib import Path

from dotenv import load_dotenv
import pandas as pd
import yfinance as yf
from utils import ticker_normalize
import supabase_client as db

LOGS_DIR = Path(__file__).parent / "logs"
LOGS_DIR.mkdir(exist_ok=True)

BATCH_SIZE = 1000
EXPECTED_COLUMNS = {"open", "high", "low", "close", "adj_close", "volume"}

# Set up file logger
run_ts = datetime.now().strftime("%Y%m%d_%H%M%S")
log_file = LOGS_DIR / f"seed_prices_{run_ts}.log"
file_handler = logging.FileHandler(log_file)
file_handler.setFormatter(logging.Formatter("%(asctime)s | %(message)s"))
logger = logging.getLogger("seed_prices")
logger.addHandler(file_handler)
logger.setLevel(logging.INFO)


def log(ticker, status, rows=0, note=""):
    msg = f"{ticker} | {status} | {rows} | {note}"
    logger.info(msg)


def safe_float(val):
    """Convert to float, returning None for NaN/None."""
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return None
    try:
        f = float(val)
        return None if math.isnan(f) else f
    except (ValueError, TypeError):
        return None


def download_with_retry(ticker, start, end, max_retries=3):
    """Download Yahoo Finance data with exponential backoff."""
    for attempt in range(max_retries):
        try:
            df = yf.download(
                ticker,
                start=start,
                end=end,
                auto_adjust=False,
                progress=False,
                threads=False,
            )
            return df
        except Exception as e:
            if attempt < max_retries - 1:
                wait = 2 ** (attempt + 1)
                print(f"  Retry {attempt + 1}/{max_retries} for {ticker} (waiting {wait}s): {e}")
                time.sleep(wait)
            else:
                raise


def upsert_batch_with_retry(batch, max_retries=3):
    """Upsert a batch to zzz_price_history with retry."""
    for attempt in range(max_retries):
        try:
            db.upsert("zzz_price_history", batch, on_conflict="security_id,trade_date")
            return True
        except Exception as e:
            if attempt < max_retries - 1:
                time.sleep(1)
            else:
                return False


def process_ticker(ticker, security_id, start, end, dry_run=False):
    """Download and upsert price data for a single ticker. Returns row count or -1 on failure."""
    try:
        df = download_with_retry(ticker, start, end)
    except Exception as e:
        log(ticker, "DOWNLOAD_FAILED", note=str(e))
        return -1

    if df is None or df.empty:
        log(ticker, "NO_DATA", note="Empty dataframe from Yahoo")
        return 0

    # Defensive MultiIndex flattening (newer yfinance versions)
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    # Normalize column names
    df.columns = [c.strip().replace(" ", "_").lower() for c in df.columns]

    # Verify expected columns
    missing = EXPECTED_COLUMNS - set(df.columns)
    if missing:
        log(ticker, "MISSING_COLUMNS", note=f"Missing: {missing}")
        return -1

    # Drop rows where close is NaN
    df = df.dropna(subset=["close"])

    if df.empty:
        log(ticker, "NO_VALID_ROWS", note="All rows had NaN close")
        return 0

    # Build row dicts
    rows = []
    for idx, row in df.iterrows():
        trade_date = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)[:10]
        rows.append({
            "security_id": security_id,
            "ticker": ticker,
            "trade_date": trade_date,
            "open": safe_float(row["open"]),
            "high": safe_float(row["high"]),
            "low": safe_float(row["low"]),
            "close": safe_float(row["close"]),
            "adj_close": safe_float(row["adj_close"]),
            "volume": int(row["volume"]) if pd.notna(row["volume"]) else None,
            "source": "yahoo",
        })

    if dry_run:
        log(ticker, "DRY_RUN", len(rows))
        return len(rows)

    # Upsert in batches
    total_upserted = 0
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]
        success = upsert_batch_with_retry(batch)
        if success:
            total_upserted += len(batch)
        else:
            # Log failed batch
            failed_file = LOGS_DIR / f"failed_batches_{datetime.now().strftime('%Y%m%d')}.json"
            try:
                existing = json.loads(failed_file.read_text()) if failed_file.exists() else []
            except Exception:
                existing = []
            existing.append({"ticker": ticker, "batch_start": i, "batch_size": len(batch)})
            failed_file.write_text(json.dumps(existing, indent=2))
            log(ticker, "BATCH_FAILED", len(batch), note=f"Batch starting at row {i}")

    log(ticker, "OK", total_upserted)
    return total_upserted


def main():
    parser = argparse.ArgumentParser(description="Seed zzz_price_history from Yahoo Finance")
    parser.add_argument("--ticker", type=str, help="Run for a single ticker only")
    parser.add_argument("--limit", type=int, help="Process only the first N tickers")
    parser.add_argument("--start-date", type=str, default="2020-01-01", help="Start date (default: 2020-01-01)")
    parser.add_argument("--dry-run", action="store_true", help="Parse and print but do not write to DB")
    args = parser.parse_args()

    start = args.start_date
    end = (date.today() + timedelta(days=1)).isoformat()

    print("=" * 50)
    print("SEED PRICE HISTORY")
    print(f"  Date range: {start} to {end}")
    if args.dry_run:
        print("  *** DRY RUN — no DB writes ***")
    print("=" * 50)

    # Fetch securities to process
    if args.ticker:
        normalized = ticker_normalize(args.ticker)
        res = type("R", (), {"data": db.select("zzz_securities", "id,ticker", {"ticker": f"eq.{normalized}"})})()
        securities = res.data or []
        if not securities:
            print(f"ERROR: Ticker '{normalized}' not found in zzz_securities")
            sys.exit(1)
    else:
        res = type("R", (), {"data": db.select("zzz_securities", "id,ticker", {"is_active": "eq.true", "order": "ticker.asc"})})()
        securities = res.data or []

    if args.limit:
        securities = securities[: args.limit]

    total = len(securities)
    print(f"Processing {total} tickers...\n")

    succeeded = 0
    total_rows = 0
    failed_tickers = []

    for i, sec in enumerate(securities):
        ticker = sec["ticker"]
        security_id = sec["id"]

        rows = process_ticker(ticker, security_id, start, end, dry_run=args.dry_run)

        if rows < 0:
            failed_tickers.append(ticker)
        else:
            succeeded += 1
            total_rows += rows

        # Progress every 25 tickers
        if (i + 1) % 25 == 0 or (i + 1) == total:
            print(f"  [{i + 1}/{total}] {ticker} — {rows if rows >= 0 else 'FAILED'} rows")

    # Write failed tickers log
    if failed_tickers:
        failed_file = LOGS_DIR / f"failed_tickers_{datetime.now().strftime('%Y%m%d')}.json"
        failed_file.write_text(json.dumps({"failed": failed_tickers}, indent=2))

    print("\n" + "=" * 50)
    print("SUMMARY")
    print(f"  Total tickers attempted: {total}")
    print(f"  Total tickers succeeded: {succeeded}")
    print(f"  Total rows upserted:     {total_rows}")
    if failed_tickers:
        print(f"  Failed tickers:          {', '.join(failed_tickers)}")
    print(f"  Log written to:          {log_file}")
    print("=" * 50)


if __name__ == "__main__":
    main()
