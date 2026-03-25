#!/usr/bin/env python3
"""Daily price cron — fetches prices, detects constituent changes (Sundays),
and enriches missing sector data.

Execution order:
  Step 1  — Acquire lock (with stale recovery)
  Step 2  — try/finally wrapper
  Step 3  — Fetch active securities
  Step B  — Constituent change detection (SUNDAYS ONLY)
  Step A  — Sector enrichment (null gics_sector only)
  Step 4  — Build date window
  Step 5  — Fetch + validate + parse Yahoo prices
  Step 6  — Upsert to zzz_price_history
  Step 7  — Release lock + audit log

Usage:
    python daily_price_cron.py
    python daily_price_cron.py --skip-prices    # Only run Steps B + A
    python daily_price_cron.py --force-sunday   # Force constituent check regardless of day
"""

import os
import io
import sys
import json
import math
import time
import argparse
import logging
from datetime import date, datetime, timedelta
from pathlib import Path

import pandas as pd
import requests
import httpx

from utils import ticker_normalize
import supabase_client as db

LOGS_DIR = Path(__file__).parent / "logs"
LOGS_DIR.mkdir(exist_ok=True)

run_ts = datetime.now().strftime("%Y%m%d_%H%M%S")
log_file = LOGS_DIR / f"daily_cron_{run_ts}.log"
file_handler = logging.FileHandler(log_file)
file_handler.setFormatter(logging.Formatter("%(asctime)s | %(message)s"))
logger = logging.getLogger("daily_cron")
logger.addHandler(file_handler)
logger.addHandler(logging.StreamHandler())
logger.setLevel(logging.INFO)

# Wikipedia scraping session
_SESSION = requests.Session()
_SESSION.headers.update({"User-Agent": "EagleEyes-Cron/1.0"})

# GICS sector mapping: Yahoo sector → (GICS name, GICS code)
YAHOO_TO_GICS = {
    "Technology":             ("Information Technology", "45"),
    "Healthcare":             ("Health Care", "35"),
    "Financial Services":     ("Financials", "40"),
    "Consumer Cyclical":      ("Consumer Discretionary", "25"),
    "Consumer Defensive":     ("Consumer Staples", "30"),
    "Communication Services": ("Communication Services", "50"),
    "Industrials":            ("Industrials", "20"),
    "Basic Materials":        ("Materials", "15"),
    "Energy":                 ("Energy", "10"),
    "Real Estate":            ("Real Estate", "60"),
    "Utilities":              ("Utilities", "55"),
}

SP500_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
DOW_URL = "https://en.wikipedia.org/wiki/Dow_Jones_Industrial_Average"
NASDAQ_URL = "https://en.wikipedia.org/wiki/Nasdaq-100"


# ═══════════════════════════════════════════════════
# Step 3 — Fetch active securities
# ═══════════════════════════════════════════════════

def fetch_active_securities():
    """Fetch all active securities and build lookup maps."""
    rows = db.select(
        "zzz_securities",
        "id,ticker,gics_sector,index_membership_current,index_membership_historical,added_to_index_at,removed_from_index_at",
        {"is_active": "eq.true", "order": "ticker.asc"},
    )
    ticker_map = {}  # ticker → full row
    id_map = {}      # ticker → uuid
    for r in rows:
        ticker_map[r["ticker"]] = r
        id_map[r["ticker"]] = r["id"]
    logger.info(f"Step 3: Fetched {len(rows)} active securities")
    return ticker_map, id_map


# ═══════════════════════════════════════════════════
# Step B — Constituent change detection (Sundays)
# ═══════════════════════════════════════════════════

def fetch_html(url):
    r = _SESSION.get(url, timeout=30)
    r.raise_for_status()
    return r.text


def find_table_with_columns(tables, required_cols):
    for df in tables:
        cols_lower = [str(c).strip().lower() for c in df.columns]
        if all(rc.lower() in cols_lower for rc in required_cols):
            df.columns = [str(c).strip() for c in df.columns]
            return df
    return None


def find_column(df, candidates):
    cols_lower = {c.lower(): c for c in df.columns}
    for cand in candidates:
        if cand.lower() in cols_lower:
            return cols_lower[cand.lower()]
    return None


