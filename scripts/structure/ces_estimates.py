"""Joint distributions among young singles from the 2024 Cooperative Election Study (CES).

The page multiplies degree, politics, faith and openness as if they were independent. This script measures
how far that is from the truth among single women and men aged 25 to 35, the default search, and writes the
estimates with bootstrap intervals to scripts/structure/out/ces_estimates.json.

Usage: python3 scripts/structure/ces_estimates.py DATA_DIR
  DATA_DIR holds CCES24_Common_OUTPUT_vv_topost_final.csv (Harvard Dataverse doi:10.7910/DVN/X11EP6, saved
  as ces24.csv) and 2024_US_County_Level_Presidential_Results.csv (tonmcg, saved as county24.csv).
"""
import json, sys, os
import numpy as np, pandas as pd
import statsmodels.api as sm

DATA = sys.argv[1]
OUT = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(OUT, exist_ok=True)
B = 500                          # bootstrap replicates
rng = np.random.default_rng(20251017)

cols = ["gender4", "birthyr", "educ", "marstat", "pid7", "ideo5", "religpew", "pew_religimp", "sexuality",
        "countyfips", "commonweight", "commonpostweight", "CC24_410"]
d = pd.read_csv(os.path.join(DATA, "ces24.csv"), usecols=cols, low_memory=False)
d["age"] = 2024 - d.birthyr
d = d[d.gender4.isin([1, 2]) & (d.commonweight > 0)].copy()
d["g"] = np.where(d.gender4 == 2, "w", "m")
# Codes from the CES 2024 guide
d["ba"] = (d.educ >= 5).astype(float)                                   # 4-year or post-grad
d["single"] = d.marstat.isin([3, 4, 5])                                 # divorced, widowed, never married (as ACS B12002)
# Progressive, three ways. The page's progressive share is a binary with conservative as its complement, so
# pure independents and "not sure" count half rather than being dropped.
d["prog_pid"] = d.pid7.map({1: 1, 2: 1, 3: 1, 4: .5, 5: 0, 6: 0, 7: 0, 8: .5})
d["prog_ideo"] = d.ideo5.map({1: 1, 2: 1, 3: .5, 4: 0, 5: 0, 6: .5})
d["prog_vote"] = d.CC24_410.map({1: 1, 2: 0})                           # Harris vs Trump voters only
# Secular-leaning, two ways: no religion (atheist, agnostic, nothing in particular), or that plus anyone who says
# religion is not too or not at all important
d["sec_none"] = d.religpew.isin([9, 10, 11]).astype(float)
d["sec_broad"] = (d.religpew.isin([9, 10, 11]) | d.pew_religimp.isin([3, 4])).astype(float)
d.loc[d.religpew.isna(), ["sec_none", "sec_broad"]] = np.nan
d["christian"] = d.religpew.isin([1, 2, 3, 4]).astype(float)            # Protestant, Catholic, Mormon, Orthodox
for k, codes in {"catholic": [2], "protestant": [1], "lds": [3], "jewish": [5], "muslim": [6], "buddhist": [7], "hindu": [8]}.items():
    d[k] = d.religpew.isin(codes).astype(float)
# Open to dating women (men) or men (women): everyone except gay men and lesbians. "Other" and "prefer not to
# say" count as open, which leans toward the page's national rates.
d["open_m"] = np.where(d.sexuality.isna(), np.nan, (d.sexuality != 2).astype(float))   # women open to men
d["open_w"] = np.where(d.sexuality.isna(), np.nan, (d.sexuality != 3).astype(float))   # men open to women

young = d[d.age.between(25, 35)]
ys = young[young.single]

def wmean(x, w):
    m = ~np.isnan(x)
    return np.sum(x[m]*w[m])/np.sum(w[m])

