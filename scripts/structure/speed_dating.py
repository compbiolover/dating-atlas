"""Is mutual attraction the product of the two yes rates? Columbia speed-dating experiment (Fisman, Iyengar,
Kamenica and Simonson 2006), 21 waves, 551 people, 8,378 date records.

The page counts a click as (share of them you'd say yes to) x (share of them who'd say yes to you), which
assumes your yes and theirs are independent. For one person i dating partners j, the relevant lift is
    L_i = mean_j(yes_ij * yes_ji) / (mean_j(yes_ij) * mean_j(yes_ji)),
pooled across people as sum(matches)/sum(n_i * p_i * q_i). That removes differences between people in how
picky or popular they are, which a pooled product would mix in. Intervals bootstrap people, by wave.

Usage: python3 scripts/structure/speed_dating.py DATA_DIR   (DATA_DIR/speed.csv, "Speed Dating Data.csv" from
http://www.stat.columbia.edu/~gelman/arm/examples/speed.dating/)
"""
import json, os, sys
import numpy as np, pandas as pd

d = pd.read_csv(os.path.join(sys.argv[1], "speed.csv"), encoding="latin-1")
d = d.dropna(subset=["pid", "dec", "dec_o"])
rng = np.random.default_rng(20251017)

# Everything below is a ratio of per-person sums, so bootstrap on per-person totals
per = d.groupby("iid").agg(n=("dec", "size"), p=("dec", "mean"), q=("dec_o", "mean"), m=("match", "sum"),
                           gender=("gender", "first"), wave=("wave", "first"))
per["e"] = per.n*per.p*per.q                       # matches expected if your yes and theirs were independent
per["corr"] = d.groupby("iid").apply(lambda x: x.dec.corr(x.dec_o) if x.dec.std() > 0 and x.dec_o.std() > 0 else np.nan)
per["yes"], per["yes_o"] = per.n*per.p, per.n*per.q

def lifts(g):
    out = {}
    for lab, sub in [("all", g), ("women", g[g.gender == 0]), ("men", g[g.gender == 1])]:
        out[f"within_{lab}"] = sub.m.sum()/sub.e.sum()
        out[f"pooled_{lab}"] = (sub.m.sum()/sub.n.sum())/((sub.yes.sum()/sub.n.sum())*(sub.yes_o.sum()/sub.n.sum()))
    out["corr_within"] = g["corr"].mean()
    return out

est = lifts(per)
reps = {k: [] for k in est}
byw = [x for _, x in per.groupby("wave")]
for _ in range(2000):
    # Resample people within each wave
    r = lifts(pd.concat([x.iloc[rng.integers(0, len(x), len(x))] for x in byw]))
    for k in est: reps[k].append(r[k])
res = {k: {"est": float(est[k]), "lo": float(np.nanpercentile(reps[k], 2.5)), "hi": float(np.nanpercentile(reps[k], 97.5))} for k in est}
res["n_people"], res["n_dates"] = int(d.iid.nunique()), int(len(d))
os.makedirs(os.path.join(os.path.dirname(__file__), "out"), exist_ok=True)
json.dump(res, open(os.path.join(os.path.dirname(__file__), "out", "speed_dating.json"), "w"), indent=1)
for k, v in res.items(): print(k, v)