def scrape_constituents():
    """Scrape current index constituents from Wikipedia. Returns {indexKey: Map<ticker, companyName>}."""
    result = {}

    # S&P 500
    try:
        html = fetch_html(SP500_URL)
        tables = pd.read_html(io.StringIO(html), flavor="lxml")
        df = find_table_with_columns(tables, ["Symbol", "Security"])
        if df is not None:
            sym_col = find_column(df, ["Symbol"])
            sec_col = find_column(df, ["Security"])
            m = {}
            for _, row in df.iterrows():
                t = ticker_normalize(str(row[sym_col]))
                if t:
                    m[t] = str(row[sec_col]).strip() if pd.notna(row[sec_col]) else t
            result["sp500"] = m
            logger.info(f"  Scraped S&P 500: {len(m)} tickers")
    except Exception as e:
        logger.error(f"  Failed to scrape S&P 500: {e}")

    # Dow 30
    try:
        html = fetch_html(DOW_URL)
        tables = pd.read_html(io.StringIO(html), flavor="lxml")
        df = find_table_with_columns(tables, ["Symbol", "Company"])
        if df is not None:
            sym_col = find_column(df, ["Symbol"])
            comp_col = find_column(df, ["Company"])
            m = {}
            for _, row in df.iterrows():
                t = ticker_normalize(str(row[sym_col]))
                if t:
                    m[t] = str(row[comp_col]).strip() if pd.notna(row[comp_col]) else t
            result["dow"] = m
            logger.info(f"  Scraped Dow 30: {len(m)} tickers")
    except Exception as e:
        logger.error(f"  Failed to scrape Dow 30: {e}")

    # Nasdaq 100
    try:
        html = fetch_html(NASDAQ_URL)
        tables = pd.read_html(io.StringIO(html), flavor="lxml")
        df = find_table_with_columns(tables, ["Ticker", "Company"])
        if df is None:
            df = find_table_with_columns(tables, ["Ticker", "Security"])
        if df is not None:
            sym_col = find_column(df, ["Ticker"])
            comp_col = find_column(df, ["Company", "Security"])
            m = {}
            for _, row in df.iterrows():
                t = ticker_normalize(str(row[sym_col]))
                if t:
                    m[t] = str(row[comp_col]).strip() if comp_col and pd.notna(row[comp_col]) else t
            result["nasdaq100"] = m
            logger.info(f"  Scraped Nasdaq 100: {len(m)} tickers")
    except Exception as e:
        logger.error(f"  Failed to scrape Nasdaq 100: {e}")

    return result


def detect_constituent_changes(ticker_map, id_map):
    """Step B: Detect index constituent additions and removals."""
    today = date.today().isoformat()
    logger.info("Step B: Constituent change detection")

    constituents = scrape_constituents()
    additions_log = {}
    removals_log = {}

    for index_key, constituent_map in constituents.items():
        current_set = set(constituent_map.keys())
        db_set = set(
            t for t, row in ticker_map.items()
            if row.get("index_membership_current") and index_key in row["index_membership_current"]
        )

        additions = current_set - db_set
        removals = db_set - current_set

        if additions:
            additions_log[index_key] = list(additions)
        if removals:
            removals_log[index_key] = list(removals)

        # Process additions
        for ticker in additions:
            company_name = constituent_map.get(ticker, ticker)

            if ticker not in ticker_map:
                # Brand new ticker — INSERT
                new_row = {
                    "ticker": ticker,
                    "company_name": company_name,
                    "index_membership_current": [index_key],
                    "index_membership_historical": [index_key],
                    "index_membership": [index_key],
                    "added_to_index_at": {index_key: today},
                    "removed_from_index_at": {},
                    "is_active": True,
                    "exchange": None,
                    "gics_sector": None,
                }
                try:
                    db.upsert("zzz_securities", [new_row], on_conflict="ticker")
                    # Fetch the new ID
                    inserted = db.select("zzz_securities", "id,ticker,gics_sector,index_membership_current,index_membership_historical,added_to_index_at,removed_from_index_at", {"ticker": f"eq.{ticker}"})
                    if inserted:
                        ticker_map[ticker] = inserted[0]
                        id_map[ticker] = inserted[0]["id"]
                        # Log membership event
                        db.insert("zzz_index_membership_log", [{
                            "security_id": inserted[0]["id"],
                            "ticker": ticker,
                            "index_key": index_key,
                            "event_type": "added",
                            "event_date": today,
                            "source": "constituent_check",
                        }], on_conflict="id")
                    logger.info(f"  ADDED (new): {ticker} → {index_key}")
                except Exception as e:
                    logger.error(f"  Failed to insert {ticker}: {e}")
            else:
                # Existing ticker — UPDATE arrays
                sec_id = id_map[ticker]
                row = ticker_map[ticker]
                current_membership = list(set((row.get("index_membership_current") or []) + [index_key]))
                historical = list(set((row.get("index_membership_historical") or []) + [index_key]))
                added_at = row.get("added_to_index_at") or {}
                if index_key not in added_at:
                    added_at[index_key] = today

                try:
                    # Use REST API update
                    url = f"{db.REST_URL}/zzz_securities?id=eq.{sec_id}"
                    httpx.patch(url, json={
                        "index_membership_current": current_membership,
                        "index_membership_historical": historical,
                        "index_membership": current_membership,
                        "added_to_index_at": added_at,
                        "is_active": True,
                    }, headers=db.HEADERS, timeout=30).raise_for_status()

                    db.insert("zzz_index_membership_log", [{
                        "security_id": sec_id,
                        "ticker": ticker,
                        "index_key": index_key,
                        "event_type": "added",
                        "event_date": today,
                        "source": "constituent_check",
                    }], on_conflict="id")
                    logger.info(f"  ADDED (existing): {ticker} → {index_key}")
                except Exception as e:
                    logger.error(f"  Failed to update {ticker} addition: {e}")

        # Process removals
        for ticker in removals:
            if ticker not in id_map:
                continue
            sec_id = id_map[ticker]
            row = ticker_map[ticker]
            current_membership = [x for x in (row.get("index_membership_current") or []) if x != index_key]
            removed_at = row.get("removed_from_index_at") or {}
            # Preserve first removal date
            if index_key not in removed_at:
                removed_at[index_key] = today

            try:
                url = f"{db.REST_URL}/zzz_securities?id=eq.{sec_id}"
                httpx.patch(url, json={
                    "index_membership_current": current_membership,
                    "index_membership": current_membership,
                    # Do NOT touch index_membership_historical
                    "removed_from_index_at": removed_at,
                }, headers=db.HEADERS, timeout=30).raise_for_status()

                db.insert("zzz_index_membership_log", [{
                    "security_id": sec_id,
                    "ticker": ticker,
                    "index_key": index_key,
                    "event_type": "removed",
                    "event_date": today,
                    "source": "constituent_check",
                }], on_conflict="id")
                logger.info(f"  REMOVED: {ticker} from {index_key}")
            except Exception as e:
                logger.error(f"  Failed to update {ticker} removal: {e}")

    total_changes = sum(len(v) for v in additions_log.values()) + sum(len(v) for v in removals_log.values())
    if total_changes > 0:
        logger.info(f"  Constituent changes: {json.dumps({'additions': additions_log, 'removals': removals_log})}")
    else:
        logger.info("  No constituent changes detected")

    return additions_log, removals_log