def stats(df):
    """Every quantity for one (resampled) data frame of young singles of one gender."""
    w = df.commonweight.values
    out = {}
    ba = df.ba.values
    for pk in ["prog_pid", "prog_ideo", "prog_vote"]:
        p = df[pk].values.astype(float)
        pa, pb = wmean(p, w), wmean(p[ba == 1], w[ba == 1])
        out[f"{pk}"] = pa
        out[f"{pk}|ba"] = pb
        out[f"lift_ba_{pk}"] = pb/pa
        out[f"or_ba_{pk}"] = (pb/(1-pb))/(wmean(p[ba == 0], w[ba == 0])/(1-wmean(p[ba == 0], w[ba == 0])))
        out[f"liftcons_ba_{pk}"] = (1-pb)/(1-pa)
    for sk in ["sec_none", "sec_broad", "christian"]:
        q = df[sk].values.astype(float)
        qa, qb = wmean(q, w), wmean(q[ba == 1], w[ba == 1])
        out[sk], out[f"{sk}|ba"], out[f"lift_ba_{sk}"] = qa, qb, qb/qa
    # Politics x faith: lift = P(both)/(P(a)P(b)) and the odds ratio, overall and among degree holders.
    # Fractional progressive codes (independents) enter as expectations.
    for pk in ["prog_pid", "prog_ideo"]:
        for sk, side in [("sec_none", 1), ("sec_broad", 1), ("christian", 0)]:
            for sub, msk in [("all", np.ones(len(df), bool)), ("ba", ba == 1)]:
                p = df[pk].values[msk].astype(float); p = p if side else 1 - p
                q = df[sk].values[msk].astype(float); ww = w[msk]
                ok = ~np.isnan(p) & ~np.isnan(q); p, q, ww = p[ok], q[ok], ww[ok]
                P, Q, J = wmean(p, ww), wmean(q, ww), wmean(p*q, ww)
                lab = ("prog" if side else "cons") + "_" + sk
                out[f"lift_{lab}_{pk}_{sub}"] = J/(P*Q)
                out[f"or_{lab}_{pk}_{sub}"] = (J*(1-P-Q+J))/((P-J)*(Q-J))
                out[f"joint_{lab}_{pk}_{sub}"] = J
    # Openness to the other gender among progressives (and conservatives) against everyone
    ok = "open_m" if df.g.iloc[0] == "w" else "open_w"
    o = df[ok].values.astype(float); p = df.prog_pid.values.astype(float)
    m_ = ~np.isnan(o)
    O = wmean(o, w); Op = np.sum((o*p*w)[m_])/np.sum((p*w)[m_]); Oc = np.sum((o*(1-p)*w)[m_])/np.sum(((1-p)*w)[m_])
    out["open"], out["open|prog"], out["open|cons"] = O, Op, Oc
    out["lift_open_prog"], out["lift_open_cons"] = Op/O, Oc/O
    out["open|ba"] = wmean(o[ba == 1], w[ba == 1])
    return out

def boot(df, fn):
    est = fn(df)
    reps = {k: [] for k in est}
    n = len(df)
    for _ in range(B):
        r = fn(df.iloc[rng.integers(0, n, n)])
        for k in est: reps[k].append(r[k])
    boot.last = reps
    return {k: {"est": est[k], "lo": float(np.nanpercentile(reps[k], 2.5)), "hi": float(np.nanpercentile(reps[k], 97.5))} for k in est}

# Parameters whose bootstrap draws are kept together, so step 2 can carry their joint uncertainty into the funnel
DRAW_KEYS = ["prog_pid", "prog_pid|ba", "sec_none", "sec_none|ba", "christian", "christian|ba",
             "or_prog_sec_none_prog_pid_all", "or_prog_sec_none_prog_pid_ba", "or_cons_christian_prog_pid_all", "or_cons_christian_prog_pid_ba",
             "lift_open_prog", "lift_open_cons"]
draws = {}
res = {"n": {}, "by_gender": {}}
for g in ["w", "m"]:
    sub = ys[ys.g == g]
    res["n"][g] = {"young_single": int(len(sub)), "young_single_ba": int(sub.ba.sum())}
    res["by_gender"][g] = boot(sub, stats)
    draws[g] = {k: [float(x) for x in boot.last[k]] for k in DRAW_KEYS}
json.dump(draws, open(os.path.join(OUT, "ces_draws.json"), "w"))

# Faith shares of young singles against all adults: the page applies PRRI shares of all adults
def faith_ratio(df_all, df_ys):
    out = {}
    for k in ["christian", "catholic", "protestant", "lds", "jewish", "muslim", "hindu", "buddhist", "sec_none"]:
        a = wmean(df_all[k].values.astype(float), df_all.commonweight.values)
        y = wmean(df_ys[k].values.astype(float), df_ys.commonweight.values)
        out[k] = y/a
        out[k + "_young_single"], out[k + "_all_adults"] = y, a
    return out
both = pd.concat([d.assign(_ys=False), ys.assign(_ys=True)])
est = faith_ratio(d, ys); reps = {k: [] for k in est}
for _ in range(B):
    da, dy = d.iloc[rng.integers(0, len(d), len(d))], ys.iloc[rng.integers(0, len(ys), len(ys))]
    r = faith_ratio(da, dy)
    for k in est: reps[k].append(r[k])
res["faith_young_vs_all"] = {k: {"est": est[k], "lo": float(np.nanpercentile(reps[k], 2.5)), "hi": float(np.nanpercentile(reps[k], 97.5))} for k in est}

# Degree share among singles against everyone 25 to 34 (the page uses B15001's share for all 25 to 34 year olds)
def deg_ratio(df):
    out = {}
    for g in ["w", "m"]:
        a = df[(df.g == g) & df.age.between(25, 34)]; s = df[(df.g == g) & df.age.between(25, 35) & df.single]
        out[g] = wmean(s.ba.values, s.commonweight.values)/wmean(a.ba.values, a.commonweight.values)
    return out
