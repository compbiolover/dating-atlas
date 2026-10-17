"""Degree share among singles against everyone, from the 2023 ACS 1-year PUMS.

The page's degree step uses Table B15001: the share of ALL women (men) aged 25 to 34 with a bachelor's or
higher. It multiplies that into a pool of singles, which assumes singles hold degrees at the same rate as
everyone, and it uses the 25-34 share whatever age range you pick. It also removes a flat 15% of singles as
cohabiting, whatever their age or degree. This script measures all three.

"Single" follows B12002: never married, divorced or widowed (separated counts as married). "Pool" singles are
those not living with an unmarried partner: neither a partner of the householder (RELSHIPP 22, 24) nor a
householder who has one. Standard errors use the 80 successive-difference replicate weights.

Usage: python3 scripts/structure/pums_degree.py DATA_DIR   (DATA_DIR/csv_pus.zip from
https://www2.census.gov/programs-surveys/acs/data/pums/2023/1-Year/)
"""
import json, os, sys, zipfile
import numpy as np, pandas as pd

z = zipfile.ZipFile(os.path.join(sys.argv[1], "csv_pus.zip"))
R = [f"PWGTP{i}" for i in range(1, 81)]
keep = ["SERIALNO", "STATE", "PWGTP", "AGEP", "SEX", "MAR", "SCHL", "RELSHIPP"] + R
parts, partner_hh = [], set()
for name in ["psam_pusa.csv", "psam_pusb.csv"]:
    for ch in pd.read_csv(z.open(name), usecols=keep, chunksize=400_000, dtype={"SERIALNO": str}):
        partner_hh.update(ch.SERIALNO[ch.RELSHIPP.isin([22, 24])])
        parts.append(ch[ch.AGEP.between(20, 64)])
p = pd.concat(parts)
p["g"] = np.where(p.SEX == 2, "w", "m")
p["ba"] = (p.SCHL >= 21).astype(float)
p["single"] = p.MAR.isin([2, 3, 5])
p["cohab"] = p.RELSHIPP.isin([22, 24]) | ((p.RELSHIPP == 20) & p.SERIALNO.isin(partner_hh))
p["pool"] = p.single & ~p.cohab

def share(df, col, w):
    return (df[col]*df[w]).sum()/df[w].sum()

def with_se(fn):
    """Estimate and SDR standard error of a statistic fn(weight column name)."""
    est = fn("PWGTP")
    reps = np.array([fn(r) for r in R])
    return {"est": float(est), "se": float(np.sqrt(4/80*np.sum((reps - est)**2)))}

out = {"n": int(len(p)), "bands": {}}
bands = {"25-35": (25, 35), "25-29": (25, 29), "30-34": (30, 34), "35-44": (35, 44), "45-54": (45, 54), "55-64": (55, 64), "20-64": (20, 64)}
for g in ["w", "m"]:
    base = p[(p.g == g) & p.AGEP.between(25, 34)]               # the page's B15001 basis
    for lab, (lo, hi) in bands.items():
        s = p[(p.g == g) & p.AGEP.between(lo, hi)]
        o = {}
        o["ba_all_25_34"] = with_se(lambda w: share(base, "ba", w))
        o["ba_pool"] = with_se(lambda w: share(s[s.pool], "ba", w))
        o["ba_single"] = with_se(lambda w: share(s[s.single], "ba", w))
        # What the page's degree step should be multiplied by: degree share of the pool over the B15001 share
        o["ratio_pool_vs_page"] = with_se(lambda w: share(s[s.pool], "ba", w)/share(base, "ba", w))
        # Share of B12002 singles who live with a partner (the page removes 15% everywhere), overall and by degree
        o["cohab_share"] = with_se(lambda w: share(s[s.single], "cohab", w))
        o["cohab_share_ba"] = with_se(lambda w: share(s[s.single & (s.ba == 1)], "cohab", w))
        o["cohab_share_noba"] = with_se(lambda w: share(s[s.single & (s.ba == 0)], "cohab", w))
        o["n_pool"] = int(s.pool.sum())
        out["bands"][f"{g} {lab}"] = o
# Does the ratio vary by state? (Metros can't be read off PUMS without a PUMA crosswalk; states bound the spread.)
st = []
for (stt, g), s in p[p.AGEP.between(25, 35)].groupby(["STATE", "g"]):
    b = s[s.AGEP <= 34]
    if s.pool.sum() >= 400:
        st.append({"state": int(stt), "g": g, "ratio": float(share(s[s.pool], "ba", "PWGTP")/share(b, "ba", "PWGTP")), "n_pool": int(s.pool.sum())})
out["state_ratio_25_35"] = st
os.makedirs(os.path.join(os.path.dirname(__file__), "out"), exist_ok=True)
json.dump(out, open(os.path.join(os.path.dirname(__file__), "out", "pums_degree.json"), "w"), indent=1)
for k, o in out["bands"].items():
    print(k, {kk: (round(v["est"], 3), round(v["se"], 3)) if isinstance(v, dict) else v for kk, v in o.items()})
sr = pd.DataFrame(st)
print(sr.groupby("g").ratio.describe(percentiles=[.1, .5, .9]).round(3))
