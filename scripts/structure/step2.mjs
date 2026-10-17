// Step 2: replace the page's biggest independence assumption, how politics and faith combine (and how a degree
// shifts them), with estimates from the 2024 CES. Writes a patched copy of the page to out/index.step2.html and
// the proposed change to scripts/structure/step2-values-joint.patch, then measures what it does.
//
// Checks: the patched page must equal the harness override with the same constants on every metro, and no metro
// may count more people as fitting both politics and faith than fit either one.
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { open } from "./harness.mjs";

const here = path.dirname(fileURLToPath(import.meta.url)), OUT = path.join(here, "out"), ROOT = path.resolve(here, "../..");
const J = f => JSON.parse(fs.readFileSync(path.join(OUT, f)));
const ces = J("ces_estimates.json"), draws = J("ces_draws.json");
const r2 = x => Math.round(x*100)/100, odds = p => p/(1 - p);
const C = (g, k) => ces.by_gender[g][k].est;
const byG = f => ({w: f("w"), m: f("m")});
// The constants as they would appear in the page, rounded to two decimals
const PSI = {prog: {all: byG(g => r2(C(g, "or_prog_sec_none_prog_pid_all"))), ba: byG(g => r2(C(g, "or_prog_sec_none_prog_pid_ba")))},
             cons: {all: byG(g => r2(C(g, "or_cons_christian_prog_pid_all"))), ba: byG(g => r2(C(g, "or_cons_christian_prog_pid_ba")))}};
const DEG_OR = Object.fromEntries([["prog", "prog_pid"], ["sec", "sec_none"], ["christian", "christian"]].map(([k, c]) => [k, byG(g => r2(odds(C(g, c + "|ba"))/odds(C(g, c))))]));
const sdLog = arr => { const l = arr.map(Math.log), mu = l.reduce((a, b) => a + b)/l.length; return Math.sqrt(l.reduce((a, b) => a + (b - mu)**2, 0)/(l.length - 1)); };
const avg = (...x) => x.reduce((a, b) => a + b)/x.length;
const UNC_PSI = {all: r2(avg(...["w", "m"].flatMap(g => ["or_prog_sec_none_prog_pid_all", "or_cons_christian_prog_pid_all"].map(k => sdLog(draws[g][k]))))),
                 ba: r2(avg(...["w", "m"].flatMap(g => ["or_prog_sec_none_prog_pid_ba", "or_cons_christian_prog_pid_ba"].map(k => sdLog(draws[g][k])))))};
const degDraws = (g, c) => draws[g][c + "|ba"].map((pb, i) => odds(pb)/odds(draws[g][c][i]));
const UNC_DEG = r2(avg(...["w", "m"].flatMap(g => ["prog_pid", "sec_none", "christian"].map(c => sdLog(degDraws(g, c))))));
const js = o => JSON.stringify(o).replace(/"(\w+)":/g, "$1:").replace(/,/g, ", ").replace(/0\.(\d)/g, ".$1");

