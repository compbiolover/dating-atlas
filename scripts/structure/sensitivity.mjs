// Step 1: how much does the number move when each structural assumption is replaced by an alternative
// grounded in data? Reads the estimates in scripts/structure/out/ and writes out/sensitivity.json.
//
// Each alternative changes one thing about how the funnel is built and is run at its point estimate and at
// both ends of its 95% interval, for six searches, across all 387 metros. "All" combines every alternative.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { open } from "./harness.mjs";

const here = path.dirname(fileURLToPath(import.meta.url)), OUT = path.join(here, "out");
const J = f => JSON.parse(fs.readFileSync(path.join(OUT, f)));
const ces = J("ces_estimates.json"), pums = J("pums_degree.json"), sd = J("speed_dating.json");
const C = (g, k) => ces.by_gender[g][k];
const odds = p => p/(1 - p);
// Odds among degree holders over odds among all young singles, at the estimate or an interval end of the lift
const degOR = (g, k, end = "est") => { const p = C(g, k).est, pb = p*C(g, "lift_ba_" + k)[end]; return odds(pb)/odds(p); };
const byG = f => ({w: f("w"), m: f("m")});

// Profiles: the default search, its mirror, the opposite quick pick for both, no degree filter, and no values filter
const PROFILES = {
  "man, women, prog+secular (default)": {},
  "woman, men, prog+secular": {you: "w", seek: ["m"]},
  "man, women, cons+Christian": {pol: "cons", faith: "christian"},
  "woman, men, cons+Christian": {you: "w", seek: ["m"], pol: "cons", faith: "christian"},
  "man, women, prog+secular, no degree filter": {degOnly: false},
  "man, women, any politics/faith": {pol: "any", faith: "any"},
  // Older search: CES parameters are estimated at 25-35, so read this row's CES-based alternatives loosely
  "man 45, women 40-50, prog+secular": {age: 45, ageMin: 40, ageMax: 50, bands: ["35-44", "45-54"]},
};

const h = await open();
const meta = h.meta, N = meta.length, mem = meta.findIndex(m => m.short === "Memphis");

// Progressive model fitted in CES: logit P(Harris vote | young single, gender) on logit(county Harris share), slope
// divided by the all-adult calibration slope (CES flattens geography by that much). "Shape only" then rescales its
// odds so its population-weighted mean across metros equals the page's, isolating the slope from the level.
const calib = ces.prog_form.calib_all_adults.b;
const form = byG(g => ({a: ces.prog_form[g].a, b: ces.prog_form[g].b/calib}));
const il = x => 1/(1 + Math.exp(-x)), lg = p => Math.log(p/(1 - p));
const pageProg = (m, g) => Math.min(.9, m.dem/100 + .2 + (g === "m" ? -.10 : 0));
const fitProg = (m, g, k = 1) => il(lg(il(form[g].a + form[g].b*lg(Math.min(.98, Math.max(.02, m.dem/100))))) + Math.log(k));
const popMean = f => meta.reduce((s, m) => s + m.pop*f(m), 0)/meta.reduce((s, m) => s + m.pop, 0);
const shape = byG(g => { const target = popMean(m => pageProg(m, g)); let lo = .01, hi = 100;
  for (let i = 0; i < 80; i++){ const k = Math.sqrt(lo*hi); popMean(m => fitProg(m, g, k)) < target ? lo = k : hi = k; } return Math.sqrt(lo*hi); });

const psi = (lab, sub, sec, end) => byG(g => C(g, `or_${lab}_${sec}_prog_pid_${sub}`)[end]);
const joint = (sec = "sec_none", end = "est") => ({mode: "plackett", aligned: {
  prog_secular: {all: psi("prog", "all", sec, end), ba: psi("prog", "ba", sec, end)},
  cons_christian: {all: psi("cons", "all", "christian", end), ba: psi("cons", "ba", "christian", end)}}});
const liftJ = (end = "est") => ({mode: "lift", aligned: {
  prog_secular: {all: byG(g => C(g, "lift_prog_sec_none_prog_pid_all")[end]), ba: byG(g => C(g, "lift_prog_sec_none_prog_pid_ba")[end])},
  cons_christian: {all: byG(g => C(g, "lift_cons_christian_prog_pid_all")[end]), ba: byG(g => C(g, "lift_cons_christian_prog_pid_ba")[end])}}});
const dOR = end => ({prog: byG(g => degOR(g, "prog_pid", end)), sec: byG(g => degOR(g, "sec_none", end)), christian: byG(g => degOR(g, "christian", end))});
const fy = end => Object.fromEntries(["christian","catholic","protestant","lds","jewish","muslim","hindu","buddhist"].map(k => [k, ces.faith_young_vs_all[k][end]]));
const open_ = end => byG(g => ({prog: C(g, "lift_open_prog")[end], cons: C(g, "lift_open_cons")[end]}));
// PUMS corrections for the search's age range: the band average over the bands it spans (default 25-35)
const ci = (o, z) => o.est + z*1.96*o.se;
let BANDS = ["25-35"];
const P = (g, k, z) => BANDS.reduce((t, b) => t + ci(pums.bands[`${g} ${b}`][k], z), 0)/BANDS.length;
const degPool = z => byG(g => P(g, "ratio_pool_vs_page", z));
const cohab = z => byG(g => P(g, "cohab_share", z));
const ends = {est: "est", lo: "lo", hi: "hi"}, zs = {est: 0, lo: -1, hi: 1};