est = deg_ratio(young); reps = {k: [] for k in est}
for _ in range(B):
    r = deg_ratio(young.iloc[rng.integers(0, len(young), len(young))])
    for k in est: reps[k].append(r[k])
res["ba_single_vs_all_ces"] = {k: {"est": est[k], "lo": float(np.percentile(reps[k], 2.5)), "hi": float(np.percentile(reps[k], 97.5))} for k in est}

# The progressive model's functional form. The page sets progressive = county-summed Harris share + 20 points
# (women; men 10 points less), capped at 90%. Fit logit(P(Harris vote)) = a + b * logit(Harris share of the
# respondent's county) among young single voters. Party ID with independents at one half can't be used here:
# it flattens the slope by construction (independents count .5 in every county), even for all adults.
# Calibration: the same fit among all adult voters should give a slope near 1 if CES geography is faithful;
# its shortfall is reported so the young-single slope can be read against it.
cv = pd.read_csv(os.path.join(DATA, "county24.csv"), dtype={"county_fips": str})
cv["fips"] = cv.county_fips.astype(int); cv["harris"] = cv.votes_dem/cv.total_votes
lg = lambda x: np.log(x/(1-x))
d2 = d.merge(cv[["fips", "harris"]], left_on="countyfips", right_on="fips", how="left")
def glm(s, y, w):
    s = s[s.harris.notna() & s[y].notna() & (s[w] > 0)]
    f = sm.GLM(s[y], sm.add_constant(lg(s.harris.clip(.02, .98))), family=sm.families.Binomial(), var_weights=s[w]).fit(cov_type="HC1")
    return {"a": float(f.params.values[0]), "b": float(f.params.values[1]), "se_a": float(f.bse.values[0]), "se_b": float(f.bse.values[1]), "n": int(len(s))}
form = {"calib_all_adults": glm(d2, "prog_vote", "commonpostweight")}
ys2 = d2[d2.age.between(25, 35) & d2.single]
for g in ["w", "m"]:
    s = ys2[ys2.g == g]
    form[g] = glm(s, "prog_vote", "commonpostweight")
    form[g]["ba"] = glm(s[s.ba == 1], "prog_vote", "commonpostweight")
    form[g]["pid_half"] = glm(s, "prog_pid", "commonweight")
    a, b = form[g]["a"], form[g]["b"]
    form[g]["grid"] = [{"harris": round(float(h), 2), "fitted": float(1/(1+np.exp(-(a + b*lg(h))))),
                        "page": float(min(.9, h + .2 + (0 if g == "w" else -.10)))} for h in np.arange(.2, .81, .1)]
res["prog_form"] = form

json.dump(res, open(os.path.join(OUT, "ces_estimates.json"), "w"), indent=1, default=float)
# A short readout
for g in ["w", "m"]:
    r = res["by_gender"][g]; f = lambda k: f"{r[k]['est']:.3f} [{r[k]['lo']:.3f}, {r[k]['hi']:.3f}]"
    print(f"== {g}  n={res['n'][g]}")
    for k in ["prog_pid", "prog_pid|ba", "lift_ba_prog_pid", "liftcons_ba_prog_pid", "lift_ba_prog_ideo", "lift_ba_prog_vote",
              "sec_none", "sec_broad", "lift_ba_sec_none", "lift_ba_sec_broad", "christian", "lift_ba_christian",
              "lift_prog_sec_none_prog_pid_all", "lift_prog_sec_none_prog_pid_ba", "lift_prog_sec_broad_prog_pid_all", "lift_prog_sec_broad_prog_pid_ba",
              "or_prog_sec_none_prog_pid_all", "or_prog_sec_broad_prog_pid_all", "or_prog_sec_none_prog_pid_ba",
              "lift_cons_christian_prog_pid_all", "lift_cons_christian_prog_pid_ba", "or_cons_christian_prog_pid_all",
              "open", "open|prog", "lift_open_prog", "lift_open_cons"]:
        print(f"  {k:40s} {f(k)}")
print("faith young/all:", {k: round(v['est'], 2) for k, v in res["faith_young_vs_all"].items() if "_" not in k or k == "sec_none"})
print("BA single/all (CES):", {k: round(v['est'], 3) for k, v in res["ba_single_vs_all_ces"].items()})
print("form calib (all adult voters):", {k: round(v, 3) for k, v in form["calib_all_adults"].items()})
for g in ["w", "m"]:
    print("form", g, {k: round(form[g][k], 3) for k in ["a", "b", "se_a", "se_b", "n"]}, "BA:", {k: round(form[g]["ba"][k], 3) for k in ["a", "b", "se_b"]},
          [(x["harris"], round(x["fitted"], 3), round(x["page"], 3)) for x in form[g]["grid"]])