// ---- The proposed change, as exact replacements in atlas/index.html ----
const f2 = x => x.toFixed(1);
const EDITS = [
  [`const CORR = 1.5;  // filters overlap: progressives skew secular and conservatives skew Christian, so a matching pair is more common than the product`,
`// Matching politics and faith go together more often than chance: progressives skew secular and conservatives
// Christian. The share who fit both comes from the odds ratio between the two among single 25-to-35-year-olds in
// the 2024 Cooperative Election Study (a Plackett joint), so it can never exceed either share on its own.
// Degree holders are more progressive, more often Christian and less often unaffiliated, and their politics and
// faith line up more tightly, so the degree filter shifts both shares and uses the degree holders' odds ratio.
// Nonbinary people get the average of women and men.
const PSI = ${js(PSI)};
const DEG_OR = ${js(DEG_OR)};
const byGender = (o, g) => o[g] ?? (o.w + o.m)/2;
const shiftOdds = (p, k) => p <= 0 || p >= 1 ? p : p*k/(1 - p + p*k);
const plackett = (p, q, psi) => { if (Math.abs(psi - 1) < 1e-9) return p*q; const S = 1 + (psi - 1)*(p + q);
  return (S - Math.sqrt(S*S - 4*psi*(psi - 1)*p*q))/(2*(psi - 1)); };
// Self-check: the joint gives back its odds ratio and stays inside both shares
[[.7, .4, 4.76], [.9, .5, 1.82], [.3, .9, 5]].forEach(([p, q, psi]) => { const j = plackett(p, q, psi);
  console.assert(Math.abs(j*(1 - p - q + j)/((p - j)*(q - j)) - psi) < 1e-6 && j <= Math.min(p, q), "plackett", p, q, psi); });`],
  [`// Share of single people of gender g in metro m who fit your politics and faith, 0 to 1, before the overlap boost`,
   `// Share of single people of gender g in metro m who fit your politics and faith, 0 to 1`],
  [`const VQ = {off:.2, sec:.40, fr:1, corr:CORR};
function valRaw(m, g, P, Q = VQ){
  const [ps, ss] = VAL_SHIFT[g], F = m.faith;
  const prog = Math.min(.9, m.dem/100 + Q.off + ps);
  const pol = P.pol === "prog" ? prog : P.pol === "cons" ? 1 - prog : 1;
  const rel = P.faith === "secular" ? Math.min(.8, Math.max(.05, Q.sec + (m.none - 23.1)/100 + .3*(48.6 - m.adh)/100 + ss))
    : P.faith === "any" ? 1 : !F ? 0 : Q.fr*(P.faith === "pagan" ? PAGAN*F[8]/OTHER_AVG : F[FAITH_COL[P.faith]]/100);
  return P.faith === "secular" ? Math.max(.02, pol*rel) : pol*rel;
}`,
`const VQ = {off:.2, sec:.40, fr:1, psi:1, dp:1, ds:1};
function valRaw(m, g, P, Q = VQ){
  const [ps, ss] = VAL_SHIFT[g], F = m.faith, deg = P.degOnly;
  let prog = Math.min(.9, m.dem/100 + Q.off + ps);
  let sec = Math.min(.8, Math.max(.05, Q.sec + (m.none - 23.1)/100 + .3*(48.6 - m.adh)/100 + ss));
  let fs = !F ? 0 : Q.fr*(P.faith === "pagan" ? PAGAN*F[8]/OTHER_AVG : F[FAITH_COL[P.faith]]/100);
  if (deg){ prog = shiftOdds(prog, byGender(DEG_OR.prog, g)*Q.dp); sec = shiftOdds(sec, byGender(DEG_OR.sec, g)*Q.ds);
    if (CHRISTIAN.includes(P.faith)) fs = shiftOdds(fs, byGender(DEG_OR.christian, g)*Q.ds); }
  const pol = P.pol === "prog" ? prog : P.pol === "cons" ? 1 - prog : 1;
  const rel = P.faith === "secular" ? sec : P.faith === "any" ? 1 : fs;
  if (aligned(P)) return plackett(pol, rel, byGender(PSI[P.pol][deg ? "ba" : "all"], g)*Q.psi);
  return P.faith === "secular" ? Math.max(.02, pol*rel) : pol*rel;
}`],
  [`const valFit = (m, g, P, Q = VQ) => Math.min(1, valRaw(m, g, P, Q)*(aligned(P) ? Q.corr : 1));`,
   `const valFit = (m, g, P, Q = VQ) => Math.min(1, valRaw(m, g, P, Q));`],
  [`off:.07, sec:.05, corr:.15, pagan:.35,`, `off:.07, sec:.05, psi:${js(UNC_PSI)}, degOR:${js(UNC_DEG)}, pagan:.35,`],
  [`Q.corr = CORR*LN(UNC.corr, z(3));`,
   `Q.psi = LN(UNC.psi[s.deg ? "ba" : "all"], z(3));
    Q.dp = s.deg ? LN(UNC.degOR, z(30)) : 1; Q.ds = s.deg ? LN(UNC.degOR, z(31)) : 1;`],
  [`±7 points on the progressive offset, ±5 points on the secular-leaning base and ±15% on the overlap boost, since those are modeling choices;`,
   `±7 points on the progressive offset and ±5 points on the secular-leaning base, since those are modeling choices; ±${Math.round(UNC_PSI.all*100)}% on the odds ratio between politics and faith (±${Math.round(UNC_PSI.ba*100)}% among degree holders) and ±${Math.round(UNC_DEG*100)}% on how a degree shifts politics and faith, from bootstrap resamples of the survey;`],
  [`The 1.5 overlap boost applies only to matching pairs, progressive with secular-leaning and conservative with a Christian faith, because those go together more often than chance.</p>`,
   `Matching pairs, progressive with secular-leaning and conservative with a Christian faith, go together more often than chance. The share who fit both comes from the odds ratio between politics and faith among single 25 to 35 year olds in the <a href="https://doi.org/10.7910/DVN/X11EP6">2024 Cooperative Election Study</a>: ${f2(PSI.prog.all.w)} for women and ${f2(PSI.prog.all.m)} for men for progressive with no religion, and ${f2(PSI.cons.all.w)} and ${f2(PSI.cons.all.m)} for conservative with a Christian faith. Worked out this way (a Plackett joint), it can never exceed either share on its own. Degree holders are more progressive (odds ${f2(DEG_OR.prog.w)} to ${f2(DEG_OR.prog.m)} times higher), more often Christian (${f2(DEG_OR.christian.w)} to ${f2(DEG_OR.christian.m)} times) and less often unaffiliated, and their politics and faith line up more tightly (odds ratios of ${f2(Math.min(PSI.prog.ba.m, PSI.cons.ba.m))} to ${f2(Math.max(PSI.prog.ba.w, PSI.cons.ba.w))}), so the degree filter uses those figures. Progressive counts Democrats and leaners, with independents as half.</p>`],
];
let html = fs.readFileSync(path.join(ROOT, "atlas/index.html"), "utf8");
for (const [a, b] of EDITS){ if (html.split(a).length !== 2) throw new Error("edit not unique: " + a.slice(0, 70)); html = html.replace(a, () => b); }
if (/\bCORR\b|Q\.corr|UNC\.corr/.test(html)) throw new Error("leftover CORR reference");
const patched = path.join(OUT, "index.step2.html");
fs.writeFileSync(patched, html);
let diff = "";
try { execSync(`git diff --no-index --no-color -U2 atlas/index.html ${path.relative(ROOT, patched)}`, {cwd: ROOT}); } catch (e) { diff = e.stdout.toString(); }
fs.writeFileSync(path.join(here, "step2-values-joint.patch"), diff.replaceAll(path.relative(ROOT, patched), "atlas/index.html"));

