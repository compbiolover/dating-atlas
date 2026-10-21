"""Is the page's secular-leaning share too low? The level check behind docs/structural-uncertainty.md.

The page sets young singles' secular-leaning share to 40% + (metro unaffiliated - 23.1) + 0.3 x (48.6 - metro
congregation share), men +4 points. The 40% is hand-set: at a metro where PRRI finds 23.1% of ALL adults
unaffiliated, it says 40% of single women 25-35 are secular-leaning, a ratio of 40/23.1 = 1.73. CES puts
young singles 6 to 7 points higher, but CES also finds more unaffiliated adults overall than PRRI or Pew do.

This script measures, in CES and in the GSS (2022 and 2024, a probability sample), the no-religion share of
single women and men aged 25 to 35 and of all adults, and the ratio between them. The ratio cancels each
survey's overall house effect on religion; applied to PRRI's scale (the page's own source for metro
differences) it gives the base the page should use. Also reports how the share falls with age, since the page
uses one base for every age range.

Usage: python3 scripts/structure/secular_level.py DATA_DIR
  DATA_DIR holds ces24.csv, list1_2023.xlsx and gss/gss2022/2022/GSS2022.dta, gss/gss2024/2024/GSS2024.dta
  (https://gss.norc.org/get-the-data/stata.html)
"""
import json, os, re, sys
import numpy as np, pandas as pd

DATA, ROOT = sys.argv[1], os.path.join(os.path.dirname(__file__), "..", "..")
OUT = os.path.join(os.path.dirname(__file__), "out")
rng = np.random.default_rng(20251017)
B = 1000

def wm(x, w):
    return float(np.sum(x*w)/np.sum(w))

def boot(df, fn, cluster=None):
    """Estimate with a 95% bootstrap interval; resamples rows, or whole clusters (e.g. survey years) if given"""
    est = fn(df); reps = []
    for _ in range(B):
        reps.append(fn(df.iloc[rng.integers(0, len(df), len(df))]))
    return {"est": est, "lo": float(np.percentile(reps, 2.5)), "hi": float(np.percentile(reps, 97.5)), "n": int(len(df))}

# ---- GSS 2022 + 2024 ----
cols = ["year", "age", "sex", "marital", "relig", "attend", "wtssnrps", "mode", "xnorcsiz"]
g = pd.concat([pd.read_stata(os.path.join(DATA, p), convert_categoricals=False, columns=cols)
               for p in ["gss/gss2022/2022/GSS2022.dta", "gss/gss2024/2024/GSS2024.dta"]])
g = g[g.relig.between(1, 13) & g.sex.isin([1, 2]) & g.age.between(18, 89) & (g.wtssnrps > 0)].copy()
g["none"] = (g.relig == 4).astype(float)
g["broad"] = ((g.relig == 4) | g.attend.isin([0, 1])).astype(float)          # no religion, or attends less than once a year
g["single"] = g.marital.isin([2, 3, 5]); g["gs"] = np.where(g.sex == 2, "w", "m")
g["metroish"] = g.xnorcsiz.between(1, 6)                                       # cities over 50,000, their suburbs and fringes
g["w"] = g.wtssnrps
# Each year's weights sum to its own sample; give the two years equal weight
g["w"] = g.w/g.groupby("year").w.transform("sum")

# ---- CES 2024, with each respondent's metro ----
c = pd.read_csv(os.path.join(DATA, "ces24.csv"), usecols=["gender4", "birthyr", "marstat", "religpew", "countyfips", "commonweight"], low_memory=False)
c = c[c.gender4.isin([1, 2]) & c.religpew.notna() & (c.commonweight > 0)].copy()
c["age"] = 2024 - c.birthyr; c["gs"] = np.where(c.gender4 == 2, "w", "m")
c["none"] = c.religpew.isin([9, 10, 11]).astype(float); c["single"] = c.marstat.isin([3, 4, 5]); c["w"] = c.commonweight
x = pd.read_excel(os.path.join(DATA, "list1_2023.xlsx"), header=2).dropna(subset=["FIPS State Code"])
x = x[x["Metropolitan/Micropolitan Statistical Area"].str.startswith("Metro")]
c["metro"] = c.countyfips.isin((x["FIPS State Code"]*1000 + x["FIPS County Code"]).astype(int))