# ═══════════════════════════════════════════════════
# Step A — Sector enrichment
# ═══════════════════════════════════════════════════

def enrich_sectors(ticker_map, id_map):
    """Enrich securities with missing gics_sector from Yahoo Finance."""
    needs_enrichment = [(t, r) for t, r in ticker_map.items() if not r.get("gics_sector")]
    if not needs_enrichment:
        logger.info("Step A: No securities need sector enrichment")
        return []

    logger.info(f"Step A: Enriching {len(needs_enrichment)} securities with missing sectors")
    enriched = []

    for ticker, row in needs_enrichment:
        sec_id = id_map.get(ticker)
        if not sec_id:
            continue

        try:
            url = f"https://query1.finance.yahoo.com/v11/finance/quoteSummary/{ticker}?modules=assetProfile"
            r = httpx.get(url, headers={"User-Agent": "EagleEyes-Cron/1.0"}, timeout=10)

            if r.status_code == 200:
                data = r.json()
                profile = data.get("quoteSummary", {}).get("result", [{}])[0].get("assetProfile", {})
                yahoo_sector = profile.get("sector")
                yahoo_industry = profile.get("industry")

                if not yahoo_sector:
                    logger.warning(f"  {ticker}: No sector from Yahoo")
                    time.sleep(0.2)
                    continue

                gics_name, gics_code = YAHOO_TO_GICS.get(yahoo_sector, (yahoo_sector, None))
                if yahoo_sector not in YAHOO_TO_GICS:
                    logger.warning(f"  {ticker}: Unmapped Yahoo sector '{yahoo_sector}' — stored raw")

                # NOTE: gics_sub_industry = yahooIndustry is a best approximation only.
                # Yahoo's industry strings are not canonical GICS sub-industries.
                patch_url = f"{db.REST_URL}/zzz_securities?id=eq.{sec_id}&gics_sector=is.null"
                httpx.patch(patch_url, json={
                    "gics_sector": gics_name,
                    "gics_sector_code": gics_code,
                    "gics_sub_industry": yahoo_industry,
                }, headers=db.HEADERS, timeout=15).raise_for_status()

                enriched.append(ticker)
                logger.info(f"  {ticker}: {yahoo_sector} → {gics_name} ({gics_code})")
            else:
                logger.warning(f"  {ticker}: Yahoo returned {r.status_code}")
        except Exception as e:
            logger.error(f"  {ticker}: Enrichment failed: {e}")

        time.sleep(0.2)  # Rate limit

    logger.info(f"Step A: Enriched {len(enriched)} securities")
    return enriched


