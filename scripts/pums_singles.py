#!/usr/bin/env python3
"""Embed two national corrections from the ACS microdata as the PUMS object in atlas/data.js.

The ACS tables count single people (B12002: never married, divorced or widowed) but can't see who lives with
an unmarried partner, and B15001's degree shares cover everyone, not singles. From the 2023 ACS 1-year PUMS,
by sex:
  free   share of B12002 singles NOT living with a partner, for each of the ACS object's B12002 age bands
  deg    degree share of those singles over B15001's degree share for everyone in the same B15001 age band
         (18-24, 25-34, 35-44, 45-64); for 18-24, singles 21-24 over everyone 18-24, since the page starts at 21

A single person lives with a partner if they are the householder's unmarried partner (RELSHIPP 22, 24) or the
householder of a home that has one. Couples where neither partner is the householder are missed, so the
cohabiting shares are a floor.

Input: csv_pus.zip from https://www2.census.gov/programs-surveys/acs/data/pums/2023/1-Year/

Usage:
  python3 scripts/pums_singles.py csv_pus.zip
"""
import argparse
import json
import zipfile

import pandas as pd

from acs_to_json import DATA, embed, read_const

DEG_BANDS = [(18, 24), (25, 34), (35, 44), (45, 64)]


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pums_zip")
    ap.add_argument("--page", default=DATA)
    a = ap.parse_args()

    bands = read_const(a.page, "ACS")["bands"]

    z = zipfile.ZipFile(a.pums_zip)
    parts, partner_hh = [], set()
    for name in ["psam_pusa.csv", "psam_pusb.csv"]:
        for ch in pd.read_csv(z.open(name), usecols=["SERIALNO", "PWGTP", "AGEP", "SEX", "MAR", "SCHL", "RELSHIPP"],
                              chunksize=500_000, dtype={"SERIALNO": str}):
            partner_hh.update(ch.SERIALNO[ch.RELSHIPP.isin([22, 24])])
            parts.append(ch[ch.AGEP >= 15])
    p = pd.concat(parts)
    p["single"] = p.MAR.isin([2, 3, 5])
    p["cohab"] = p.RELSHIPP.isin([22, 24]) | ((p.RELSHIPP == 20) & p.SERIALNO.isin(partner_hh))
    p["ba"] = p.SCHL >= 21
    share = lambda df, col: (df[col]*df.PWGTP).sum()/df.PWGTP.sum()

    out = {"free": {}, "deg": {}}
    for sex, g in [(2, "w"), (1, "m")]:
        s = p[p.SEX == sex]
        sg = s[s.single]
        out["free"][g] = [round(1 - share(sg[sg.AGEP.between(lo, hi)], "cohab"), 3) for lo, hi in bands]
        pool = sg[~sg.cohab]
        out["deg"][g] = [round(share(pool[pool.AGEP.between(max(lo, 21), hi)], "ba")/share(s[s.AGEP.between(lo, hi)], "ba"), 3)
                         for lo, hi in DEG_BANDS]
    out["degBands"] = [list(b) for b in DEG_BANDS]
    print(json.dumps(out))
    embed(a.page, "PUMS", out, after="ACSE")
    print(f"Embedded into {a.page}")


if __name__ == "__main__":
    main()