def share(col, **f):
    def fn(df):
        s = df
        for k, v in f.items():
            s = s[s[k].between(*v)] if isinstance(v, tuple) else s[s[k] == v]
        return wm(s[col].values, s.w.values)
    return fn

def ratio(col, num, den):
    return lambda df: share(col, **num)(df)/share(col, **den)(df)

out = {"gss": {}, "ces": {}}
for name, df, extra in [("gss", g, {}), ("gss_in_person", g[g["mode"] == 1], {}), ("gss_metroish", g[g.metroish], {}),
                        ("ces", c, {}), ("ces_metro", c[c.metro], {})]:
    o = {"all_adults": boot(df, share("none"))}
    for s in ["w", "m"]:
        o[f"single_25_35_{s}"] = boot(df, share("none", single=True, gs=s, age=(25, 35)))
        o[f"ratio_{s}"] = boot(df, ratio("none", {"single": True, "gs": s, "age": (25, 35)}, {}))
        for lo, hi in [(36, 45), (46, 55), (56, 65)]:
            o[f"single_{lo}_{hi}_{s}"] = boot(df, share("none", single=True, gs=s, age=(lo, hi)))
    if name.startswith("gss"):
        for s in ["w", "m"]:
            o[f"broad_single_25_35_{s}"] = boot(df, share("broad", single=True, gs=s, age=(25, 35)))
    out[name] = o

# ---- The page's own numbers ----
html = open(os.path.join(ROOT, "atlas", "data.js"), encoding="utf-8").read()
raw = json.loads(re.search(r"^const RAW = (.*?);$", html, re.M | re.S).group(1))
rel = json.loads(re.search(r"^const REL = (.*?);$", html, re.M | re.S).group(1))
m = pd.DataFrame([{"metro": r[0], "pop": r[1]} for r in raw])
m["adh"] = m.metro.map(lambda k: rel.get(k, [48.6, 23.1])[0]); m["none"] = m.metro.map(lambda k: rel.get(k, [48.6, 23.1])[1])
page = {}
for s, ss in [("w", 0), ("m", .04)]:
    sec = np.clip(.40 + (m.none - 23.1)/100 + .3*(48.6 - m.adh)/100 + ss, .05, .8)
    page[f"pop_weighted_{s}"] = float(np.average(sec, weights=m["pop"]))
page["prri_none_pop_weighted"] = float(np.average(m.none, weights=m["pop"]))/100
page["prri_none_metro_mean"] = float(m.none.mean())/100
page["implied_ratio_women_at_average_metro"] = .40/.231
out["page"] = page

# ---- The base the page should use ----
# The page's secular share at a metro is base + (PRRI unaffiliated - 23.1) + ..., so at the average metro it equals
# the base. Young singles there have (survey ratio) x 23.1% with no religion. Using the GSS and CES ratios in turn:
out["implied_base"] = {}
for src in ["gss", "ces", "ces_metro"]:
    for s, ss in [("w", 0), ("m", .04)]:
        r = out[src][f"ratio_{s}"]
        out["implied_base"][f"{src}_{s}"] = {k: float(.231*r[k] - ss) for k in ["est", "lo", "hi"]}   # base before the men's +4

os.makedirs(OUT, exist_ok=True)
json.dump(out, open(os.path.join(OUT, "secular_level.json"), "w"), indent=1)
f = lambda o: f"{o['est']:.3f} [{o['lo']:.3f}, {o['hi']:.3f}] n={o['n']}"
for src in ["gss", "gss_in_person", "gss_metroish", "ces", "ces_metro"]:
    o = out[src]; print(f"== {src}\n  all adults {f(o['all_adults'])}")
    for s in ["w", "m"]:
        print(f"  {s}: single 25-35 {f(o[f'single_25_35_{s}'])}  ratio {f(o[f'ratio_{s}'])}")
        print(f"      36-45 {o[f'single_36_45_{s}']['est']:.3f}  46-55 {o[f'single_46_55_{s}']['est']:.3f}  56-65 {o[f'single_56_65_{s}']['est']:.3f}"
              + (f"   broad 25-35 {f(o[f'broad_single_25_35_{s}'])}" if src.startswith("gss") else ""))
print("page", {k: round(v, 3) for k, v in page.items()})
print("implied base (women's base; men get +4 on top):", {k: {kk: round(vv, 3) for kk, vv in v.items()} for k, v in out["implied_base"].items()})
