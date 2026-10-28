#!/usr/bin/env python3
"""Embed each metro's share of residents who moved in from outside it in the past year, for the yearly count.

Inputs:
  acsdt5y2023-b07201.dat  ACS 2019-23 table-based summary file for B07201, geographical mobility in the past
                          year at the metro level (no API key needed):
                          https://www2.census.gov/programs-surveys/acs/summary_file/2023/table-based-SF/data/5YRData/
plus data/metro_acs_2023.csv for the CBSA code -> name match the other ACS data uses.

A metro's share is everyone aged 1 and up who lived in a different metro (E007), a micro area (E010), outside
both (E013) or abroad (E014) a year ago, over everyone aged 1 and up (E001). The page scales it by age and sex
with PUMS.mig, since singles in their twenties move far more often than everyone else.

Writes data/metro_mobility.csv and the `const MOVE = {...};` in atlas/data.js, as {metro: % who moved in}.

Usage:
  python3 scripts/mobility_to_json.py acsdt5y2023-b07201.dat
"""
import argparse
import csv
import sys

from acs_to_json import DATA, atlas_names, embed, matcher, read_sf

IN = ["B07201_E007", "B07201_E010", "B07201_E013", "B07201_E014"]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("mobility")
    ap.add_argument("--names", default="data/metro_acs_2023.csv", help="CSV with GEOID and NAME per CBSA")
    ap.add_argument("--page", default=DATA)
    a = ap.parse_args()

    sf = read_sf(a.mobility)
    atlas = atlas_names(a.page)
    match = matcher(atlas)

    rows = []
    with open(a.names, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name, r = match(row["NAME"]), sf.get("310M700US" + row["GEOID"])
            if not name or not r or not r["B07201_E001"] or any(r[k] is None for k in IN):
                continue
            rows.append({"metro": name, "geoid": row["GEOID"], "moved_in_pct": round(100*sum(r[k] for k in IN)/r["B07201_E001"], 2)})

    missing = [n for n in atlas if n not in {r["metro"] for r in rows}]
    print(f"{len(rows)} metros matched, {len(missing)} without mobility data")
    for n in missing[:15]:
        print("  no mobility data: " + n, file=sys.stderr)
    if [n for n in atlas[:50] if n in missing]:
        sys.exit("A top-50 metro has no mobility row; fix the name match")
    # Spot checks: college towns and the Sun Belt draw far more newcomers than old industrial metros
    t = {r["metro"].split(",")[0].split("–")[0]: r["moved_in_pct"] for r in rows}
    gone = [k for k in ("Austin", "Pittsburgh", "Ithaca") if k not in t]
    assert not gone, f"spot-check metros not matched, fix the name match: {gone}"
    assert t["Austin"] > t["Pittsburgh"] and t["Ithaca"] > 10 and 1 < t["Pittsburgh"] < 6, (t["Austin"], t["Pittsburgh"], t["Ithaca"])

    rows.sort(key=lambda r: atlas.index(r["metro"]))
    with open("data/metro_mobility.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)

    embed(a.page, "MOVE", {r["metro"]: r["moved_in_pct"] for r in rows}, after="CLIMATE")
    print(f"Wrote data/metro_mobility.csv and embedded into {a.page}")


if __name__ == "__main__":
    main()
