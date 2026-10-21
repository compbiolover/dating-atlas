"""Five-point politics, plus not political, for the page, from the 2024 Cooperative Election Study (CES).

The page used to split everyone into progressive (the metro's Harris share + 20 points) or conservative. This
script estimates six groups from CES's ideology question (ideo5) among single women and men aged 25 to 35:
  prog  very liberal      lib   liberal      mod   moderate
  con   conservative      vcon  very conservative      apol  not sure (shown as not political)
and everything the page needs to use them:
  fit        how the groups vary with the metro's Harris share, among respondents placed in one of the page's
             metros. Single groups are too thin for a slope each (a few hundred respondents across 381 metros), so
             four broader groups get one: logit P(group) = a + b*logit(Harris share) + c*woman, for left (very
             liberal or liberal), moderate, right (conservative or very conservative) and not sure. The page
             normalizes the four to sum to 1 and splits left and right by the national ratios in split.
  split      very liberal's share of the left and conservative's share of the right, by gender
  nonbinary  the six groups' shares among nonbinary singles aged 18 to 40 (275 respondents; too few for a metro
             slope, so the page uses these shares in every metro)
  deg        P(group | bachelor's or higher) / P(group), by gender, for the degree filter
  or         odds ratio between each group and no religion (religpew 9-11) and each group and Christian (1-4), by
             gender, among all young singles and among degree holders, for the politics-and-faith joint
  none_split share of the non-religious who are atheist, agnostic or nothing in particular, within each group,
             both genders pooled, shrunk toward the overall split with 30 pseudo-respondents
Intervals and the spread of the log odds ratios come from 500 bootstrap replicates of respondents. Degree holders'
odds ratios rest on thin cells, so each one's log difference from the all-singles ratio is shrunk toward zero
(empirical Bayes: prior variance = the spread of those differences beyond their sampling variance); or_ba_shrunk.

Usage: python3 scripts/structure/ces_politics.py DATA_DIR   (DATA_DIR holds ces24.csv, the CES 2024 common content
from doi:10.7910/DVN/X11EP6, and list1_2023.xlsx, the Census Bureau's 2023 CBSA delineation)
"""
import json, os, re, sys
import numpy as np, pandas as pd
import statsmodels.api as sm

DATA, ROOT = sys.argv[1], os.path.join(os.path.dirname(__file__), "..", "..")
OUT = os.path.join(os.path.dirname(__file__), "out")
rng, B = np.random.default_rng(20251017), 500
K = {"prog": 1, "lib": 2, "mod": 3, "con": 4, "vcon": 5, "apol": 6}
NONE = {"atheist": 9, "agnostic": 10, "nothing": 11}

# Each respondent's metro and its Harris share, as ces_metro_form.py places them
html = open(os.path.join(ROOT, "atlas", "data.js"), encoding="utf-8").read()
raw = json.loads(re.search(r"^const RAW = (.*?);$", html, re.M | re.S).group(1))
geo = pd.read_csv(os.path.join(ROOT, "data", "metro_housing.csv"))[["metro", "geoid"]]
m = pd.DataFrame([{"metro": r[0], "dem": r[4]/100} for r in raw]).merge(geo, on="metro", how="left")
x = pd.read_excel(os.path.join(DATA, "list1_2023.xlsx"), header=2).dropna(subset=["FIPS State Code"])
x["fips"] = (x["FIPS State Code"]*1000 + x["FIPS County Code"]).astype(int); x["geoid"] = x["CBSA Code"].astype(int)
cw = x[["fips", "geoid"]].merge(m, on="geoid")

d = pd.read_csv(os.path.join(DATA, "ces24.csv"), usecols=["gender4", "birthyr", "marstat", "ideo5", "religpew", "educ",
                                                          "countyfips", "commonweight"], low_memory=False)
d["age"] = 2024 - d.birthyr
ys = d[d.gender4.isin([1, 2]) & d.age.between(25, 35) & d.marstat.isin([3, 4, 5]) & (d.commonweight > 0) & d.ideo5.notna()].copy()
ys["g"] = np.where(ys.gender4 == 2, "w", "m"); ys["ba"] = ys.educ >= 5
ys = ys.merge(cw[["fips", "geoid", "dem"]], left_on="countyfips", right_on="fips", how="left")
for k, v in K.items(): ys[k] = (ys.ideo5 == v).astype(float)
ys["none"] = ys.religpew.isin(NONE.values()).astype(float); ys["christian"] = ys.religpew.isin([1, 2, 3, 4]).astype(float)
ys.loc[ys.religpew.isna(), ["none", "christian"]] = np.nan
lg = lambda p: np.log(p/(1 - p))
wm = lambda v, w: float(np.sum(v*w)/np.sum(w))

GROUPS = {"left": ["prog", "lib"], "mod": ["mod"], "right": ["con", "vcon"], "apol": ["apol"]}

def fit(s, ks):
    s = s[s.dem.notna()]; y = s[ks].sum(axis=1)
    X = sm.add_constant(pd.DataFrame({"x": lg(np.clip(s.dem, .02, .98)), "w": (s.g == "w").astype(float)}))
    f = sm.GLM(y, X, family=sm.families.Binomial(), var_weights=s.commonweight).fit(cov_type="cluster", cov_kwds={"groups": s.geoid})
    return {k: round(float(f.params[c]), 4) for k, c in [("a", "const"), ("b", "x"), ("c", "w")]} | \
           {"se_b": round(float(f.bse["x"]), 4), "n": int(len(s)), "metros": int(s.geoid.nunique())}

