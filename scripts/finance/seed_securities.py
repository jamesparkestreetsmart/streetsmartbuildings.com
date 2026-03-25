#!/usr/bin/env python3
"""Seed zzz_securities from S&P 500, Dow 30, and Nasdaq 100 Wikipedia pages.

Usage:
    python seed_securities.py

Reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env file.
Safe to re-run (idempotent upsert on ticker).
"""

import os
import sys
import io
import pandas as pd
import requests

from utils import ticker_normalize
import supabase_client as db

# Wikipedia blocks default urllib user-agent; use requests with a proper UA
_SESSION = requests.Session()
_SESSION.headers.update({"User-Agent": "EagleEyes-Seed/1.0 (finance script)"})


def fetch_html(url: str) -> str:
    """Fetch HTML from URL with a proper user-agent."""
    r = _SESSION.get(url, timeout=30)
    r.raise_for_status()
    return r.text

GICS_SECTOR_CODE_MAP = {
    "Energy": "10",
    "Materials": "15",
    "Industrials": "20",
    "Consumer Discretionary": "25",
    "Consumer Staples": "30",
    "Health Care": "35",
    "Financials": "40",
    "Information Technology": "45",
    "Communication Services": "50",
    "Utilities": "55",
    "Real Estate": "60",
}

SP500_URL = "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
DOW_URL = "https://en.wikipedia.org/wiki/Dow_Jones_Industrial_Average"
NASDAQ_URL = "https://en.wikipedia.org/wiki/Nasdaq-100"


def find_table_with_columns(tables, required_cols):
    """Find the first table whose columns contain all required column names (case-insensitive)."""
    for df in tables:
        cols_lower = [str(c).strip().lower() for c in df.columns]
        if all(rc.lower() in cols_lower for rc in required_cols):
            # Clean column names
            df.columns = [c.strip() for c in df.columns]
            return df
    return None


def find_column(df, candidates):
    """Find first matching column name from candidates (case-insensitive)."""
    cols_lower = {c.lower(): c for c in df.columns}
    for cand in candidates:
        if cand.lower() in cols_lower:
            return cols_lower[cand.lower()]
    return None


def parse_sp500():
    """Parse S&P 500 constituents from Wikipedia."""
    print("Fetching S&P 500...")
    html = fetch_html(SP500_URL)
    tables = pd.read_html(io.StringIO(html), flavor="lxml")
    df = find_table_with_columns(tables, ["Symbol", "Security"])
    if df is None:
        raise ValueError("Could not find S&P 500 constituents table on Wikipedia")

    records = {}
    sym_col = find_column(df, ["Symbol"])
    sec_col = find_column(df, ["Security"])
    sector_col = find_column(df, ["GICS Sector"])
    sub_col = find_column(df, ["GICS Sub-Industry"])

    for _, row in df.iterrows():
        ticker = ticker_normalize(str(row[sym_col]))
        if not ticker:
            continue
        sector = str(row[sector_col]).strip() if sector_col and pd.notna(row[sector_col]) else None
        records[ticker] = {
            "ticker": ticker,
            "company_name": str(row[sec_col]).strip() if pd.notna(row[sec_col]) else None,
            "gics_sector": sector,
            "gics_sub_industry": str(row[sub_col]).strip() if sub_col and pd.notna(row[sub_col]) else None,
            "gics_sector_code": GICS_SECTOR_CODE_MAP.get(sector) if sector else None,
            "index_membership": ["sp500"],
            "exchange": None,
            "is_active": True,
        }

    print(f"  S&P 500: {len(records)} tickers parsed")
    return records


def parse_dow30():
    """Parse Dow 30 constituents from Wikipedia."""
    print("Fetching Dow 30...")
    html = fetch_html(DOW_URL)
    tables = pd.read_html(io.StringIO(html), flavor="lxml")
    df = find_table_with_columns(tables, ["Symbol", "Company"])
    if df is None:
        raise ValueError("Could not find Dow 30 constituents table on Wikipedia")

    records = {}
    sym_col = find_column(df, ["Symbol"])
    comp_col = find_column(df, ["Company"])

    for _, row in df.iterrows():
        ticker = ticker_normalize(str(row[sym_col]))
        if not ticker:
            continue
        records[ticker] = {
            "ticker": ticker,
            "company_name": str(row[comp_col]).strip() if pd.notna(row[comp_col]) else None,
            "index_membership": ["dow"],
        }

    print(f"  Dow 30: {len(records)} tickers parsed")
    return records


