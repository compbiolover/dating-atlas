"""When singles who want kids expect their first, from the 2022-2023 National Survey of Family Growth.

The page's kids step keeps everyone who wants kids when you do, whatever their timeline. NSFG asks unmarried,
non-cohabiting respondents who intend to have a child when they expect the next one (INTNEXT: within 2 years,
2 to 5 years, more than 5 years). This script gives that split among childless singles who intend to have kids
(INTENT = 1), by sex and age band, weighted. Childless is PARITY = 0 for women and not EVBIOKID = 1 for men.
Few people 35 and older intend a first child, so 35 to 49 is one band. Standard errors are binomial with Kish's
effective sample size, as the page uses for its other survey rates. Source of KID_WHEN in atlas/model.js.

Usage: python3 scripts/structure/nsfg_timing.py DATA_DIR   (DATA_DIR/Fem and DATA_DIR/Male hold the CSVs from
https://ftp.cdc.gov/pub/Health_Statistics/NCHS/NSFG/NSFG-2022-2023-FemRespPUFData.zip and ...-MaleRespPUFData.zip)
"""
import json, os, sys
import numpy as np, pandas as pd

BANDS = {"18-24": (18, 24), "25-29": (25, 29), "30-34": (30, 34), "35-49": (35, 49)}
COLS = ["AGE_R", "RMARIT", "INTENT", "INTNEXT", "WGT2022_2023", "PARITY", "EVBIOKID"]
out = {}
for g, s in [("w", "Fem"), ("m", "Male")]:
    d = pd.read_csv(os.path.join(sys.argv[1], s, f"NSFG_2022_2023_{s}RespPUFData.csv"), usecols=lambda c: c in COLS, dtype=float)
    childless = d.PARITY.eq(0) if g == "w" else ~d.EVBIOKID.eq(1)
    x = d[d.RMARIT.eq(0) & childless & d.INTENT.eq(1) & d.INTNEXT.isin([1, 2, 3])]
    out[g] = {}
    for lab, (lo, hi) in BANDS.items():
        b = x[x.AGE_R.between(lo, hi)]
        w = b.WGT2022_2023
        neff = w.sum()**2/(w**2).sum()
        sh = [float(np.average(b.INTNEXT.eq(k), weights=w)) for k in (1, 2, 3)]
        out[g][lab] = {"n": int(len(b)), "neff": round(float(neff), 1), "share": [round(v, 3) for v in sh],
                       "se": [round(float(np.sqrt(v*(1 - v)/neff)), 3) for v in sh]}
json.dump(out, open(os.path.join(os.path.dirname(__file__), "out", "nsfg_timing.json"), "w"), indent=1)
print("const KID_WHEN = {" + ", ".join(f"{g}:[" + ",".join("[" + ",".join(f"{v:.3f}".lstrip("0") for v in out[g][b]["share"]) + "]"
      for b in BANDS) + "]" for g in out) + "};")