def odds_ratio(s, k, c):
    s = s[s[c].notna()]; w = s.commonweight/s.commonweight.mean()
    a, b = np.sum(w*s[k]*s[c]), np.sum(w*s[k]*(1 - s[c])); cc, dd = np.sum(w*(1 - s[k])*s[c]), np.sum(w*(1 - s[k])*(1 - s[c]))
    return float((a + .5)*(dd + .5)/((b + .5)*(cc + .5)))  # +0.5 per cell keeps thin cells (very conservative and none) finite

def stats(s):
    out = {}
    for g in ["w", "m"]:
        t = s[s.g == g]; out[g] = {"share": {}, "deg": {}, "or": {}}
        for k in K:
            out[g]["share"][k] = wm(t[k], t.commonweight)
            out[g]["deg"][k] = wm(t[k][t.ba], t.commonweight[t.ba])/out[g]["share"][k]
            out[g]["or"][k] = {f"{c}_{sub}": odds_ratio(t[msk], k, c) for c in ["none", "christian"]
                               for sub, msk in [("all", np.ones(len(t), bool)), ("ba", t.ba.values)]}
    # Non-religious split within each group, both genders pooled, shrunk toward the overall split
    nn = s[s.none == 1]; tot = nn.groupby("religpew").commonweight.sum(); tot = tot/tot.sum()
    out["none_split"] = {}
    for k in K:
        t = nn[nn[k] == 1]; n = len(t); sh = t.groupby("religpew").commonweight.sum(); sh = sh/sh.sum() if n else sh
        out["none_split"][k] = {nm: (n*float(sh.get(code, 0)) + 30*float(tot.get(code, 0)))/(n + 30) for nm, code in NONE.items()}
    out["none_split"]["all"] = {nm: float(tot.get(code, 0)) for nm, code in NONE.items()}
    return out

est = stats(ys)
draws = [stats(ys.iloc[rng.integers(0, len(ys), len(ys))]) for _ in range(B)]
ci = lambda f: [round(float(np.percentile([f(r) for r in draws], q)), 4) for q in (2.5, 97.5)]
sdlog = lambda f: float(np.std([np.log(f(r)) for r in draws]))
res = {"n": {g: int((ys.g == g).sum()) for g in ["w", "m"]}, "n_ba": {g: int(((ys.g == g) & ys.ba).sum()) for g in ["w", "m"]},
       "fit": {grp: fit(ys, ks) for grp, ks in GROUPS.items()}}
for g in ["w", "m"]:
    res[g] = {"split": {"prog_of_left": round(est[g]["share"]["prog"]/(est[g]["share"]["prog"] + est[g]["share"]["lib"]), 4),
                        "con_of_right": round(est[g]["share"]["con"]/(est[g]["share"]["con"] + est[g]["share"]["vcon"]), 4)},
              "share": {}, "deg": {}, "or": {}}
    for k in K:
        res[g]["share"][k] = {"est": round(est[g]["share"][k], 4), "ci": ci(lambda r: r[g]["share"][k])}
        res[g]["deg"][k] = {"est": round(est[g]["deg"][k], 3), "ci": ci(lambda r: r[g]["deg"][k])}
        res[g]["or"][k] = {key: {"est": round(v, 3), "ci": ci(lambda r: r[g]["or"][k][key]), "sdlog": round(sdlog(lambda r: r[g]["or"][k][key]), 3)}
                           for key, v in est[g]["or"][k].items()}
res["none_split"] = {k: {nm: round(v, 3) for nm, v in sp.items()} for k, sp in est["none_split"].items()}
diffs = [(g, k, c) for g in ["w", "m"] for k in K for c in ["none", "christian"]]
dv = np.array([np.log(res[g]["or"][k][f"{c}_ba"]["est"]/res[g]["or"][k][f"{c}_all"]["est"]) for g, k, c in diffs])
sv = np.array([res[g]["or"][k][f"{c}_ba"]["sdlog"]**2 for g, k, c in diffs])
tau2 = max(0.0, float(np.var(dv) - np.mean(sv))); res["or_ba_shrink_tau2"] = round(tau2, 4)
for (g, k, c), dlog, s2 in zip(diffs, dv, sv):
    res[g]["or"][k][f"{c}_ba_shrunk"] = round(float(res[g]["or"][k][f"{c}_all"]["est"]*np.exp(dlog*tau2/(tau2 + s2))), 3)
nb = d[(d.gender4 == 3) & d.age.between(18, 40) & d.marstat.isin([3, 4, 5]) & (d.commonweight > 0) & d.ideo5.notna()]
res["nonbinary"] = {"n": int(len(nb))} | {k: round(wm((nb.ideo5 == v).astype(float), nb.commonweight), 4) for k, v in K.items()}
# One spread for the page's uncertainty range: the median bootstrap sd of the log odds ratios, all and degree holders
for sub in ["all", "ba"]:
    res[f"sdlog_or_{sub}"] = round(float(np.median([res[g]["or"][k][f"{c}_{sub}"]["sdlog"] for g in ["w", "m"] for k in K for c in ["none", "christian"]])), 3)
os.makedirs(OUT, exist_ok=True)
json.dump(res, open(os.path.join(OUT, "ces_politics.json"), "w"), indent=1)
print(json.dumps({"fit": res["fit"]} | {g: {"split": res[g]["split"], "share": {k: v["est"] for k, v in res[g]["share"].items()}, "deg": {k: v["est"] for k, v in res[g]["deg"].items()}} for g in ["w", "m"]}, indent=1))
print("sdlog", res["sdlog_or_all"], res["sdlog_or_ba"], "| none split", res["none_split"]["all"])
