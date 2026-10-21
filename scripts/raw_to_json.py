#!/usr/bin/env python3
"""Embed the metro list (RAW) in the atlas page from data/metro_raw.csv.

data/metro_raw.csv has one row per metro, largest first; the page and every other script take the
metro list and its order from it. Columns:
  metro             metro name as the page shows it
  population        Census Bureau 2025 estimate (2023 MSA definitions), from Wikipedia's metro list
  bachelors_pct     % with a bachelor's or higher, used only for a metro without ACS rows
  black_pct         % Black, kept for reference; the page doesn't use it
  harris_pct        2024 Harris vote share, county results (tonmcg) summed to the metro
  harris_statewide  1 where the state has no county results (Connecticut, Alaska) and harris_pct is statewide

Edit the CSV, then run:
  python3 scripts/raw_to_json.py
"""
import argparse
import csv

from acs_to_json import embed


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--csv", default="data/metro_raw.csv")
    ap.add_argument("--page", default="atlas/index.html")
    a = ap.parse_args()

    num = lambda v: int(v) if v.lstrip("-").isdigit() else float(v)
    with open(a.csv, newline="", encoding="utf-8") as f:
        rows = [[r[0]] + [num(v) for v in r[1:]] for r in list(csv.reader(f))[1:]]
    names = [r[0] for r in rows]
    if len(set(names)) != len(names):
        raise SystemExit("Duplicate metro names in " + a.csv)
    embed(a.page, "RAW", rows)
    print(f"Embedded RAW for {len(rows)} metros into {a.page}")


if __name__ == "__main__":
    main()
