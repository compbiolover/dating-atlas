"""Do the page's politics and faith formulas have the right shape? A check against CES respondents in each metro.

Each CES respondent is placed in their metro (county -> 2023 CBSA delineation -> the page's metro list) and given
the page's own inputs for it: the metro Harris share, PRRI unaffiliated share and congregation share. Then:

  progressive  page: Harris share + 20 points (men -10), capped at 90%
               fit:  logit P(Harris vote) = a + b * logit(metro Harris share), young single voters, by gender
  secular      page: 40% + (unaffiliated - 23.1) + 0.3 * (48.6 - congregation share) (men +4), clamped to 5-80%
               fit:  logit P(no religion) = a + b * logit(page's secular value), young singles, by gender

A calibration fit among ALL adults against the matching metro measure (Harris vote on Harris share, no religion on
PRRI's unaffiliated share) shows how faithfully CES reproduces geography; a slope near 1 means it does.

Usage: python3 scripts/structure/ces_metro_form.py DATA_DIR   (ces24.csv, list1_2023.xlsx from the Census
Bureau's 2023 delineation files)
"""
import json, os, re, sys
import numpy as np, pandas as pd
import statsmodels.api as sm

DATA, ROOT = sys.argv[1], os.path.join(os.path.dirname(__file__), "..", "..")
html = open(os.path.join(ROOT, "atlas", "data.js"), encoding="utf-8").read()
raw = json.loads(re.search(r"^const RAW = (.*?);$", html, re.M | re.S).group(1))
rel = json.loads(re.search(r"^const REL = (.*?);$", html, re.M | re.S).group(1))
geo = pd.read_csv(os.path.join(ROOT, "data", "metro_housing.csv"))[["metro", "geoid"]]
m = pd.DataFrame([{"metro": r[0], "dem": r[4]/100} for r in raw])
m["adh"] = m.metro.map(lambda k: rel.get(k, [48.6, 23.1])[0]); m["none"] = m.metro.map(lambda k: rel.get(k, [48.6, 23.1])[1])
m = m.merge(geo, on="metro", how="left")
x = pd.read_excel(os.path.join(DATA, "list1_2023.xlsx"), header=2).dropna(subset=["FIPS State Code"])
x["fips"] = (x["FIPS State Code"]*1000 + x["FIPS County Code"]).astype(int); x["geoid"] = x["CBSA Code"].astype(int)
cw = x[["fips", "geoid"]].merge(m, on="geoid")

d = pd.read_csv(os.path.join(DATA, "ces24.csv"), usecols=["gender4", "birthyr", "marstat", "religpew", "countyfips", "commonweight", "commonpostweight", "CC24_410"], low_memory=False)
d = d[d.gender4.isin([1, 2])].merge(cw, left_on="countyfips", right_on="fips", how="inner")
d["g"] = np.where(d.gender4 == 2, "w", "m"); d["age"] = 2024 - d.birthyr
d["vote"] = d.CC24_410.map({1: 1, 2: 0}); d["none_rel"] = np.where(d.religpew.isna(), np.nan, d.religpew.isin([9, 10, 11]).astype(float))
d["page_prog"] = np.minimum(.9, d.dem + .2 - np.where(d.g == "m", .10, 0))
d["page_sec"] = np.clip(.40 + (d.none - 23.1)/100 + .3*(48.6 - d.adh)/100 + np.where(d.g == "m", .04, 0), .05, .8)
lg = lambda p: np.log(p/(1 - p))

def fit(s, y, xv, w):
    s = s[s[y].notna() & (s[w] > 0)]
    f = sm.GLM(s[y], sm.add_constant(lg(np.clip(s[xv], .02, .98))), family=sm.families.Binomial(), var_weights=s[w]).fit(cov_type="cluster", cov_kwds={"groups": s.geoid})
    return {"a": float(f.params.iloc[0]), "b": float(f.params.iloc[1]), "se_a": float(f.bse.iloc[0]), "se_b": float(f.bse.iloc[1]), "n": int(len(s)), "metros": int(s.geoid.nunique())}

ys = d[d.age.between(25, 35) & d.marstat.isin([3, 4, 5])]
out = {"matched_respondents": int(len(d)), "metros_with_respondents": int(d.geoid.nunique()),
       "calib_vote_all_adults": fit(d, "vote", "dem", "commonpostweight"),
       "calib_none_all_adults": fit(d.assign(prri=d.none/100), "none_rel", "prri", "commonweight")}
for g in ["w", "m"]:
    s = ys[ys.g == g]
    pf, sf = fit(s, "vote", "dem", "commonpostweight"), fit(s, "none_rel", "page_sec", "commonweight")
    # Compare at the 10th, 50th and 90th percentile metro by population
    mm = m.assign(page_prog=np.minimum(.9, m.dem + .2 - (.10 if g == "m" else 0)),
                  page_sec=np.clip(.40 + (m.none - 23.1)/100 + .3*(48.6 - m.adh)/100 + (.04 if g == "m" else 0), .05, .8))
    pts = {}
    for col, f, xv in [("prog", pf, "dem"), ("sec", sf, "page_sec")]:
        vals = mm[xv].quantile([.1, .5, .9]).values
        pts[col] = [{"x": float(v), "page": float(np.minimum(.9, v + .2 - (.10 if g == "m" else 0))) if col == "prog" else float(v),
                     "fitted": float(1/(1 + np.exp(-(f["a"] + f["b"]*lg(v)))))} for v in vals]
    out[g] = {"prog": pf, "sec": sf, "compare": pts,
              "mean_page_sec": float(np.average(s.page_sec, weights=s.commonweight)), "mean_none": float(np.average(s.none_rel.dropna(), weights=s.commonweight[s.none_rel.notna()]))}
os.makedirs(os.path.join(os.path.dirname(__file__), "out"), exist_ok=True)
json.dump(out, open(os.path.join(os.path.dirname(__file__), "out", "ces_metro_form.json"), "w"), indent=1)
print(json.dumps(out, indent=1))
