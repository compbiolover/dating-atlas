#!/usr/bin/env python3
"""Embed 2020 U.S. Religion Census adherence rates in the atlas page.

Input: 2020_USRC_Summaries.xlsx from
https://www.usreligioncensus.org/node/1639 (metro and county summary sheets).

Each atlas metro gets the share of its population counted as adherents of a
congregation. Metros that use 2020 CBSA names match by name; ones created or
renamed in the 2023 delineations are mapped in ALIAS.

Writes data/metro_religion_2020.csv and the `const REL = {...};` line in the page.

Usage:
  python3 scripts/religion_to_json.py path/to/2020_USRC_Summaries.xlsx
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
        header = rows[0] if rows else {}
        out[s.get("name")] = [{header[k]: v for k, v in r.items() if k in header} for r in rows[1:]]
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("xlsx")
    ap.add_argument("--page", default="atlas/index.html")
    ap.add_argument("--out", default="data/metro_religion_2020.csv")
    a = ap.parse_args()

    wb = sheets(a.xlsx)
    metro = {r["CBSA Code"]: r for r in wb["2020 Metro Summary"] if r.get("CBSA Code") and r.get("Metro Name")}
    county = {r["FIPS"]: r for r in wb["2020 County Summary"] if r.get("FIPS") and r.get("County Name")}
    by_name = {norm(r["Metro Name"]): r for r in metro.values()}
    by_short = {}
    for r in metro.values():
        by_short.setdefault(short_key(r["Metro Name"]), []).append(r)

    rows, missing = [], []
    for name in atlas_names(a.page):
        if name in ALIAS:
            kind, code = ALIAS[name]
            r = (metro if kind == "metro" else county).get(code)
            src = r and (r.get("Metro Name") or f"{r['County Name']}, {r['State Name']}")
        else:
            r = by_name.get(norm(name)) or (lambda c: c[0] if len(c) == 1 else None)(by_short.get(short_key(name), []))
            src = r and r["Metro Name"]
        if not r:
            missing.append(name)
            continue
        pop, adh = int(r["2020 Population"]), int(r["Adherents"])
        rows.append({"metro": name, "source": src, "population_2020": pop, "adherents_2020": adh,
                     "adherent_pct": round(100 * adh / pop, 1)})
    if missing:
        sys.exit("No Religion Census row for these atlas metros; add them to ALIAS:\n  " + "\n  ".join(missing))

    with open(a.out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)

    html = open(a.page, encoding="utf-8").read()
    line = "const REL = " + json.dumps({r["metro"]: r["adherent_pct"] for r in rows}, ensure_ascii=False, separators=(",", ":")) + ";"
    html, n = re.subn(r"^const REL = .*;$", lambda _: line, html, count=1, flags=re.M)
    if not n:
        sys.exit(f"No 'const REL = ...;' line in {a.page}")
    open(a.page, "w", encoding="utf-8").write(html)
    print(f"{len(rows)} metros matched; wrote {a.out} and embedded into {a.page}")


if __name__ == "__main__":
    main()
