#!/usr/bin/env python3
"""Embed each metro's winter and summer temperature in atlas/data.js, for the climate filter.

Inputs:
  climdiv-tmpccy-*   NOAA nClimDiv monthly average temperature for every county,
                     https://www.ncei.noaa.gov/pub/data/cirs/climdiv/ (format and state codes in county-readme.txt there).
  prri_county.csv    County populations, to weight counties: the same PRRI file faith_to_json.py reads,
                     https://datawrapper.dwcdn.net/3sLhY/2/dataset.csv
  list1_2023.xlsx    Census Bureau 2023 CBSA delineations, to roll counties up to metros:
                     https://www2.census.gov/programs-surveys/metro-micro/geographies/reference-files/2023/delineation-files/list1_2023.xlsx

Each county's normal is its mean January and July average temperature over 1991-2020, NOAA's current
normals period; a metro's is the population-weighted mean of its counties. NOAA has no separate
District of Columbia, so the Washington metro uses its other counties.

Writes data/metro_climate.csv and the `const CLIMATE = {...};` in atlas/data.js, as
{metro: [January °F, July °F]}.

Usage:
  python3 scripts/climate_to_json.py climdiv-tmpccy-v1.0.0-YYYYMMDD prri_county.csv list1_2023.xlsx
"""
import argparse
import csv
import sys

from acs_to_json import DATA, atlas_names, embed
from religion_to_json import rollup

# NOAA's state codes (alphabetical, then Hawaii and Alaska) as FIPS state codes
NOAA_STATES = "01 04 05 06 08 09 10 12 13 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33 34 35 36 37 38 39 40 41 42 44 45 46 47 48 49 50 51 53 54 55 56 15 02".split()
YEARS = range(1991, 2021)


def county_normals(path):
    """{county FIPS: (January °F, July °F)}, averaged over YEARS, for counties with every year."""
    jan, jul = {}, {}
    with open(path) as f:
        for line in f:
            if line[5:7] != "02" or int(line[7:11]) not in YEARS:
                continue
            fips = NOAA_STATES[int(line[:2]) - 1] + line[2:5]
            v = [float(line[11 + 7 * i:18 + 7 * i]) for i in range(12)]
            jan.setdefault(fips, []).append(v[0])
            jul.setdefault(fips, []).append(v[6])
    return {c: (sum(jan[c]) / len(jan[c]), sum(jul[c]) / len(jul[c])) for c in jan if len(jan[c]) == len(YEARS)}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("climdiv")
    ap.add_argument("prri")
    ap.add_argument("delineation")
    ap.add_argument("--page", default=DATA)
    ap.add_argument("--out", default="data/metro_climate.csv")
    a = ap.parse_args()

    normals = county_normals(a.climdiv)
    with open(a.prri, newline="", encoding="utf-8") as f:
        pop = {r["fipsstcnty"].zfill(5): float(r["Population"]) for r in csv.DictReader(f)}
    county = {c: (pop[c], {"jan": t[0], "jul": t[1]}) for c, t in normals.items() if c in pop}
    atlas = atlas_names(a.page)
    metro = rollup(county, a.delineation, atlas)
    missing = [n for n in atlas if n not in metro]
    if missing:
        sys.exit("No NOAA counties for these atlas metros:\n  " + "\n  ".join(missing))

    rows = [{"metro": n, "jan_f": round(metro[n]["jan"], 1), "jul_f": round(metro[n]["jul"], 1)} for n in atlas]
    # Spot checks against well-known climates, so a misread file or state code fails loudly
    t = {r["metro"].split(",")[0].split("–")[0]: r for r in rows}
    assert t["Miami"]["jan_f"] > 60 and t["Minneapolis"]["jan_f"] < 25 and t["Phoenix"]["jul_f"] > 90, (t["Miami"], t["Minneapolis"], t["Phoenix"])
    assert t["Urban Honolulu"]["jan_f"] > 65 and t["Fairbanks"]["jan_f"] < 10, (t["Urban Honolulu"], t["Fairbanks"])

    with open(a.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    embed(a.page, "CLIMATE", {r["metro"]: [r["jan_f"], r["jul_f"]] for r in rows}, after="HOUSE")
    print(f"Wrote {a.out} and CLIMATE for {len(rows)} metros")


if __name__ == "__main__":
    main()
