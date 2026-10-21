#!/usr/bin/env python3
"""Embed PRRI religious group shares per metro in atlas/data.js, for the faith filter.

Inputs:
  prri_county.csv   PRRI Census of American Religion county estimates, the dataset.csv
                    behind the maps at https://www.prri.org/census/ (e.g.
                    https://datawrapper.dwcdn.net/3sLhY/2/dataset.csv).
  list1_2023.xlsx   Census Bureau 2023 CBSA delineations, to roll counties up to metros:
                    https://www2.census.gov/programs-surveys/metro-micro/geographies/reference-files/2023/delineation-files/list1_2023.xlsx

Shares are weighted by county population. Writes data/metro_faith.csv and the
`const FAITH = {...};` in atlas/data.js, as {metro: [christian, catholic, protestant,
latter-day saint, jewish, muslim, hindu, buddhist, other religion]} in percent of adults.

Usage:
  python3 scripts/faith_to_json.py prri_county.csv list1_2023.xlsx
"""
import argparse
import csv
import sys

from acs_to_json import DATA, atlas_names, embed
from religion_to_json import metro_means

# Each output column is a sum of PRRI columns
GROUPS = {
    "catholic": ["white_catholic", "hispanic_catholic", "other_catholic"],
    "protestant": ["white_evangelical_protestant", "white_mainline_protestant", "black_protestant",
                   "hispanic_protestant", "other_protestant"],
    "lds": ["mormon"],
    "jewish": ["jewish"], "muslim": ["muslim"], "hindu": ["hindu"], "buddhist": ["buddhist"],
    "other": ["other_religion"],
}
GROUPS = {"christian": GROUPS["catholic"] + GROUPS["protestant"] + ["mormon", "jehovahs_witness", "orthodox_christian"], **GROUPS}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("prri")
    ap.add_argument("delineation")
    ap.add_argument("--page", default=DATA)
    ap.add_argument("--out", default="data/metro_faith.csv")
    a = ap.parse_args()

    atlas = atlas_names(a.page)
    shares = metro_means(a.prri, a.delineation, atlas, GROUPS)
    missing = [n for n in atlas if n not in shares]
    if missing:
        sys.exit("No PRRI counties for these atlas metros:\n  " + "\n  ".join(missing))

    with open(a.out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["metro"] + [g + "_pct" for g in GROUPS])
        for n in atlas:
            w.writerow([n] + [round(shares[n][g], 2) for g in GROUPS])

    embed(a.page, "FAITH", {n: [round(shares[n][g], 2) for g in GROUPS] for n in atlas}, after="REL")
    print(f"Wrote {a.out} and FAITH for {len(atlas)} metros")


if __name__ == "__main__":
    main()
