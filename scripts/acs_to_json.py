#!/usr/bin/env python3
"""Turn tidycensus ACS output into the ACS object the atlas page reads.

Inputs (both written by scripts/pull_acs.R):
  metro_acs_2023.csv      wide get_acs() output for B12002 and B15001, one row per CBSA
  acs_variables_2023.csv  load_variables(2023, "acs5") with columns name,label

Per metro and sex it keeps, by B12002 age band:
  single people (never married + divorced + widowed) and everyone
and from B15001 the share of 25-34 year olds with a bachelor's or higher.

Usage:
  python3 scripts/acs_to_json.py data/metro_acs_2023.csv data/acs_variables_2023.csv
"""
import argparse
import csv
import json
import re
import sys
from collections import defaultdict

SINGLE = {"never married", "divorced", "widowed"}
SEXES = {"male": "m", "female": "w"}
AGE_RE = re.compile(r"^(?:(\d+) (?:to|and) (\d+) years|(\d+) years and over)$")


def parse_age(part):
    m = AGE_RE.match(part)
    if not m:
        return None
    if m.group(1):
        return int(m.group(1)), int(m.group(2))
    return int(m.group(3)), 100


def label_parts(label):
    parts = [p.strip().rstrip(":").strip().lower() for p in label.split("!!")]
    if parts and parts[0] == "estimate":
        parts = parts[1:]
    if parts and parts[0] == "total":
        parts = parts[1:]
    return parts


def norm(name):
    name = re.sub(r"--|[–—]", "-", name).lower()
    name = re.sub(r"\s+(metro|micro) area$", "", name)
    return re.sub(r"\s+", " ", name).strip()


def short_key(name):
    """First principal city and first state, e.g. 'chicago, il'. Survives
    metros gaining or losing a secondary city or state between vintages."""
    cities, _, states = norm(name).partition(", ")
    return cities.split("-")[0] + ", " + states.split("-")[0]


def load_labels(path):
    labels = {}
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            # Accept both "B12002_004" and "B12002_004E"; skip margin-of-error rows
            m = re.fullmatch(r"(B1(?:2002|5001)_\d+)(E?)", row["name"].strip())
            if m:
                labels[m.group(1)] = label_parts(row["label"])
    if not labels:
        sys.exit(f"No B12002/B15001 variables found in {path}")
    return labels


def b12002_plan(labels):
    """Map each leaf variable to (sex, band, is_single).

    The age band may sit before or after the marital status in the label,
    so it is found by pattern, not position. A marital path that has deeper
    sub-paths (e.g. 'now married' -> 'separated') is skipped so nothing is
    counted twice.
    """
    rows = []
    for var, parts in labels.items():
        if not var.startswith("B12002_") or len(parts) < 3 or parts[0] not in SEXES:
            continue
        ages = [(i, parse_age(p)) for i, p in enumerate(parts) if parse_age(p)]
        if len(ages) == 1:
            i, band = ages[0]
            rows.append((var, SEXES[parts[0]], tuple(parts[1:i] + parts[i + 1:]), band))
    paths = {(sex, path) for _, sex, path, _ in rows}
    leaf = lambda sex, path: not any(s == sex and len(p) > len(path) and p[: len(path)] == path for s, p in paths)
    plan = {}
    for var, sex, path, band in rows:
        if path and leaf(sex, path):
            plan[var] = (sex, band, path[0] in SINGLE)
    bands = sorted({band for _, band, _ in plan.values()})
    if not bands or not any(single for _, _, single in plan.values()):
        sys.exit("Could not find B12002 age bands and marital statuses in the variable labels")
    return plan, bands


def b15001_plan(labels):
    """Variables for the 25-34 total and the bachelor's-plus cells, by sex."""
    total, deg = {}, defaultdict(list)
    for var, parts in labels.items():
        if not var.startswith("B15001_") or len(parts) < 2 or parts[0] not in SEXES:
            continue
        if parse_age(parts[1]) != (25, 34):
            continue
        sex = SEXES[parts[0]]
        if len(parts) == 2:
            total[sex] = var
        elif parts[2].startswith(("bachelor", "graduate")):
            deg[sex].append(var)
    for sex in ("w", "m"):
        if sex not in total or len(deg[sex]) != 2:
            sys.exit(f"Could not find B15001 25-34 degree cells for sex {sex!r}")
    return total, deg


def estimate(row, var):
    value = row[var + "E"]
    return 0.0 if value in ("", "NA") else float(value)


def atlas_names(html_path):
    html = open(html_path, encoding="utf-8").read()
    m = re.search(r"^const RAW = (\[.*\]);$", html, re.M)
    if not m:
        sys.exit(f"No RAW data line in {html_path}")
    return [r[0] for r in json.loads(m.group(1))]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("data")
    ap.add_argument("labels")
    ap.add_argument("--page", default="atlas/index.html", help="page to match metro names against and embed into")
    a = ap.parse_args()

    labels = load_labels(a.labels)
    plan, bands = b12002_plan(labels)
    total25, deg25 = b15001_plan(labels)
    idx = {band: i for i, band in enumerate(bands)}
    atlas = atlas_names(a.page)  # largest metro first
    names = {norm(n): n for n in atlas}
    short = defaultdict(list)
    for n in atlas:
        short[short_key(n)].append(n)

    metros, unmatched = {}, []
    with open(a.data, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name = names.get(norm(row["NAME"]))
            if not name and len(short[short_key(row["NAME"])]) == 1:
                name = short[short_key(row["NAME"])][0]
            if not name or name in metros:
                unmatched.append(row["NAME"])
                continue
            out = {k: [0.0] * len(bands) for k in ("w", "wt", "m", "mt")}
            for var, (sex, band, single) in plan.items():
                n = estimate(row, var)
                out[sex + "t"][idx[band]] += n
                if single:
                    out[sex][idx[band]] += n
            rec = {k: [round(x) for x in v] for k, v in out.items()}
            for sex in ("w", "m"):
                t = estimate(row, total25[sex])
                rec["d" + sex] = round(100 * sum(estimate(row, v) for v in deg25[sex]) / t, 1) if t else 0
            metros[name] = rec

    acs = {"bands": [list(b) for b in bands], "metros": metros}
    missing = [n for n in atlas if n not in metros]
    print(f"{len(metros)} metros matched, {len(missing)} atlas metros without ACS rows")
    if unmatched:
        print(f"{len(unmatched)} ACS rows not in the atlas (micro areas are expected):", file=sys.stderr)
        for n in unmatched[:15]:
            print("  " + n, file=sys.stderr)

    big_missing = [n for n in atlas[:50] if n not in metros]
    if big_missing:
        sys.exit("These large metros found no ACS row; add them to the CSV or fix the name match:\n  "
                 + "\n  ".join(big_missing))
    for n in missing[:15]:
        print("  no ACS row: " + n, file=sys.stderr)

    html = open(a.page, encoding="utf-8").read()
    line = "const ACS = " + json.dumps(acs, separators=(",", ":")) + ";"
    html, n = re.subn(r"^const ACS = .*;$", lambda _: line, html, count=1, flags=re.M)
    if not n:
        sys.exit(f"No 'const ACS = ...;' line in {a.page}")
    open(a.page, "w", encoding="utf-8").write(html)
    print(f"Embedded into {a.page}")


if __name__ == "__main__":
    main()