# ═══════════════════════════════════════════════════
# Steps 4-6 — Price fetch + upsert
# ═══════════════════════════════════════════════════

def safe_float(val):
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return None
    try:
        f = float(val)
        return None if math.isnan(f) else f
    except (ValueError, TypeError):
        return None


def fetch_and_upsert_prices(ticker_map, id_map, start_date="2020-01-01"):
    """Fetch daily prices from Yahoo and upsert to zzz_price_history."""
    import yfinance as yf

    end = (date.today() + timedelta(days=1)).isoformat()
    # For daily cron, only fetch recent data
    start = (date.today() - timedelta(days=7)).isoformat()

    tickers = list(ticker_map.keys())
    total = len(tickers)
    succeeded = 0
    total_rows = 0
    failed = []

    logger.info(f"Steps 4-6: Fetching prices for {total} tickers ({start} to {end})")

    for i, ticker in enumerate(tickers):
        sec_id = id_map.get(ticker)
        if not sec_id:
            continue

        try:
            df = yf.download(ticker, start=start, end=end, auto_adjust=False, progress=False, threads=False)

            if df is None or df.empty:
                continue

            if isinstance(df.columns, pd.MultiIndex):
                df.columns = df.columns.get_level_values(0)
            df.columns = [c.strip().replace(" ", "_").lower() for c in df.columns]

            expected = {"open", "high", "low", "close", "adj_close", "volume"}
            if expected - set(df.columns):
                continue

            df = df.dropna(subset=["close"])
            if df.empty:
                continue

            rows = []
            for idx, row in df.iterrows():
                trade_date = idx.strftime("%Y-%m-%d") if hasattr(idx, "strftime") else str(idx)[:10]
                rows.append({
                    "security_id": sec_id,
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

            # Upsert in batches of 1000
            for j in range(0, len(rows), 1000):
                batch = rows[j:j + 1000]
                try:
                    db.upsert("zzz_price_history", batch, on_conflict="security_id,trade_date")
                except Exception as e:
                    logger.error(f"  {ticker}: Batch upsert failed: {e}")

            succeeded += 1
            total_rows += len(rows)

        except Exception as e:
            failed.append(ticker)
            logger.error(f"  {ticker}: Price fetch failed: {e}")

        if (i + 1) % 25 == 0 or (i + 1) == total:
            logger.info(f"  [{i + 1}/{total}] Progress: {succeeded} succeeded, {len(failed)} failed")

    logger.info(f"Steps 4-6: {succeeded}/{total} tickers, {total_rows} rows upserted, {len(failed)} failed")
    return succeeded, total_rows, failed


# ═══════════════════════════════════════════════════
# Main
# ═══════════════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="Daily price cron")
    parser.add_argument("--skip-prices", action="store_true", help="Skip price fetching (Steps 4-6)")
    parser.add_argument("--force-sunday", action="store_true", help="Force constituent check regardless of day")
    args = parser.parse_args()

    logger.info("=" * 50)
    logger.info("DAILY PRICE CRON START")
    logger.info("=" * 50)

    # Step 3
    ticker_map, id_map = fetch_active_securities()

    # Step B — Constituent changes (Sundays only)
    from datetime import timezone
    is_sunday = datetime.now(tz=timezone.utc).weekday() == 6
    additions_log = {}
    removals_log = {}
    if is_sunday or args.force_sunday:
        additions_log, removals_log = detect_constituent_changes(ticker_map, id_map)
    else:
        logger.info("Step B: Skipped (not Sunday)")

    # Step A — Sector enrichment
    enriched = enrich_sectors(ticker_map, id_map)

    # Steps 4-6 — Prices
    if args.skip_prices:
        logger.info("Steps 4-6: Skipped (--skip-prices)")
        succeeded, total_rows, failed = 0, 0, []
    else:
        succeeded, total_rows, failed = fetch_and_upsert_prices(ticker_map, id_map)

    # Step 7 — Summary
    logger.info("=" * 50)
    logger.info("SUMMARY")
    logger.info(f"  Securities: {len(ticker_map)}")
    logger.info(f"  Constituent changes: {sum(len(v) for v in additions_log.values())} additions, {sum(len(v) for v in removals_log.values())} removals")
    logger.info(f"  Sectors enriched: {len(enriched)}")
    logger.info(f"  Prices: {succeeded} tickers, {total_rows} rows")
    if failed:
        logger.info(f"  Failed: {', '.join(failed[:20])}")
    logger.info(f"  Log: {log_file}")
    logger.info("=" * 50)


if __name__ == "__main__":
    main()
