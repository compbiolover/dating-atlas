#!/usr/bin/env python3
"""Turn tidycensus ACS output into the ACS object the atlas page reads.

Inputs (both written by scripts/pull_acs.R):
  metro_acs_2023.csv      wide get_acs() output for B12002, B15001 and B11012, one row per CBSA
  acs_variables_2023.csv  load_variables(2023, "acs5") with columns name,label

Per metro and sex it keeps, by B12002 age band:
  single people (never married + divorced + widowed) and everyone
from B15001 the share with a bachelor's or higher in each age band from 18-24 to 45-64,
and from B11012 the number of single parents (householders with no spouse
or partner present and their own children under 18).

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


def matcher(names):
    """Return match(name) -> value: an exact norm() match first, then a short_key() match if exactly one
    candidate shares it. names is a list (values are the names themselves) or a dict of name -> value."""
    items = list(names.items()) if isinstance(names, dict) else [(n, n) for n in names]
    exact = {norm(n): v for n, v in items}
    short = defaultdict(list)
    for n, v in items:
        short[short_key(n)].append(v)
    def match(name):
        if norm(name) in exact:
            return exact[norm(name)]
        c = short.get(short_key(name), [])
        return c[0] if len(c) == 1 else None
    return match


def embed(page, name, obj, after=None):
    """Write obj as the page's `const NAME = ...;` line. If the page has none yet, insert it after the
    `const AFTER = ...;` line. Returns the line's length."""
    line = f"const {name} = " + json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + ";"
    html = open(page, encoding="utf-8").read()
    html, n = re.subn(rf"^const {name} = .*;$", lambda _: line, html, count=1, flags=re.M)
    if not n and after:
        html, n = re.subn(rf"^(const {after} = .*;)$", lambda m: m.group(1) + "\n" + line, html, count=1, flags=re.M)
    if not n:
        sys.exit(f"No 'const {name} = ...;' line in {page}")
    open(page, "w", encoding="utf-8").write(html)
    return len(line)


def load_labels(path):
    labels = {}
    with open(path, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            # Accept both "B12002_004" and "B12002_004E"; skip margin-of-error rows
            m = re.fullmatch(r"(B1(?:2002|5001|1012)_\d+)(E?)", row["name"].strip())
            if m:
                labels[m.group(1)] = label_parts(row["label"])
    if not labels:
        sys.exit(f"No B12002/B15001/B11012 variables found in {path}")
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


def b15001_bands(labels):
    """[(age band, total variable, bachelor's-plus variables)] by sex, for the bands from 18-24 to 45-64."""
    out = defaultdict(dict)
    for var, parts in labels.items():
        if not var.startswith("B15001_") or len(parts) < 2 or parts[0] not in SEXES:
            continue
        band = parse_age(parts[1])
        if not band or band[0] >= 65:
            continue
        cell = out[SEXES[parts[0]]].setdefault(band, [None, []])
        if len(parts) == 2:
            cell[0] = var
        elif parts[2].startswith(("bachelor", "graduate")):
            cell[1].append(var)
    plan = {sex: [(band, t, d) for band, (t, d) in sorted(out[sex].items())] for sex in ("w", "m")}
    if [b for b, _, _ in plan["w"]] != [(18, 24), (25, 34), (35, 44), (45, 64)] or any(not t or len(d) != 2 for p in plan.values() for _, t, d in p):
        sys.exit("Could not find the B15001 degree cells for each age band")
    return plan


def b11012_plan(labels):
    """The single-parent householder cell for each sex."""
    cells = {}
    for var, parts in labels.items():
        if var.startswith("B11012_") and len(parts) == 2 and "no spouse or partner" in parts[0] \
                and parts[1].startswith("with children"):
            sex = parts[0].split(" ")[0]
            if sex in SEXES:
                cells[SEXES[sex]] = var
    if set(cells) != {"w", "m"}:
        sys.exit("Could not find the B11012 single-parent cells in the variable labels")
    return cells


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
    degs = b15001_bands(labels)
    parents = b11012_plan(labels)
    idx = {band: i for i, band in enumerate(bands)}
    atlas = atlas_names(a.page)  # largest metro first
    match = matcher(atlas)

    metros, unmatched = {}, []
    with open(a.data, newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            name = match(row["NAME"])
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
                rec["d" + sex] = [round(100 * sum(estimate(row, v) for v in d) / estimate(row, t), 1) if estimate(row, t) else 0
                                  for _, t, d in degs[sex]]
                rec["k" + sex] = round(estimate(row, parents[sex]))
            metros[name] = rec

    acs = {"bands": [list(b) for b in bands], "degBands": [list(b) for b, _, _ in degs["w"]], "metros": metros}
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

    embed(a.page, "ACS", acs)
    print(f"Embedded into {a.page}")


if __name__ == "__main__":
    main()