// Each alternative as a function of "est", "lo" or "hi"
const ALT = {
  "Politics x faith as a Plackett joint (CES, no religion)": e => ({joint: joint("sec_none", e)}),
  "Politics x faith as a Plackett joint (CES, broad secular)": e => ({joint: joint("sec_broad", e)}),
  "Politics x faith as a fixed lift (CES)": e => ({joint: liftJ(e)}),
  "Politics x faith independent (no boost)": () => ({joint: {mode: "lift", aligned: {prog_secular: {all: 1, ba: 1}, cons_christian: {all: 1, ba: 1}}}}),
  "Degree x politics/faith (CES odds ratios)": e => ({degOR: dOR(e)}),
  "Progressive model fitted to CES (level and slope)": () => ({progForm: form}),
  "Progressive model fitted to CES (slope only)": () => ({progForm: form, progShape: shape}),
  "Faith shares of young singles, not all adults (CES)": e => ({faithYoung: fy(e)}),
  "Openness x politics (CES)": e => ({openPol: open_(e)}),
  "Degree share of singles, not everyone 25-34 (PUMS)": e => ({degPool: degPool(zs[e])}),
  "Cohabiting share by sex and age (PUMS)": e => ({cohab: cohab(zs[e])}),
  "Mutual attraction reciprocity (speed dating)": e => ({recip: sd.within_all[e]}),
};
const ALL = e => Object.assign({}, ...["Politics x faith as a Plackett joint (CES, no religion)", "Degree x politics/faith (CES odds ratios)",
  "Progressive model fitted to CES (level and slope)", "Faith shares of young singles, not all adults (CES)", "Openness x politics (CES)",
  "Degree share of singles, not everyone 25-34 (PUMS)", "Cohabiting share by sex and age (PUMS)", "Mutual attraction reciprocity (speed dating)"].map(k => ALT[k](e)));

// Summaries of one alternative against the baseline across metros
// Input-level check, kept out of "All": the page's secular-leaning share sits below CES's no-religion share among young
// singles in the same metros (ces_metro_form.json); shift it up by the gap and combine with everything else
const mf = J("ces_metro_form.json"), secGap = byG(g => mf[g].mean_none - mf[g].mean_page_sec);
const ALL_SEC = e => ({...ALL(e), secShift: secGap});

const rankOf = v => { const idx = v.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]), r = new Array(v.length); idx.forEach(([, i], k) => r[i] = k + 1); return r; };
const spearman = (a, b) => { const ra = rankOf(a), rb = rankOf(b), n = a.length; let d2 = 0; for (let i = 0; i < n; i++) d2 += (ra[i] - rb[i])**2; return 1 - 6*d2/(n*(n*n - 1)); };
const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(p*(s.length - 1))]; };
function summarize(base, alt){
  const r = base.map((b, i) => alt[i]/b).filter(x => isFinite(x));
  const wpop = meta.reduce((s, m, i) => s + m.pop*alt[i], 0)/meta.reduce((s, m, i) => s + m.pop*base[i], 0);
  const rb = rankOf(base), ra = rankOf(alt), top = new Set(rb.map((x, i) => x <= 25 ? i : -1).filter(i => i >= 0));
  return {memphis: alt[mem]/base[mem], pop_weighted: wpop, median: q(r, .5), p10: q(r, .1), p90: q(r, .9),
    spearman: spearman(base, alt), mean_abs_rank_change: rb.reduce((s, x, i) => s + Math.abs(x - ra[i]), 0)/N,
    top25_kept: ra.filter((x, i) => top.has(i) && x <= 25).length};
}

const results = {params: {form, shape, calib, degOR: dOR("est"), joint: joint("sec_none", "est"), degPool: degPool(0), cohab: cohab(0), recip: sd.within_all.est, secGap}, profiles: {}};
console.log("params", JSON.stringify(results.params));
for (const [pl, prof0] of Object.entries(PROFILES)){
  const {bands, ...prof} = prof0; BANDS = bands || ["25-35"];
  const b = await h.run(prof, null), base = b.rows.map(r => r[0]);
  const out = {baseline_memphis: base[mem], interval_memphis: b.iv, input_band_ratio: b.iv ? [b.iv.lo/base[mem], b.iv.hi/base[mem]] : null, alts: {}};
  for (const [al, fn] of Object.entries({...ALT, "All data-grounded alternatives combined": ALL, "  ...plus secular level matched to CES (input check)": ALL_SEC})){
    const o = {};
    for (const e of Object.keys(ends)){ const r = await h.run(prof, fn(e)); o[e] = summarize(base, r.rows.map(x => x[0])); }
    out.alts[al] = o;
  }
  results.profiles[pl] = out;
  console.log(`\n== ${pl}   Memphis ${base[mem].toFixed(0)}, input 80% band x${out.input_band_ratio?.map(x => x.toFixed(2)).join(" to x")}`);
  console.log("alternative".padEnd(58), "Memphis  pop-wtd  median [p10,p90]      rank rho  |dRank| top25   (Memphis lo..hi)");
  for (const [al, o] of Object.entries(out.alts)){ const s = o.est;
    console.log(al.padEnd(58), s.memphis.toFixed(2).padStart(6), s.pop_weighted.toFixed(2).padStart(8), `${s.median.toFixed(2)} [${s.p10.toFixed(2)},${s.p90.toFixed(2)}]`.padStart(20),
      s.spearman.toFixed(3).padStart(9), s.mean_abs_rank_change.toFixed(1).padStart(7), String(s.top25_kept).padStart(5), `   (${o.lo.memphis.toFixed(2)}..${o.hi.memphis.toFixed(2)})`); }
}
fs.writeFileSync(path.join(OUT, "sensitivity.json"), JSON.stringify(results, null, 1));
await h.close();