def parse_nasdaq100():
    """Parse Nasdaq 100 constituents from Wikipedia."""
    print("Fetching Nasdaq 100...")
    html = fetch_html(NASDAQ_URL)
    tables = pd.read_html(io.StringIO(html), flavor="lxml")
    # Try Ticker+Company first, then Ticker+Security
    df = find_table_with_columns(tables, ["Ticker", "Company"])
    if df is None:
        df = find_table_with_columns(tables, ["Ticker", "Security"])
    if df is None:
        raise ValueError("Could not find Nasdaq 100 constituents table on Wikipedia")

    records = {}
    sym_col = find_column(df, ["Ticker"])
    comp_col = find_column(df, ["Company", "Security"])

    for _, row in df.iterrows():
        ticker = ticker_normalize(str(row[sym_col]))
        if not ticker:
            continue
        records[ticker] = {
            "ticker": ticker,
            "company_name": str(row[comp_col]).strip() if comp_col and pd.notna(row[comp_col]) else None,
            "index_membership": ["nasdaq100"],
        }

    print(f"  Nasdaq 100: {len(records)} tickers parsed")
    return records


def merge(sp500, dow30, nasdaq100):
    """Merge all sources into a unified dict keyed by normalized ticker."""
    master = {}

    # S&P 500 first (most complete metadata)
    for ticker, data in sp500.items():
        master[ticker] = data

    # Dow 30
    for ticker, data in dow30.items():
        if ticker in master:
            master[ticker]["index_membership"] = sorted(
                set(master[ticker]["index_membership"] + data["index_membership"])
            )
        else:
            master[ticker] = {
                "ticker": ticker,
                "company_name": data["company_name"],
                "gics_sector": None,
                "gics_sub_industry": None,
                "gics_sector_code": None,
                "index_membership": data["index_membership"],
                "exchange": None,
                "is_active": True,
            }

    # Nasdaq 100
    for ticker, data in nasdaq100.items():
        if ticker in master:
            master[ticker]["index_membership"] = sorted(
                set(master[ticker]["index_membership"] + data["index_membership"])
            )
        else:
            master[ticker] = {
                "ticker": ticker,
                "company_name": data["company_name"],
                "gics_sector": None,
                "gics_sub_industry": None,
                "gics_sector_code": None,
                "index_membership": data["index_membership"],
                "exchange": None,
                "is_active": True,
            }

    # Ensure index_membership is always deduplicated and sorted
    for t in master.values():
        t["index_membership"] = sorted(set(t["index_membership"]))

    print(f"\nMerged: {len(master)} unique tickers")
    return master


def upsert_securities(master):
    """Upsert all securities to zzz_securities in batches of 50."""
    rows = list(master.values())
    batch_size = 50
    total_upserted = 0
    errors = 0

    for i in range(0, len(rows), batch_size):
        batch = rows[i : i + batch_size]
        try:
            db.upsert("zzz_securities", batch, on_conflict="ticker")
            total_upserted += len(batch)
        except Exception as e:
            print(f"  ERROR upserting batch {i // batch_size + 1}: {e}")
            errors += len(batch)

    print(f"\nUpsert complete: {total_upserted} rows upserted, {errors} errors")
    return total_upserted, errors


def main():
    print("=" * 50)
    print("SEED SECURITIES")
    print("=" * 50)

    sp500 = parse_sp500()
    dow30 = parse_dow30()
    nasdaq100 = parse_nasdaq100()
    master = merge(sp500, dow30, nasdaq100)
    upserted, errors = upsert_securities(master)

    print("\n" + "=" * 50)
    print("SUMMARY")
    print(f"  S&P 500:    {len(sp500)} tickers")
    print(f"  Dow 30:     {len(dow30)} tickers")
    print(f"  Nasdaq 100: {len(nasdaq100)} tickers")
    print(f"  Unique:     {len(master)} tickers")
    print(f"  Upserted:   {upserted}")
    print(f"  Errors:     {errors}")
    print("=" * 50)


if __name__ == "__main__":
    main()
