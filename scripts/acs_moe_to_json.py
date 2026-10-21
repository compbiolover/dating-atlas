#!/usr/bin/env python3
"""Embed ACS standard errors per metro in the atlas page, for the estimate's uncertainty range.

Inputs, from the ACS 2019-23 table-based summary files (no API key needed):
  https://www2.census.gov/programs-surveys/acs/summary_file/2023/table-based-SF/data/5YRData/
  acsdt5y2023-b12002.dat  marital status by sex and age (estimates E### and 90% margins of error M###)
  acsdt5y2023-b15001.dat  education by sex and age
plus data/acs_variables_2023.csv for the variable labels and data/metro_acs_2023.csv
for the CBSA code -> name match the other ACS data uses. The national files are large;
keeping only the header and the lines starting with 310M (metros) is enough.

Standard error = margin of error / 1.645. Single people in a band are a sum of cells,
so their SE is the root sum of squares (the Census Bureau's approximation). Each age
band's degree share (18-24, 25-34, 35-44, 45-64) has its SE from the Census formula for a proportion,
  SE(p) = sqrt(SE(x)^2 - p^2 SE(X)^2) / X,  with + instead of - if the root is negative.

Writes the `const ACSE = {...};` line in the page, as
{metro: {w: [SE of single women per age band], m: [... men], dw: [SE of women's degree % per B15001 band], dm: ...}}.

Usage:
  python3 scripts/acs_moe_to_json.py acsdt5y2023-b12002.dat acsdt5y2023-b15001.dat
"""
import argparse
import csv
import math
import re
import sys

from acs_to_json import atlas_names, b12002_plan, b15001_bands, embed, load_labels, matcher, read_sf

Z90 = 1.645


def est_se(path):
    """{CBSA code: {variable: (estimate, standard error)}} for the metros in a summary file."""
    out = {}
    for g, row in read_sf(path).items():
        if g.startswith("310M"):
            out[g[-5:]] = {f"{m[1]}_{m[2]}": (row[k] or 0.0, (row.get(f"{m[1]}_M{m[2]}") or 0.0) / Z90)
                           for k in row if (m := re.fullmatch(r"(B\d+)_E(\d+)", k))}
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("b12002")
    ap.add_argument("b15001")
    ap.add_argument("--labels", default="data/acs_variables_2023.csv")
    ap.add_argument("--names", default="data/metro_acs_2023.csv", help="CSV with GEOID and NAME per CBSA")
    ap.add_argument("--page", default="atlas/index.html")
    a = ap.parse_args()

    labels = load_labels(a.labels)
    plan, bands = b12002_plan(labels)
    degs = b15001_bands(labels)
    idx = {band: i for i, band in enumerate(bands)}
    mar, edu = est_se(a.b12002), est_se(a.b15001)

    atlas = atlas_names(a.page)
    match = matcher(atlas)
    code_to_name = {}
    with open(a.names, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            n = match(row["NAME"])
            if n:
                code_to_name[row["GEOID"].zfill(5)] = n

    out = {}
    for code, name in code_to_name.items():
        if code not in mar or code not in edu:
            continue
        var2 = {s: [0.0] * len(bands) for s in ("w", "m")}
        for var, (sex, band, single) in plan.items():
            if single:
                var2[sex][idx[band]] += mar[code][var][1] ** 2
        rec = {s: [round(math.sqrt(v)) for v in var2[s]] for s in ("w", "m")}
        for s in ("w", "m"):
            rec["d" + s] = []
            for _, total, deg in degs[s]:
                X, seX = edu[code][total]
                x = sum(edu[code][v][0] for v in deg)
                sex_ = math.sqrt(sum(edu[code][v][1] ** 2 for v in deg))
                p = x / X if X else 0
                inner = sex_ ** 2 - p ** 2 * seX ** 2
                se = math.sqrt(inner if inner >= 0 else sex_ ** 2 + p ** 2 * seX ** 2) / X if X else 0
                rec["d" + s].append(round(100 * se, 2))
        out[name] = rec

    missing = [n for n in atlas if n not in out]
    if missing:
        sys.exit("No ACS standard errors for:\n  " + "\n  ".join(missing))
    size = embed(a.page, "ACSE", {n: out[n] for n in atlas}, after="ACS")
    print(f"Wrote ACSE for {len(out)} metros ({size // 1024} KB)")


if __name__ == "__main__":
    main()
