#!/usr/bin/env python3
"""Embed housing cost per metro in the atlas page.

Inputs, from the ACS 2019-23 table-based summary files (no API key needed):
  https://www2.census.gov/programs-surveys/acs/summary_file/2023/table-based-SF/data/5YRData/
  acsdt5y2023-b25031.dat  median gross rent by bedrooms (1 bedroom is E003, all units E001)
  acsdt5y2023-b25113.dat  median gross rent by when the renter moved in (all E001, 2021 or later E002)
  acsdt5y2023-b20004.dat  median earnings, 25 and older, by education
                          (some college E004, bachelor's E005)
plus data/metro_acs_2023.csv for the CBSA code -> name match the other ACS data uses.

The all-tenant median understates what someone moving now pays, since it includes
long leases and rent-stabilized units. So each metro's 1-bedroom median is scaled by
its own ratio of recent-mover rent (moved in 2021 or later) to all-tenant rent. A metro
missing either median uses the national ratio instead.

Writes data/metro_housing.csv and the `const HOUSE = {...};` line in the page,
as {metro: [1-bedroom rent for a recent mover, bachelor's earnings, some-college earnings]}.

Usage:
  python3 scripts/housing_to_json.py acsdt5y2023-b25031.dat acsdt5y2023-b25113.dat acsdt5y2023-b20004.dat
"""
import argparse
import csv
import re
import sys

from acs_to_json import atlas_names, embed, matcher


def read_sf(path, cols):
    """{GEO_ID: {col: number or None}} from a pipe-delimited summary file."""
    out = {}
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f, delimiter="|"):
            g = row["GEO_ID"]
            if g == "0100000US" or g.startswith("310M"):
                out[g] = {c: (float(row[c]) if re.fullmatch(r"\d+(\.\d+)?", row[c] or "") else None) for c in cols}
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("rent")
    ap.add_argument("movers")
    ap.add_argument("earnings")
    ap.add_argument("--names", default="data/metro_acs_2023.csv", help="CSV with GEOID and NAME per CBSA")
    ap.add_argument("--page", default="atlas/index.html")
    a = ap.parse_args()

    rent = read_sf(a.rent, ["B25031_E001", "B25031_E003"])
    movers = read_sf(a.movers, ["B25113_E001", "B25113_E002"])
    earn = read_sf(a.earnings, ["B20004_E004", "B20004_E005"])
    us = rent["0100000US"]
    one_bed_ratio = us["B25031_E003"] / us["B25031_E001"]
    recent_ratio = movers["0100000US"]["B25113_E002"] / movers["0100000US"]["B25113_E001"]

    atlas = atlas_names(a.page)
    match = matcher(atlas)

    rows, fallback = [], []
    with open(a.names, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name = match(row["NAME"])
            geo = "310M700US" + row["GEOID"]
            if not name or geo not in rent or geo not in earn:
                continue
            r, e, mv = rent[geo], earn[geo], movers.get(geo, {})
            r1 = r["B25031_E003"]
            if r1 is None and r["B25031_E001"] is not None:
                r1 = r["B25031_E001"] * one_bed_ratio
                fallback.append(name)
            if r1 is not None:
                all_, recent = mv.get("B25113_E001"), mv.get("B25113_E002")
                r1 *= recent/all_ if all_ and recent else recent_ratio
            if r1 is None or e["B20004_E005"] is None or e["B20004_E004"] is None:
                continue
            rows.append({"metro": name, "geoid": row["GEOID"], "rent_1br": round(r1),
                         "earn_ba": round(e["B20004_E005"]), "earn_some_college": round(e["B20004_E004"])})

    missing = [n for n in atlas if n not in {r["metro"] for r in rows}]
    print(f"{len(rows)} metros matched, {len(missing)} without housing data, {len(fallback)} using the all-units rent")
    for n in missing[:15]:
        print("  no housing data: " + n, file=sys.stderr)
    if [n for n in atlas[:50] if n in missing]:
        sys.exit("A top-50 metro has no housing row; fix the name match")

    rows.sort(key=lambda r: atlas.index(r["metro"]))
    with open("data/metro_housing.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)

    embed(a.page, "HOUSE", {r["metro"]: [r["rent_1br"], r["earn_ba"], r["earn_some_college"]] for r in rows})
    print(f"Wrote data/metro_housing.csv and embedded into {a.page}")


if __name__ == "__main__":
    main()