// ---- Measure ----
const PROFILES = {
  "man, women, prog+secular (default)": {},
  "woman, men, prog+secular": {you: "w", seek: ["m"]},
  "man, women, cons+Christian": {pol: "cons", faith: "christian"},
  "woman, men, cons+Christian": {you: "w", seek: ["m"], pol: "cons", faith: "christian"},
  "man, women, prog+secular, no degree filter": {degOnly: false},
  "woman, men, cons+Christian, no degree filter": {you: "w", seek: ["m"], pol: "cons", faith: "christian", degOnly: false},
};
const hb = await open(), hp = await open(patched);
const meta = hb.meta, N = meta.length, mem = meta.findIndex(m => m.short === "Memphis");
const scen = (psi, dor) => ({joint: {mode: "plackett", aligned: {prog_secular: psi.prog, cons_christian: psi.cons}}, degOR: dor});
const pop = meta.map(m => m.pop), popW = (a, b) => a.reduce((s, x, i) => s + pop[i]*x, 0)/b.reduce((s, x, i) => s + pop[i]*x, 0);
const q = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.floor(p*(s.length - 1))]; };
const rankOf = v => { const idx = v.map((x, i) => [x, i]).sort((a, b) => b[0] - a[0]), r = new Array(v.length); idx.forEach(([, i], k) => r[i] = k + 1); return r; };
const spearman = (a, b) => { const ra = rankOf(a), rb = rankOf(b); let d2 = 0; for (let i = 0; i < N; i++) d2 += (ra[i] - rb[i])**2; return 1 - 6*d2/(N*(N*N - 1)); };

