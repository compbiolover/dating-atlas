// Runs the page's own funnel code for every metro, with structural assumptions switched on or off.
//
// The page is loaded in headless Chromium so the baseline is exactly what visitors see. One override layer is
// injected: valRaw (politics and faith), base (cohabiting cut) and the degree shares read a plain-data scenario
// object, window.__A. With no scenario every function falls through to the page's original, and the harness
// asserts that the default search in Memphis still gives the page's 216.
//
// Usage: import { open } from "./harness.mjs"; const h = await open(); await h.run(profile, scenario); await h.close();
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const PAGE = "file://" + path.resolve(here, "../../atlas/index.html");
const { chromium } = await import(path.join(execSync("npm root -g").toString().trim(), "playwright/index.mjs"));

// Injected into the page. Scenario fields (all optional):
//   progForm   {w:{a,b}, m:{a,b}}  progressive = invlogit(a + b*logit(metro Harris share)) instead of Harris + 20 points
//   progShape  {w:k, m:k}          after progForm, scale its odds by k so its atlas-wide mean matches the page's (shape only)
//   degOR      {prog:{w,m}, sec:{w,m}, christian:{w,m}}  when the degree filter is on, shift each share's odds by this
//                                   ratio (odds among degree holders over odds among all young singles)
//   joint      {mode:"page"|"lift"|"plackett", aligned:{prog_secular:{all,ba}, cons_christian:{all,ba}}}
//                                   how matching politics and faith combine: the page's fixed x1.5 boost, a fixed lift,
//                                   or a Plackett joint from an odds ratio (which can never exceed either share);
//                                   each parameter is a number or {w, m}
//   faithYoung {christian:r, ...}   scale a faith's share of all adults to young singles
//   openPol    {w:{prog,cons}, m:{prog,cons}}  openness to your gender among progressives (conservatives) over everyone
//   degPool    {w:r, m:r}          degree share of singles not living with a partner over B15001's share for all 25-34
//   cohab      {w:share, m:share}  share of B12002 singles living with a partner (page: 15% for everyone)
//   recip      L                   mutual-attraction lift over his-rate x her-rate
//   secShift   {w:d, m:d}          add d to the secular-leaning share (an input-level check, not structure)
//   secScale   {w:k, m:k}          multiply the secular-leaning share by k (how it falls with age)
const INJECT = () => {
  const valRaw0 = valRaw, base0 = base;
  const lg = p => Math.log(p/(1 - p)), il = x => 1/(1 + Math.exp(-x));
  const orShift = (p, or) => p <= 0 ? 0 : p >= 1 ? 1 : il(lg(p) + Math.log(or));
  const plackett = (p, q, psi) => { if (Math.abs(psi - 1) < 1e-9) return p*q; const S = 1 + (psi - 1)*(p + q);
    return (S - Math.sqrt(S*S - 4*psi*(psi - 1)*p*q))/(2*(psi - 1)); };
  window.__plackett = plackett;
  // Self-check: the joint reproduces its odds ratio and stays inside both shares
  [[.7, .4, 4.76], [.9, .5, 1.82], [.3, .9, 5], [.5, .5, 1]].forEach(([p, q, psi]) => { const j = plackett(p, q, psi);
    console.assert(Math.abs(j*(1 - p - q + j)/((p - j)*(q - j)) - psi) < 1e-6 && j <= Math.min(p, q) && j >= Math.max(0, p + q - 1), "plackett", p, q, psi, j); });
  window.__A = null;
  window.__deg = false;
  // Same structure as the page's valRaw, with each assumption behind a scenario switch
  valRaw = function(m, g, P, Q = VQ){
    const A = window.__A;
    if (!A) return valRaw0(m, g, P, Q);
    // Nonbinary people get the average of the women's and men's parameters, as elsewhere on the page
    const pick = o => o[g] ?? (o.w + o.m)/2;
    const [ps, ss] = VAL_SHIFT[g], F = m.faith, D = window.__deg;
    let prog = Math.min(.9, m.dem/100 + Q.off + ps);
    if (A.progForm && g !== "n"){ const f = A.progForm[g]; prog = il(f.a + f.b*lg(Math.min(.98, Math.max(.02, m.dem/100))));
      if (A.progShape) prog = orShift(prog, A.progShape[g]); }
    let sec = Math.min(.8, Math.max(.05, Q.sec + (m.none - 23.1)/100 + .3*(48.6 - m.adh)/100 + ss + (A.secShift ? pick(A.secShift) : 0)));
    if (A.secScale) sec *= pick(A.secScale);
    let fs = P.faith === "pagan" ? PAGAN*(F ? F[8] : 0)/OTHER_AVG : F && P.faith in FAITH_COL ? F[FAITH_COL[P.faith]]/100 : 0;
    fs *= Q.fr;
    if (A.faithYoung && A.faithYoung[P.faith]) fs = Math.min(.95, fs*A.faithYoung[P.faith]);
    if (D && A.degOR){ prog = orShift(prog, pick(A.degOR.prog)); sec = orShift(sec, pick(A.degOR.sec));
      if (CHRISTIAN.includes(P.faith)) fs = orShift(fs, pick(A.degOR.christian)); }
    const pol = P.pol === "prog" ? prog : P.pol === "cons" ? 1 - prog : 1;
    const rel = P.faith === "secular" ? sec : P.faith === "any" ? 1 : !F ? 0 : fs;
    let v;
    const al = aligned(P), key = P.pol === "prog" ? "prog_secular" : "cons_christian";
    const J = A.joint || {mode: "page"};
    const par = al && J.aligned ? J.aligned[key][D ? "ba" : "all"] : 1;
    let k = typeof par === "number" ? par : pick(par);
    // Inside the page's range simulation Q is a draw: reuse its overlap-boost draw as a draw of this parameter
    // (same standard normal, spread A.jointSD on the log scale), so the range carries this uncertainty instead
    if (al && J.mode !== "page" && Q !== VQ && A.jointSD) k *= Math.exp(A.jointSD*(Math.log(Q.corr/CORR) + UNC.corr**2/2)/UNC.corr - A.jointSD**2/2);
    if (al && J.mode === "plackett") v = plackett(pol, rel, k);
    else if (al && J.mode === "lift") v = Math.min(pol, rel, pol*rel*k);
    else v = P.faith === "secular" ? Math.max(.02, pol*rel) : pol*rel;
    if (A.openPol && g !== "n" && P.pol !== "any" && ((g === "w" && P.you === "m") || (g === "m" && P.you === "w"))) v *= A.openPol[g][P.pol];
    // valFit multiplies aligned pairs by Q.corr; a replacement joint already includes the dependence, so undo it
    return al && J.mode !== "page" ? v/Q.corr : v;
  };
  base = function(m, g, s){
    const r = base0(m, g, s), A = window.__A;
    if (A && A.cohab && g !== "n" && m.acs) r.single *= (1 - A.cohab[g])/COHAB;
    return r;
  };
  // One funnel run for every metro. Returns [click, apps] per metro in M's order, plus the Memphis interval.
  window.__run = (prof, A, opt = {}) => {
    const P = {you: "m", seek: ["w"], age: 30, ht: null, edu: "ba", job: "job", kids: "any", openP: true, degOnly: true,
      pol: "prog", faith: "secular", diet: "any", ...prof};
    if (!P.ht) P.ht = heightFor(P.you);
    const D = clickDefaults(P);
    const s = {deg: P.degOnly, ageMin: prof.ageMin ?? 25, ageMax: prof.ageMax ?? 35, his: Math.round(D.his), her: Math.round(D.her), apps: Math.round(D.apps)};
    window.__A = A && Object.keys(A).length ? A : null; window.__deg = s.deg;
    const deg0 = M.map(m => ({...m.deg}));
    if (window.__A && window.__A.degPool) M.forEach(m => ["w","m"].forEach(g => m.deg[g] = Math.min(95, m.deg[g]*window.__A.degPool[g])));
    try {
      const T = traitRel(s, P); T.D = D; T.look = {}; T.want = {};
      GK.forEach(g => { T.look[g] = lookFit(g, s); T.want[g] = kidsWant(g, P, s); });
      const L = window.__A && window.__A.recip || 1;
      const rows = M.map(m => { const r = pool(m, s, P, T); return [r.click*L, r.apps*L]; });
      const mem = M.findIndex(m => m.short === "Memphis"), f = pool(M[mem], s, P, T);
      const iv = opt.iv === false ? null : interval(M[mem], s, P, f);
      return {rows, iv: iv && {lo: iv.lo, hi: iv.hi}};
    } finally {
      M.forEach((m, i) => Object.assign(m.deg, deg0[i])); window.__A = null; window.__deg = false;
    }
  };
  window.__meta = () => M.map(m => ({name: m.name, short: m.short, pop: m.pop, dem: m.dem, none: m.none, adh: m.adh, deg: {...m.deg}, faith: m.faith}));
};

