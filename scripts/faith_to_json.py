#!/usr/bin/env python3
"""Embed PRRI religious group shares per metro in the atlas page, for the faith filter.

Inputs:
  prri_county.csv   PRRI Census of American Religion county estimates, the dataset.csv
                    behind the maps at https://www.prri.org/census/ (e.g.
                    https://datawrapper.dwcdn.net/3sLhY/2/dataset.csv).
  list1_2023.xlsx   Census Bureau 2023 CBSA delineations, to roll counties up to metros:
                    https://www2.census.gov/programs-surveys/metro-micro/geographies/reference-files/2023/delineation-files/list1_2023.xlsx

Shares are weighted by county population. Writes data/metro_faith.csv and the
`const FAITH = {...};` line in the page, as {metro: [christian, catholic, protestant,
latter-day saint, jewish, muslim, hindu, buddhist, other religion]} in percent of adults.

Usage:
  python3 scripts/faith_to_json.py prri_county.csv list1_2023.xlsx
"""
import argparse
import csv
import json
import re
import sys

from acs_to_json import atlas_names, norm, short_key
from religion_to_json import CT_REGION, sheets

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


def metro_shares(prri_csv, delin_xlsx, atlas):
    """{atlas metro: {group: population-weighted %}} from PRRI county estimates."""
    with open(prri_csv, newline="", encoding="utf-8") as f:
        county = {r["fipsstcnty"].zfill(5): (float(r["Population"]), {g: sum(float(r[c]) for c in cols) for g, cols in GROUPS.items()})
                  for r in csv.DictReader(f)}
    counties = {}
    for r in sheets(delin_xlsx)["List 1"]:
        if r.get("Metropolitan/Micropolitan Statistical Area") == "Metropolitan Statistical Area":
            fips = r["FIPS State Code"] + r["FIPS County Code"]
            counties.setdefault(norm(r["CBSA Title"]), []).extend(CT_REGION.get(fips, [fips]))
    by_short = {}
    for k in counties:
        by_short.setdefault(short_key(k), []).append(k)
    out = {}
    for name in atlas:
        key = norm(name) if norm(name) in counties else (lambda c: c[0] if len(c) == 1 else None)(by_short.get(short_key(name), []))
        rows = [county[c] for c in dict.fromkeys(counties.get(key, [])) if c in county]
        if rows:
            tot = sum(p for p, _ in rows)
            out[name] = {g: sum(p * s[g] for p, s in rows) / tot for g in GROUPS}
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("prri")
    ap.add_argument("delineation")
    ap.add_argument("--page", default="atlas/index.html")
    ap.add_argument("--out", default="data/metro_faith.csv")
    a = ap.parse_args()

    atlas = atlas_names(a.page)
    shares = metro_shares(a.prri, a.delineation, atlas)
    missing = [n for n in atlas if n not in shares]
    if missing:
        sys.exit("No PRRI counties for these atlas metros:\n  " + "\n  ".join(missing))

    with open(a.out, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["metro"] + [g + "_pct" for g in GROUPS])
        for n in atlas:
            w.writerow([n] + [round(shares[n][g], 2) for g in GROUPS])

    line = "const FAITH = " + json.dumps({n: [round(shares[n][g], 2) for g in GROUPS] for n in atlas},
                                         ensure_ascii=False, separators=(",", ":")) + ";"
    with open(a.page, encoding="utf-8") as f:
        page = f.read()
    if re.search(r"^const FAITH = .*;$", page, flags=re.M):
        page = re.sub(r"^const FAITH = .*;$", lambda _: line, page, count=1, flags=re.M)
    else:
        page = re.sub(r"^(const REL = .*;)$", lambda m: m.group(1) + "\n" + line, page, count=1, flags=re.M)
    with open(a.page, "w", encoding="utf-8") as f:
        f.write(page)
    print(f"Wrote {a.out} and FAITH for {len(atlas)} metros")


if __name__ == "__main__":
    main()