const results = {constants: {PSI, DEG_OR, UNC_PSI, UNC_DEG}, profiles: {}};
for (const [pl, prof] of Object.entries(PROFILES)){
  const b = await hb.run(prof, null), p = await hp.run(prof, null), o = await hb.run(prof, scen(PSI, DEG_OR), {iv: false});
  const base = b.rows.map(r => r[0]), neu = p.rows.map(r => r[0]);
  neu.forEach((v, i) => { if (Math.abs(v - o.rows[i][0]) > 1e-9*Math.max(1, v)) throw new Error(`patched page and override differ: ${pl}, ${meta[i].name}: ${v} vs ${o.rows[i][0]}`); });
  // Parameter uncertainty: rerun with each of the 500 joint bootstrap draws of the CES estimates
  const nd = draws.w.prog_pid.length, mr = [], pw = [];
  for (let d = 0; d < nd; d++){
    const D = (g, k) => draws[g][k][d];
    const psi = {prog: {all: byG(g => D(g, "or_prog_sec_none_prog_pid_all")), ba: byG(g => D(g, "or_prog_sec_none_prog_pid_ba"))},
                 cons: {all: byG(g => D(g, "or_cons_christian_prog_pid_all")), ba: byG(g => D(g, "or_cons_christian_prog_pid_ba"))}};
    const dor = Object.fromEntries([["prog", "prog_pid"], ["sec", "sec_none"], ["christian", "christian"]].map(([k, c]) => [k, byG(g => odds(D(g, c + "|ba"))/odds(D(g, c)))]));
    const r = (await hb.run(prof, scen(psi, dor), {iv: false})).rows.map(x => x[0]);
    mr.push(r[mem]/base[mem]); pw.push(popW(r, base));
  }
  const ratio = neu.map((v, i) => v/base[i]);
  const big = meta.map((m, i) => ({m: m.short, pop: m.pop, base: base[i], neu: neu[i], r: ratio[i]})).filter(x => x.pop >= 1e6).sort((a, b) => a.r - b.r);
  const rb = rankOf(base), rn = rankOf(neu);
  results.profiles[pl] = {
    memphis: {old: base[mem], neu: neu[mem], old_range: b.iv, new_range: p.iv, ratio_ci: [q(mr, .025), q(mr, .975)]},
    pop_weighted: {est: popW(neu, base), ci: [q(pw, .025), q(pw, .975)]},
    metro_ratio: {min: Math.min(...ratio), p10: q(ratio, .1), median: q(ratio, .5), p90: q(ratio, .9), max: Math.max(...ratio)},
    spearman: spearman(base, neu), mean_abs_rank_change: rb.reduce((s, x, i) => s + Math.abs(x - rn[i]), 0)/N,
    top10_old: rb.map((x, i) => [x, meta[i].short]).sort((a, b) => a[0] - b[0]).slice(0, 10).map(x => x[1]),
    top10_new: rn.map((x, i) => [x, meta[i].short]).sort((a, b) => a[0] - b[0]).slice(0, 10).map(x => x[1]),
    biggest_drops_1m: big.slice(0, 5).map(x => [x.m, Math.round(x.base), Math.round(x.neu), +x.r.toFixed(2)]),
    smallest_drops_1m: big.slice(-5).map(x => [x.m, Math.round(x.base), Math.round(x.neu), +x.r.toFixed(2)]),
  };
  const R = results.profiles[pl], f = x => x.toFixed(2);
  console.log(`\n== ${pl}\n  Memphis ${Math.round(base[mem])} (80%: ${Math.round(b.iv.lo)}-${Math.round(b.iv.hi)})  ->  ${Math.round(neu[mem])} (80%: ${Math.round(p.iv.lo)}-${Math.round(p.iv.hi)}),  x${f(neu[mem]/base[mem])} [95% from CES: ${f(R.memphis.ratio_ci[0])}-${f(R.memphis.ratio_ci[1])}]`);
  console.log(`  population-weighted x${f(R.pop_weighted.est)} [${f(R.pop_weighted.ci[0])}-${f(R.pop_weighted.ci[1])}]; metros: min ${f(R.metro_ratio.min)}, p10 ${f(R.metro_ratio.p10)}, median ${f(R.metro_ratio.median)}, p90 ${f(R.metro_ratio.p90)}, max ${f(R.metro_ratio.max)}`);
  console.log(`  rank rho ${R.spearman.toFixed(3)}, mean |rank change| ${R.mean_abs_rank_change.toFixed(1)}`);
  console.log(`  top 10 before: ${R.top10_old.join(", ")}\n  top 10 after:  ${R.top10_new.join(", ")}`);
  console.log(`  1M+ metros, biggest drops: ${JSON.stringify(R.biggest_drops_1m)}\n  1M+ metros, smallest drops: ${JSON.stringify(R.smallest_drops_1m)}`);
}
// No metro may count more people as fitting both than fit either
const feas = await hp.evaluate(() => { let bad = 0; for (const P0 of [{pol: "prog", faith: "secular"}, {pol: "cons", faith: "christian"}]) for (const degOnly of [true, false]) for (const g of ["w", "m", "n"]) M.forEach(m => {
  const P = {...P0, degOnly}, j = valRaw(m, g, P), a = valRaw(m, g, {...P, faith: "any"}), r = valRaw(m, g, {...P, pol: "any"}); if (j > Math.min(a, r) + 1e-12) bad++; }); return bad; });
if (feas) throw new Error(`${feas} metro/gender cases exceed the bound`);
results.feasibility_violations = feas;
fs.writeFileSync(path.join(OUT, "step2.json"), JSON.stringify(results, null, 1));
console.log("\nconstants", JSON.stringify(results.constants), "\nfeasibility violations after the change:", feas);
await hb.close(); await hp.close();