export async function open(pagePath){
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errs = []; page.on("pageerror", e => errs.push(e.message));
  page.on("console", m => { if (m.type() === "assert" || m.type() === "error") errs.push(m.text()); });
  await page.goto((pagePath ? "file://" + path.resolve(pagePath) : PAGE) + "#m=Memphis%2C%20TN-MS-AR"); await page.waitForTimeout(800);
  await page.evaluate(INJECT);
  const meta = await page.evaluate(() => window.__meta());
  if (errs.length) throw new Error("self-check failed: " + errs.join("; "));
  const run = (prof, A, opt) => page.evaluate(([p, a, o]) => window.__run(p, a, o), [prof, A || null, opt || {}]);
  // The default search must reproduce the page: 216 in Memphis, and the injected path with an empty scenario
  // must match the original path exactly
  const b = await run({}, null), e = await run({}, {joint: {mode: "page"}});
  const mem = meta.findIndex(m => m.short === "Memphis");
  if (!pagePath && Math.round(b.rows[mem][0]) !== 216) throw new Error("baseline Memphis is " + b.rows[mem][0]);
  // (The override reimplements the original page, so this check only applies to it, not to a patched copy)
  if (!pagePath) b.rows.forEach((r, i) => { if (Math.abs(r[0] - e.rows[i][0]) > 1e-9*Math.max(1, r[0])) throw new Error("override path differs at " + meta[i].name); });
  if (errs.length) throw new Error("page errors: " + errs.join("; "));
  return {meta, run, evaluate: (fn, arg) => page.evaluate(fn, arg), close: () => browser.close()};
}
