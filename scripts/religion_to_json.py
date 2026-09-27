#!/usr/bin/env python3
"""Embed two religion measures per metro in the atlas page.

Inputs:
  2020_USRC_Summaries.xlsx  2020 U.S. Religion Census, https://www.usreligioncensus.org/node/1639
                            Share of residents counted as members of a congregation.
  prri_county.csv           PRRI Census of American Religion county estimates, the dataset.csv
                            behind the maps at https://www.prri.org/census/ (e.g.
                            https://datawrapper.dwcdn.net/3sLhY/2/dataset.csv).
                            Share of adults who are religiously unaffiliated.
  list1_2023.xlsx           Census Bureau 2023 CBSA delineations, to roll PRRI counties up to metros:
                            https://www2.census.gov/programs-surveys/metro-micro/geographies/reference-files/2023/delineation-files/list1_2023.xlsx

Religion Census metros that use 2020 CBSA names match by name; ones created or
renamed in the 2023 delineations are mapped in ALIAS.

Writes data/metro_religion.csv and the `const REL = {...};` line in the page,
as {metro: [adherent %, unaffiliated %]}.

Usage:
  python3 scripts/religion_to_json.py 2020_USRC_Summaries.xlsx prri_county.csv list1_2023.xlsx
"""
import argparse
import csv
import json
import re
import sys
import xml.etree.ElementTree as ET
import zipfile

from acs_to_json import atlas_names, norm, short_key

NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

# Atlas metro -> ("metro", CBSA code) or ("county", FIPS) in the 2020 file
ALIAS = {
    "Kiryas Joel–Poughkeepsie–Newburgh, NY": ("metro", "39100"),  # was Poughkeepsie-Newburgh-Middletown
    "Waterbury–Shelton, CT": ("metro", "35300"),  # CT planning region; New Haven County is the closest 2020 unit
    "Slidell–Mandeville–Covington, LA": ("county", "22103"),  # St. Tammany Parish
    "Lexington Park, MD": ("metro", "15680"),  # was California-Lexington Park
    "Kenosha, WI": ("county", "55059"),
    "Amherst Town–Northampton, MA": ("county", "25015"),  # Hampshire County
    "Wildwood–The Villages, FL": ("metro", "45540"),  # was The Villages
}

# PRRI still uses Connecticut's old counties; the 2023 delineations use planning regions
CT_REGION = {
    "09110": ["09003", "09013"],  # Capitol: Hartford, Tolland
    "09120": ["09001"], "09190": ["09001"],  # Greater Bridgeport, Western CT: Fairfield
    "09130": ["09007"],  # Lower CT River Valley: Middlesex
    "09140": ["09009"], "09170": ["09009"],  # Naugatuck Valley, South Central: New Haven
    "09150": ["09015"], "09160": ["09005"], "09180": ["09011"],  # Northeastern, Northwest Hills, Southeastern
}


def unaffiliated(prri_csv, delin_xlsx, atlas):
    """{atlas metro: population-weighted PRRI unaffiliated %} from county estimates."""
    with open(prri_csv, newline="", encoding="utf-8") as f:
        county = {r["fipsstcnty"].zfill(5): (float(r["Population"]), float(r["unaffiliated"])) for r in csv.DictReader(f)}
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
        rows = [county[c] for c in counties.get(key, []) if c in county]
        if rows:
            out[name] = sum(p * u for p, u in rows) / sum(p for p, _ in rows)
    return out


def sheets(path):
    """{sheet name: list of row dicts keyed by header} for a plain xlsx workbook."""
    z = zipfile.ZipFile(path)
    strings = ["".join(si.itertext()) for si in ET.fromstring(z.read("xl/sharedStrings.xml")).iter(NS + "si")]
    rels = {r.get("Id"): r.get("Target") for r in ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))}
    out = {}
    for s in ET.fromstring(z.read("xl/workbook.xml")).iter(NS + "sheet"):
        rid = s.get("{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id")
        rows = []
        for r in ET.fromstring(z.read("xl/" + rels[rid].lstrip("/").removeprefix("xl/"))).iter(NS + "row"):
            row = {}
            for c in r.iter(NS + "c"):
                v = c.find(NS + "v")
                if v is not None:
                    row[re.match(r"[A-Z]+", c.get("r")).group()] = strings[int(v.text)] if c.get("t") == "s" else v.text
            rows.append(row)
        # Header is the first row with several cells; the Census file has title rows above it
        h = next((i for i, r in enumerate(rows) if len(r) > 2), 0)
        header = rows[h] if rows else {}
        out[s.get("name")] = [{header[k]: v for k, v in r.items() if k in header} for r in rows[h + 1:]]
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("xlsx")
    ap.add_argument("prri")
    ap.add_argument("delineation")
    ap.add_argument("--page", default="atlas/index.html")
    ap.add_argument("--out", default="data/metro_religion.csv")
    a = ap.parse_args()

    wb = sheets(a.xlsx)
    metro = {r["CBSA Code"]: r for r in wb["2020 Metro Summary"] if r.get("CBSA Code") and r.get("Metro Name")}
    county = {r["FIPS"]: r for r in wb["2020 County Summary"] if r.get("FIPS") and r.get("County Name")}
    by_name = {norm(r["Metro Name"]): r for r in metro.values()}
    by_short = {}
    for r in metro.values():
        by_short.setdefault(short_key(r["Metro Name"]), []).append(r)

    atlas = atlas_names(a.page)
    unaff = unaffiliated(a.prri, a.delineation, atlas)
    rows, missing = [], []
    for name in atlas:
        if name in ALIAS:
            kind, code = ALIAS[name]
            r = (metro if kind == "metro" else county).get(code)
            src = r and (r.get("Metro Name") or f"{r['County Name']}, {r['State Name']}")
        else:
            r = by_name.get(norm(name)) or (lambda c: c[0] if len(c) == 1 else None)(by_short.get(short_key(name), []))
            src = r and r["Metro Name"]
        if not r or name not in unaff:
            missing.append(name)
            continue
        pop, adh = int(r["2020 Population"]), int(r["Adherents"])
        rows.append({"metro": name, "source": src, "population_2020": pop, "adherents_2020": adh,
                     "adherent_pct": round(100 * adh / pop, 1), "prri_unaffiliated_pct": round(unaff[name], 1)})
    if missing:
        sys.exit("No Religion Census row (add to ALIAS) or PRRI counties for these atlas metros:\n  " + "\n  ".join(missing))

    with open(a.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)

    html = open(a.page, encoding="utf-8").read()
    line = "const REL = " + json.dumps({r["metro"]: [r["adherent_pct"], r["prri_unaffiliated_pct"]] for r in rows}, ensure_ascii=False, separators=(",", ":")) + ";"
    html, n = re.subn(r"^const REL = .*;$", lambda _: line, html, count=1, flags=re.M)
    if not n:
        sys.exit(f"No 'const REL = ...;' line in {a.page}")
    open(a.page, "w", encoding="utf-8").write(html)
    print(f"{len(rows)} metros matched; wrote {a.out} and embedded into {a.page}")


if __name__ == "__main__":
    main()
