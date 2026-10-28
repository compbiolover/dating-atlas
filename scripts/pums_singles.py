#!/usr/bin/env python3
"""Embed national corrections and turnover rates from the ACS microdata as the PUMS object in atlas/data.js.

The ACS tables count single people (B12002: never married, divorced or widowed) but can't see who lives with
an unmarried partner, and B15001's degree shares cover everyone, not singles. From the 2023 ACS 1-year PUMS,
by sex:
  free   share of B12002 singles NOT living with a partner, for each of the ACS object's B12002 age bands
  deg    degree share of those singles over B15001's degree share for everyone in the same B15001 age band
         (18-24, 25-34, 35-44, 45-64, 65+); for 18-24, singles 21-24 over everyone 18-24, since the page starts at 21
and, for the yearly count, by B12002 age band among singles not living with a partner:
  div    share divorced or widowed in the past 12 months (MARHD, MARHW) who didn't also move here from outside the
         metro, which the page's move term already counts: movers from another state or abroad are left out, and
         movers within the state count at 1 - cross, the national share of in-state moves that cross a metro line,
         from B07201's national row in the same summary file mobility_to_json.py reads
  mig    share who lived in another state or abroad a year ago, over that share for everyone aged 1 and up; the
         page multiplies it by each metro's share of people who moved in from outside the metro (B07201)

A single person lives with a partner if they are the householder's unmarried partner (RELSHIPP 22, 24) or the
householder of a home that has one. Couples where neither partner is the householder are missed, so the
cohabiting shares are a floor.

Inputs: csv_pus.zip from https://www2.census.gov/programs-surveys/acs/data/pums/2023/1-Year/ and
acsdt5y2023-b07201.dat from https://www2.census.gov/programs-surveys/acs/summary_file/2023/table-based-SF/data/5YRData/

Usage:
  python3 scripts/pums_singles.py csv_pus.zip acsdt5y2023-b07201.dat
"""
import argparse
import json
import zipfile

import pandas as pd

from acs_to_json import DATA, embed, read_const, read_sf

DEG_BANDS = [(18, 24), (25, 34), (35, 44), (45, 64), (65, 100)]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pums_zip")
    ap.add_argument("mobility")
    ap.add_argument("--page", default=DATA)
    a = ap.parse_args()

    bands = read_const(a.page, "ACS")["bands"]

    z = zipfile.ZipFile(a.pums_zip)
    parts, partner_hh = [], set()
    for name in ["psam_pusa.csv", "psam_pusb.csv"]:
        for ch in pd.read_csv(z.open(name), usecols=["SERIALNO", "PWGTP", "AGEP", "SEX", "MAR", "SCHL", "RELSHIPP",
                                                                 "MARHD", "MARHW", "MIG", "MIGSP", "STATE"],
                              chunksize=500_000, dtype={"SERIALNO": str}):
            partner_hh.update(ch.SERIALNO[ch.RELSHIPP.isin([22, 24])])
            parts.append(ch[ch.AGEP >= 1])
    p = pd.concat(parts)
    # Another state or abroad a year ago: MIG 2 is abroad, and MIGSP 1-56 a U.S. state (72 is Puerto Rico, above that abroad)
    p["interstate"] = p.MIG.eq(3) & p.MIGSP.ne(p.STATE)
    p["mover"] = p.MIG.eq(2) | p.interstate
    all_mover = (p.mover*p.PWGTP).sum()/p.PWGTP.sum()
    # Share of in-state moves that cross a metro line: B07201's national moves from a different metro, a micro area or
    # outside both (E007 + E010 + E013), less moves from another state, over all moves within the U.S. (E003) less
    # those, everything as a share of people 1 and up living in a metro (E001). shortcut: PUMS's interstate rate
    # covers everyone, not just metro residents as B07201 does; fine while the two differ by a fraction of a point
    us = read_sf(a.mobility)["0100000US"]
    inter = (p.interstate*p.PWGTP).sum()/p.PWGTP.sum()
    rate = lambda *cols: sum(us[f"B07201_E{c}"] for c in cols)/us["B07201_E001"]
    cross = (rate("007", "010", "013") - inter)/(rate("003") - inter)
    assert 0 < cross < 1, cross
    print(f"In-state moves crossing a metro line: {cross:.3f}")
    p = p[p.AGEP >= 15]
    p["split"] = (p.MARHD.eq(1) | p.MARHW.eq(1))*(p.MIG.eq(1) + (p.MIG.eq(3) & ~p.mover)*(1 - cross))
    p["single"] = p.MAR.isin([2, 3, 5])
    p["cohab"] = p.RELSHIPP.isin([22, 24]) | ((p.RELSHIPP == 20) & p.SERIALNO.isin(partner_hh))
    p["ba"] = p.SCHL >= 21
    share = lambda df, col: (df[col]*df.PWGTP).sum()/df.PWGTP.sum()

    out = {"free": {}, "deg": {}, "div": {}, "mig": {}}
    for sex, g in [(2, "w"), (1, "m")]:
        s = p[p.SEX == sex]
        sg = s[s.single]
        out["free"][g] = [round(1 - share(sg[sg.AGEP.between(lo, hi)], "cohab"), 3) for lo, hi in bands]
        pool = sg[~sg.cohab]
        out["deg"][g] = [round(share(pool[pool.AGEP.between(max(lo, 21), hi)], "ba")/share(s[s.AGEP.between(lo, hi)], "ba"), 3)
                         for lo, hi in DEG_BANDS]
        out["div"][g] = [round(share(pool[pool.AGEP.between(lo, hi)], "split"), 4) for lo, hi in bands]
        out["mig"][g] = [round(share(pool[pool.AGEP.between(lo, hi)], "mover")/all_mover, 3) for lo, hi in bands]
    out["degBands"] = [list(b) for b in DEG_BANDS]
    print(json.dumps(out))
    embed(a.page, "PUMS", out, after="ACSE")
    print(f"Embedded into {a.page}")


if __name__ == "__main__":
    main()
