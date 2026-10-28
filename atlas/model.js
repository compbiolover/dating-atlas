// The funnel model: every constant and source estimate, the per-metro data, and the math that turns a search
// into a count and its uncertainty range. No page code: it reads only the data constants in data.js.
const GK = ["w","m","n"];
// Funnel stages, from who lives there to who'd say yes
const PHASES = [{name:"Who's there", c:"color-mix(in srgb, var(--accent) 45%, var(--track))"},
  {name:"Who's available", c:"color-mix(in srgb, var(--accent) 72%, var(--track))"},
  {name:"Who fits", c:"var(--accent)"}, {name:"Who clicks", c:"var(--hot)", sharp:true}];
const G = {w:{noun:"women", one:"woman", share:.50}, m:{noun:"men", one:"man", share:.485}, n:{noun:"nonbinary people", one:"nonbinary person", share:.015}};
// OPEN[a][b]: share of single people of gender a who are open to dating someone of gender b
const OPEN = {w:{w:.14, m:.88, n:.10}, m:{w:.94, m:.07, n:.05}, n:{w:.60, m:.50, n:.60}};
const SINGLE_ADJ = {w:0, m:6, n:10};  // points above SINGLE (modeled) or above the women/men average (ACS, nonbinary)
const DEG_MULT = {w:1.25, m:.97, n:1.15};
const SEC_SHIFT = {w:0, m:.04, n:.15}; // points added to the non-religious share
// Politics: six groups from the 2024 CES ideology question among single 25-to-35-year-olds (scripts/structure/ces_politics.py).
// POL_FIT: [a, b, c] for logit P(group) = a + b*logit(metro Harris share) + c*woman, for left (progressive or liberal),
// moderate, right (conservative or very conservative) and not political; the four are normalized to sum to 1.
// POL_SPLIT: progressive's share of the left and conservative's share of the right. POL_NB: nonbinary singles 18-40,
// the same in every metro (too few for a slope). POL_DEG: P(group | bachelor's or higher)/P(group).
// POL_OR: odds ratio of each group with no religion [all, degree holders] and with Christian [all, degree holders];
// the degree holders' ratios are shrunk toward the all-singles ones where their cells are thin.
// NONE_SPLIT: atheist, agnostic and nothing in particular among the non-religious in each group, and overall.
const POL_FIT = {left:[-0.846,0.437,0.382], mod:[-0.64,0.324,-0.287], right:[-1.287,-0.883,-0.404], apol:[-1.91,-0.199,0.281]};
const POL_SPLIT = {w:[0.483,0.679], m:[0.501,0.644]};
const POL_NB = {prog:0.588, lib:0.173, mod:0.065, con:0.002, vcon:0.002, apol:0.173};
const POL_DEG = {w:{prog:1.513, lib:1.362, mod:0.832, con:0.783, vcon:1.147, apol:0.381}, m:{prog:1.458, lib:1.534, mod:0.874, con:0.91, vcon:0.981, apol:0.323}};
const POL_OR = {w:{prog:[2.413,3.946,0.443,0.204], lib:[1.455,1.377,0.643,0.612], mod:[0.737,0.28,1.623,4.223], con:[0.619,0.545,1.786,2.388], vcon:[0.177,0.119,4.219,4.397], apol:[0.882,1.477,0.716,0.552]}, m:{prog:[2.74,4.261,0.393,0.206], lib:[1.276,1.771,1.021,0.585], mod:[0.694,0.555,0.982,1.053], con:[0.304,0.091,2.929,15.879], vcon:[0.455,0.315,2.266,3.101], apol:[2.957,3.344,0.389,0.376]}};
const NONE_SPLIT = {prog:[0.315,0.25,0.435], lib:[0.202,0.272,0.526], mod:[0.093,0.205,0.702], con:[0.087,0.213,0.7], vcon:[0.089,0.114,0.797], apol:[0.068,0.056,0.876], all:[0.157,0.197,0.646]};
// Degree holders are more often Christian and less often unaffiliated (CES), so the degree filter shifts those shares
const DEG_OR = {sec:{w:.93, m:.76}, christian:{w:1.2, m:1.3}};
const byGender = (o, g) => o[g] ?? (o.w + o.m)/2;
const shiftOdds = (p, k) => p <= 0 || p >= 1 ? p : p*k/(1 - p + p*k);
const plackett = (p, q, psi) => { if (Math.abs(psi - 1) < 1e-9) return p*q; const S = 1 + (psi - 1)*(p + q);
  return (S - Math.sqrt(S*S - 4*psi*(psi - 1)*p*q))/(2*(psi - 1)); };
// Self-check: the joint gives back its odds ratio and stays inside both shares
[[.7, .4, 4.76], [.9, .5, 1.82], [.3, .9, 5]].forEach(([p, q, psi]) => { const j = plackett(p, q, psi);
  console.assert(Math.abs(j*(1 - p - q + j)/((p - j)*(q - j)) - psi) < 1e-6 && j <= Math.min(p, q), "plackett", p, q, psi); });
// Partner filters. The default is progressive, liberal or moderate, non-religious and any diet; the second preset is the opposite side.
const POLS = {prog:"Progressive", lib:"Liberal", mod:"Moderate", con:"Conservative", vcon:"Very conservative", apol:"Not political", any:"Any politics"};
const FAITHS = {secular:"Non-religious", atheist:"Atheist", agnostic:"Agnostic", nothing:"Nothing in particular", christian:"Christian", catholic:"Catholic", protestant:"Protestant", lds:"Latter-day Saint", otherchr:"Other Christian",
  jewish:"Jewish", muslim:"Muslim", hindu:"Hindu", buddhist:"Buddhist", pagan:"Pagan or Wiccan", any:"Any faith or none"};
const FAITH_COL = {christian:0, catholic:1, protestant:2, lds:3, jewish:4, muslim:5, hindu:6, buddhist:7};  // columns of FAITH
const CHRISTIAN = ["christian","catholic","protestant","lds","otherchr"];
const SECULAR = ["secular","atheist","agnostic","nothing"];  // Any non-religious, then its parts in NONE_SPLIT order
// A faith's PRRI share in %. Other Christian (Orthodox, Jehovah's Witness and others) is what Christian leaves after the named groups.
const faithPct = (F, f) => f === "otherchr" ? Math.max(0, F[0] - F[1] - F[2] - F[3]) : F[FAITH_COL[f]];
const PAGAN = .003, OTHER_AVG = 1.44;  // Pew 2014: 0.3% Pagan or Wiccan, scaled by the metro's PRRI "other religion" share over the atlas average
// Climate describes where you'd live, not who's there, so it picks which metros to show, not the pool. A metro's
// [January, July] average °F (CLIMATE) is NOAA's 1991-2020 county normals, weighted by population.
const CLIMATES = {any:"Any climate", warm:"Warm winters", mild:"Four seasons", cold:"Cold, snowy winters"};
const WARM_JAN = 50, COLD_JAN = 30;
const climateOf = m => !m.clim ? null : m.clim[0] >= WARM_JAN ? "warm" : m.clim[0] <= COLD_JAN ? "cold" : "mild";
const DIETS = {any:"Any diet", veg:"Vegetarian", vegan:"Vegan", pesc:"Pescatarian", kosher:"Keeps kosher", halal:"Eats halal"};
// Gallup 2023: 4% vegetarian (6% of women, 2% of men) and 1% vegan; NHANES 2023 analysis: 4.7% pescatarian, 59.5% of them women.
// The pescatarian option also counts vegetarians, since they don't eat meat either; only the vegetarian part shifts with politics.
const DIET_RATE = {veg:{w:.06, m:.02}, vegan:{w:.015, m:.005}, pesc:{w:.056, m:.038}};
const DIET_POL = {prog:2.25, lib:2.25, mod:.75, con:.75, vcon:.75, apol:1};  // Gallup 2023: 9% of liberals vegetarian, 3% of moderates and conservatives, 4% overall
const KOSHER = .17, HALAL = .83;  // Pew 2020: 17% of Jews keep kosher at home; ISPU 2022: 83% of Muslims only buy or prefer halal
const PRESETS = {mine:{pol:"prog,lib,mod", faith:"secular"}, opp:{pol:"mod,con,vcon", faith:"christian"}};  // quick picks leave diet alone

// What partners want in you, by the rater's gender. Sources are in the notes.
// Acceptable age gap: how much older (hi) or younger (lo) a partner can be, lognormal with spread AGE_SD.
// Its mean follows Antfolk 2017's youngest/oldest acceptable age at the rater's own age, [scale, intercept,
// slope, reference age], scaled so the average share rejecting a 10-year gap matches Pew 2019
// (women 27% older, 42% younger; men 47% and 16%). A same-age partner is always acceptable.
const AGE_GAP = {w:{hi:[1.30,46.19,1.012,35.03], lo:[1.27,27.44,.583,35.03]}, m:{hi:[.99,49.21,.787,37.25], lo:[1.09,21.38,.257,37.25]}};
const AGE_SD = .45;
const HT = {w:[162.5,6.9], m:[176.1,7.5]};  // NHANES 2015-18, ages 20-49, cm
const EDU_PEN = {w:[.54,.25], m:[.44,.14]};  // less likely to date someone without a bachelor's, raters [with, without] one (SCAL 2022)
const JOB_PEN = {w:[.89,.74], m:[.66,.47]};  // less likely to date someone unemployed, same split (SCAL 2022)
const PENALTY = .5;                         // "less likely" treated as half a rejection
const LESS_MONEY = {w:.24, m:.07};          // would not date someone who makes much less (Pew 2019)
const PARENT_NO = [.42, .28];               // would not date someone raising kids, raters under 40 / 40+ (Pew 2019)
const WANT = {w:[.45,.30,.25], m:[.57,.30,.13]}; // non-parents 18-34: want kids, unsure, don't (Pew 2023)
const UNLIKELY_U50 = .47; // non-parents under 50 unlikely ever to have kids (Pew 2024); used from 35 up, no data past 49
// Who's looking to date. Pew asks people who are neither married nor living with a partner; 20% of them are
// in a committed relationship (2022), the same at every age as far as Pew reports. Of the rest, the share
// looking for a relationship or dates is Pew 2019's split by sex and age (under 40 / 40 and up), scaled by
// each sex's drop from 2019 to 2022 (men 61% to 50%, women 38% to 35%).
const COMMITTED = .20;
// From 65, Pew 2022's drop among unpartnered adults (36% looking at 50 to 64, 16% at 65 and up) scales the 40+ rate.
const LOOKING = {w:[.61*35/38, .29*35/38], m:[.67*50/61, .55*50/61]};
const LOOK_65 = 16/36;
const lookRate = (g, a) => LOOKING[g][a < 40 ? 0 : 1]*(a >= 65 ? LOOK_65 : 1);
// Share of unmarried, non-cohabiting people of gender g in the age range who are unattached and looking
function lookFit(g, s){
  let t = 0;
  for (let a = s.ageMin; a <= s.ageMax; a++) t += g === "n" ? (lookRate("w", a) + lookRate("m", a))/2 : lookRate(g, a);
  return (1 - COMMITTED)*t/(s.ageMax - s.ageMin + 1);
}
// What daters want, [committed only, casual only], by sex and by age (under 40 / 40 and up) among singles looking (Pew 2019).
// Pew gives no sex-by-age split, so the age shift multiplies the sex share by that age group's share over all daters'.
const GOAL_ONLY = {w:[.36,.16], m:[.22,.22], age:[[.27,.15],[.29,.24]], all:[.28,.20]};
const GOALS = {any:"Unattached and looking to date", serious:"Looking for something serious", casual:"Looking for something casual"};
// Share of daters of gender t in the age range open to what you want: serious drops casual-only, casual drops committed-only.
// Each year counts by how many are looking at that age, as in lookFit.
function goalFit(t, P, s){
  if (P.goal === "any") return 1;
  const i = P.goal === "serious" ? 1 : 0, sx = byGender({w:GOAL_ONLY.w[i], m:GOAL_ONLY.m[i]}, t);
  const look = a => t === "n" ? (lookRate("w", a) + lookRate("m", a))/2 : lookRate(t, a);
  let fit = 0, n = 0;
  for (let a = s.ageMin; a <= s.ageMax; a++){ const l = look(a); fit += l*(1 - sx*GOAL_ONLY.age[a < 40 ? 0 : 1][i]/GOAL_ONLY.all[i]); n += l; }
  return n ? fit/n : 1;
}
// Whether it clicks, by the gender of whoever is judging. Sources are in the notes.
const ATTRACT = {w:25, m:35, n:30}; // % of eligible partners a rater would want to date (speed-dating yes rates, discounted)
const APPS = {w:23, m:31, n:27};    // % of singles looking to date who are on a dating app now (Pew 2022: 28% overall)
const LGB_APPS = 1.5;               // LGB singles are about 1.5 times as likely to be dating online (Pew 2019)
const appsRate = (t, P) => APPS[t]*(t === P.you || t === "n" || P.you === "n" ? LGB_APPS : 1);
// Slider defaults for a profile, blended over the genders you're looking for by how many are open to you.
// The sliders then scale every gender's rate by the same factor.
function clickDefaults(P){
  let w = 0, her = 0, apps = 0;
  P.seek.forEach(t => { const k = G[t].share*OPEN[t][P.you]; w += k; her += k*ATTRACT[t]; apps += k*appsRate(t, P); });
  return {his: ATTRACT[P.you], her: her/w, apps: apps/w};
}
const PARENTS = {w:.164, m:.039};           // single parents per single adult 20-64 (cohabiters removed), national ACS, when a metro has no ACS row
const Phi = z => { const t = 1/(1 + .3275911*Math.abs(z)/Math.SQRT2),
  e = 1 - ((((1.061405429*t - 1.453152027)*t + 1.421413741)*t - .284496736)*t + .254829592)*t*Math.exp(-z*z/2);
  return z >= 0 ? (1 + e)/2 : (1 - e)/2; };
// Share of raters of gender r and age a who'd accept a partner aged y
function ageOK(r, a, y){
  const d = y - a; if (Math.abs(d) < .5) return 1;
  const [k, b0, b1, at] = AGE_GAP[r][d > 0 ? "hi" : "lo"], bound = b0 + b1*(a - at);
  const mu = Math.max(1, k*(d > 0 ? bound - a : a - bound));
  return 1 - Phi((Math.log(Math.abs(d)) - Math.log(mu) + AGE_SD*AGE_SD/2)/AGE_SD);
}
// Share of raters of gender r who'd accept your height h (cm), from Stulp 2013's minimum height gap
// (women want a man about 4 cm taller than them; men want a woman no taller than them). Stulp's maximum
// gaps are left out: they would penalize tall men, which app data doesn't show. Men's aversion is much
// weaker (SCAL 2022: 32% of men vs 56% of women), so it counts as half a rejection like the other penalties.
function htOK(r, h){
  if (r === "w"){ const [mu, sd] = HT.w; return Phi((h - mu - 3.72)/Math.hypot(sd, 5.54)); }
  const [mu, sd] = HT.m; return 1 - PENALTY*(1 - Phi((mu - h + .05)/Math.hypot(sd, 7.29)));
}
// How your traits change raters' interest, relative to a same-age, average-height, degree-holding,
// employed person without kids. Nonbinary raters get the average of women and men.
function traitRel(s, P){
  const out = {};
  GK.forEach(t => {
    const rs = t === "n" ? ["w","m"] : [t];
    let age = 0, kid = 0, n = 0;
    for (let a = s.ageMin; a <= s.ageMax; a++) rs.forEach(r => {
      age += ageOK(r, a, P.age);
      kid += P.kids === "have" ? 1 - PARENT_NO[a < 40 ? 0 : 1] : 1; n++; });
    const opp = (t === "w" && P.you === "m") || (t === "m" && P.you === "w");
    const avg = f => rs.reduce((q, r) => q + f(r), 0)/rs.length;
    out[t] = {age: age/n, kids: kid/n, ht: opp ? htOK(t, P.ht)/htOK(t, heightFor(P.you)) : 1, // vs the menu height nearest average
      edu: ba => P.edu === "ba" ? 1 : avg(r => 1 - PENALTY*(ba*EDU_PEN[r][0] + (1 - ba)*EDU_PEN[r][1])),
      job: ba => P.job === "job" ? 1 : P.job === "less" ? avg(r => 1 - LESS_MONEY[r]) : avg(r => 1 - PENALTY*(ba*JOB_PEN[r][0] + (1 - ba)*JOB_PEN[r][1]))};
  });
  return out;
}
// Want kids, unsure, don't: Pew's 18-34 split up to 34; from 35, 47% unlikely and the rest split as at 18-34
function wantSplit(g, age){
  const w = g === "n" ? WANT.w.map((v, i) => (v + WANT.m[i])/2) : WANT[g];
  if (age <= 34) return w;
  const r = (1 - UNLIKELY_U50)/(w[0] + w[1]);
  return [w[0]*r, w[1]*r, UNLIKELY_U50];
}
// When childless singles who intend kids expect their first: [within 2 years, 2-5, more than 5], ages 18-24, 25-29,
// 30-34 and 35-49 (NSFG 2022-23, structure/nsfg_timing.py); 50 and up use 35-49. Wanting them soon drops the 5+ group,
// wanting them later drops the within-2 group, and 2-5 years fits either.
const KID_WHEN = {w:[[.026,.258,.716],[.177,.521,.302],[.154,.687,.159],[.352,.548,.100]], m:[[.006,.210,.784],[.041,.599,.360],[.126,.596,.278],[.186,.662,.152]]};
const WHENS = {any:"Whenever", soon:"Within 2 years", later:"More than 5 years from now"};
function whenFit(t, y, P){
  if (P.kids !== "want" || P.when === "any") return 1;
  const band = y < 25 ? 0 : y < 30 ? 1 : y < 35 ? 2 : 3, sh = byGender({w:KID_WHEN.w[band][P.when === "soon" ? 2 : 0], m:KID_WHEN.m[band][P.when === "soon" ? 2 : 0]}, t);
  return 1 - sh;
}
// Share of childless singles of gender t in your age range whose plans fit yours
function kidsWant(t, P, s){
  let fit = 0;
  for (let y = s.ageMin; y <= s.ageMax; y++){ const [yes, u, no] = wantSplit(t, y);
    fit += P.kids === "want" ? yes*whenFit(t, y, P) + u : P.kids === "dont" ? no + u : 1; }
  return fit/(s.ageMax - s.ageMin + 1);
}
// Share of single people of gender t in metro m whose kids situation fits yours
function kidsFit(m, t, P, want, s){
  // B11012 excludes cohabiting parents, so divide by singles with cohabiters removed, as the pool does.
  // Its single parents of children under 18 are counted at 20 to 64, so years of the range past 64 have none.
  const a = m.acs, sg = g => a ? a["k"+g]/bandSum(a[g], {ageMin:20, ageMax:64}, PUMS.free[g]) : PARENTS[g];
  const under65 = Math.max(0, Math.min(s.ageMax, 64) - s.ageMin + 1)/(s.ageMax - s.ageMin + 1);
  const k = Math.min(.5, t === "n" ? (sg("w") + sg("m"))/2 : sg(t))*under65;
  return (1 - k)*want + k*(P.openP ? 1 : 0);
}

const M = RAW.map(([name,pop,bach,black,dem,demNote],i) => {
  const [adh = 48.6, none = 23.1] = REL[name] || [], acs = ACS && ACS.metros[name] || null;
  const deg = {};
  GK.forEach(g => {
    // 25-34 share, used only without ACS data; searches use degFor, which follows the age range
    deg[g] = Math.min(85, acs ? (g === "n" ? (acs.dw[1] + acs.dm[1])/2*DEG_MULT.n*2/(DEG_MULT.w + DEG_MULT.m) : acs["d"+g][1]) : bach*DEG_MULT[g]);
  });
  const house = HOUSE[name] || null;
  // Consolidated city-counties drop the county: "Nashville-Davidson" → Nashville, "Louisville/Jefferson County" → Louisville
  return {i, name, short:name.split(",")[0].split("–")[0].replace(/[-\/](\w+ )?(County|Fayette|Davidson)$/, ""), pop, bach, dem, demNote, adh, none, acs, deg, house, faith:FAITH[name] || null, clim:CLIMATE[name] || null};
});
// The modeled constants of the values step at their best guesses; the uncertainty simulation passes draws instead
const VQ = {pol:1, sec:.40, fr:1, psi:1, ds:1};
// Politics and faith are each one or more groups as a comma list ("prog,lib", "jewish,secular"); "any" means no filter
const polList = P => P.pol.split(","), faithList = P => P.faith.split(",");
const inv = z => 1/(1 + Math.exp(-z)), logit = p => Math.log(p/(1 - p));
// Share of single people of gender g in metro m in each politics group, after the degree filter. Women and men follow
// the metro's Harris share (POL_FIT, then POL_SPLIT); nonbinary people get POL_NB everywhere.
function polShares(m, g, P){
  let r;
  if (g === "n") r = {...POL_NB};
  else { const x = logit(Math.min(.98, Math.max(.02, m.dem/100))), w = g === "w" ? 1 : 0, sp = POL_SPLIT[g];
    const f = Object.fromEntries(Object.entries(POL_FIT).map(([k, [a, b, c]]) => [k, inv(a + b*x + c*w)]));
    const t = f.left + f.mod + f.right + f.apol;
    r = {prog: f.left*sp[0]/t, lib: f.left*(1 - sp[0])/t, mod: f.mod/t, con: f.right*sp[1]/t, vcon: f.right*(1 - sp[1])/t, apol: f.apol/t}; }
  if (P.degOnly){ let t = 0; for (const k in r){ r[k] *= byGender({w: POL_DEG.w[k], m: POL_DEG.m[k]}, g); t += r[k]; } for (const k in r) r[k] /= t; }
  return r;
}
// Odds ratio between politics group k and no religion (c = 0) or Christian (c = 1), for the degree filter's setting
const polOR = (g, k, c, deg) => byGender({w: POL_OR.w[k][2*c + deg], m: POL_OR.m[k][2*c + deg]}, g);
// Share of single people of gender g in metro m in each faith you picked, after the degree shift, as [faith, share].
// The groups don't overlap: an umbrella (Any Christian, Any non-religious) and its parts are never sent together.
// A non-religious part carries the umbrella's share; its fraction of it depends on politics (NONE_SPLIT).
function faithShares(m, g, P, Q = VQ){
  const F = m.faith, deg = P.degOnly;
  return faithList(P).filter(f => f !== "any").map(f => {
    let x;
    if (SECULAR.includes(f)){ x = Math.min(.8, Math.max(.05, Q.sec + (m.none - 23.1)/100 + .3*(48.6 - m.adh)/100 + SEC_SHIFT[g]));
      if (deg) x = shiftOdds(x, byGender(DEG_OR.sec, g)*Q.ds); }
    else { x = !F ? 0 : Q.fr*(f === "pagan" ? PAGAN*F[8]/OTHER_AVG : faithPct(F, f)/100);
      // The degree shift was measured on Christians as a whole, so it shifts the Christian total and each part
      // moves in proportion; that keeps the parts adding up to Any Christian
      if (deg && CHRISTIAN.includes(f)){ const k = byGender(DEG_OR.christian, g)*Q.ds, C = Q.fr*F[0]/100;
        x = f === "christian" ? shiftOdds(x, k) : C ? x*shiftOdds(C, k)/C : x; } }
    return [f, x];
  });
}
// Share of single people of gender g in metro m who fit your politics and faith, 0 to 1.
// Q holds the modeled constants, so the uncertainty simulation can vary them.
function valRaw(m, g, P, Q = VQ){
  const any = P.pol === "any", sel = any ? [] : polList(P), ps = polShares(m, g, P), fs = faithShares(m, g, P, Q);
  // The range's politics uncertainty scales the share of your groups up or down together
  const S0 = sel.reduce((t, k) => t + ps[k], 0), S = any ? 1 : Math.min(.995, S0*Q.pol), sc = S0 ? S/S0 : 1;
  if (!fs.length) return S;
  const part = f => SECULAR.indexOf(f) - 1;  // 0-2 for atheist, agnostic, nothing; -1 otherwise
  if (any) return Math.min(1, fs.reduce((t, [f, x]) => t + x*(part(f) >= 0 ? NONE_SPLIT.all[part(f)] : 1), 0));
  // Each politics group pairs with each faith through its own odds ratio from CES (no religion and Christian; others
  // independent); the pairs don't overlap, so they add. The total can't pass your politics' share.
  const deg = P.degOnly ? 1 : 0;
  let sum = 0;
  sel.forEach(k => { const p = ps[k]*sc;
    fs.forEach(([f, x]) => { const c = SECULAR.includes(f) ? 0 : CHRISTIAN.includes(f) ? 1 : -1;
      const j = c < 0 ? p*x : plackett(p, x, polOR(g, k, c, deg)*Q.psi);
      sum += part(f) >= 0 ? j*NONE_SPLIT[k][part(f)] : j; }); });
  return Math.min(S, sum);
}
// Share of those who also fit your diet. Kosher and halal follow the local Jewish and Muslim shares.
function dietFit(m, g, P){
  if (P.diet === "any") return 1;
  // Jewish (Muslim) share of the people who fit your faith: all of a Jewish (Muslim) pick, the local share of a
  // non-religious pick or of any faith, none of the other faiths; weighted by each faith's share
  const F = m.faith || [], fs = faithShares(m, g, P), tot = fs.reduce((t, [, x]) => t + x, 0);
  const frac = (f, col) => !fs.length ? (F[col] || 0)/100 : !tot ? 0
    : fs.reduce((t, [k, x]) => t + x*(k === f ? 1 : SECULAR.includes(k) ? (F[col] || 0)/100 : 0), 0)/tot;
  if (P.diet === "kosher") return KOSHER*frac("jewish", 4);
  if (P.diet === "halal") return HALAL*frac("muslim", 5);
  const rate = d => byGender(DIET_RATE[d], g);
  // Vegetarians lean liberal: weight each picked politics group's rate by its share
  let pol = 1;
  if (P.pol !== "any"){ const ps = polShares(m, g, P), sel = polList(P), t = sel.reduce((a, k) => a + ps[k], 0);
    pol = t ? sel.reduce((a, k) => a + ps[k]*DIET_POL[k], 0)/t : 1; }
  return Math.min(1, P.diet === "pesc" ? rate("pesc") + rate("veg")*pol : rate(P.diet)*pol);
}
// "Progressive or liberal and Jewish or non-religious": politics and non-religious words are lower-cased after the
// first word; faith names (Christian, Jewish) keep their capitals
const lowerIf = (t, low) => low ? t.toLowerCase() : t;
const orList = a => a.length < 3 ? a.join(" or ") : a.slice(0, -1).join(", ") + " or " + a[a.length - 1];  // "a, b or c"
const polLabel = P => orList(polList(P).map((k, i) => lowerIf(POLS[k], i > 0)));
const faithLabel = (P, lower) => orList(faithList(P).map((f, i) => lowerIf(FAITHS[f], (lower || i > 0) && SECULAR.includes(f))));
const valuesLabel = P => P.pol === "any" && P.faith === "any" ? "" : P.pol === "any" ? faithLabel(P) : P.faith === "any" ? polLabel(P)
  : `${polLabel(P)} and ${faithLabel(P, true)}`;
// The funnel step names the category, not every pick, so it stays short; valuesLabel has the picks
const valuesStep = P => P.pol === "any" ? "Faith match" : P.faith === "any" ? "Politics match" : "Politics and faith match";
// A recent mover's 1-bedroom rent as a share of median pay for your education level, in percent
const rentShare = (m, P) => m.house ? Math.round(m.house[0]*12/m.house[P.edu === "ba" ? 1 : 2]*100) : NaN;
const BURDEN = 30; // HUD counts renters paying more than 30% of income as cost-burdened
const byName = new Map(M.map(m => [m.name.toLowerCase(), m]));
// Uncertainty range: a Monte Carlo over the inputs. Each draw scales every funnel factor by a random amount
// whose spread comes from that factor's source (ACS standard errors, survey sample sizes, or a stated range for
// modeled constants). The same 2,000 seeded draws are reused on every update, so the range moves smoothly.
const NSIM = 2000, DIMS = 32;
const ZS = (() => { let a = 20251002; const rnd = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0)/4294967296; };
  const z = new Float64Array(NSIM*DIMS);
  for (let i = 0; i < z.length; i += 2){ const u = Math.max(1e-12, rnd()), v = rnd(), r = Math.sqrt(-2*Math.log(u));
    z[i] = r*Math.cos(2*Math.PI*v); if (i + 1 < z.length) z[i+1] = r*Math.sin(2*Math.PI*v); }
  return z; })();
const LN = (sd, z) => Math.exp(sd*z - sd*sd/2);       // mean-one lognormal scale
const NR = (sd, z) => Math.max(.05, 1 + sd*z);        // mean-one normal scale, kept positive
const UNC = {goal:.15, cohab:.035, look:.08, openAdapt:.05, pol:.15, sec:.05, psi:{all:.235, ba:.384}, degOR:.1, pagan:.35, kids:.06, his:.25, her:.25, dietPol:.2,
  diet:{veg:.15, vegan:.3, pesc:.08, kosher:.05, halal:.05}};
// Each group as it reads after "mostly depending on"
const UGROUPS = {census:"the local Census counts", look:"how many singles are looking", open:"how many are open to dating you",
  values:"the politics and faith estimates", diet:"the diet rates", kids:"kids plans", click:"how often attraction is mutual"};
// Relative standard error of ACS single people of gender g over the age range (bands split as in bandSum,
// with each band's margin of error scaled by the share of that band inside the range)
function singlesRelSE(m, g, s){
  const a = m.acs, e = ACSE[m.name];
  if (!a || !e) return .1;
  if (g === "n") return (singlesRelSE(m, "w", s) + singlesRelSE(m, "m", s))/2;
  let v = 0, n = 0;
  bandWeights(a[g], s).forEach((w, i) => { v += (w*e[g][i])**2; n += w*a[g][i]; });
  return n ? Math.sqrt(v)/n : .1;
}
function interval(m, s, P, f){
  const parts = f.parts;
  if (!parts.length || !f.click) return null;
  // PRRI faith shares vary by their sampling error, from the combined share of the PRRI faiths you picked.
  // shortcut: Pagan picked with other faiths uses theirs, since the Pagan share is tiny; split it if that matters
  const pr = faithList(P).filter(f => f !== "any" && !SECULAR.includes(f));
  const fs = m.faith ? pr.reduce((t, f) => t + (f === "pagan" ? 0 : faithPct(m.faith, f)/100), 0) : .5;
  // Faiths with no local PRRI share add nothing to vary, so only a Pagan pick keeps its own spread
  const frSD = !pr.length ? 0 : pr.every(f => f === "pagan") ? UNC.pagan : !fs ? (pr.includes("pagan") ? UNC.pagan : 0)
    : Math.max(.08, Math.sqrt((1 - fs)/(fs*400)));
  const g0 = parts.map(({t, v}) => ({t, v0: v, rs: singlesRelSE(m, t, s),
    ds: s.deg ? degParts(m, t, s).rel : 0,
    os: Math.hypot(Math.sqrt((1 - OPEN[t][P.you])/(OPEN[t][P.you]*1000)), UNC.openAdapt)}));
  const vf = parts.map(({t}) => valRaw(m, t, P));
  // The relationship goal removes a share r of daters; a draw scales r, not what's kept
  const cut = (r, sd, zz) => r > 0 ? Math.max(0, 1 - r*LN(sd, zz))/(1 - r) : 1;
  const gr = parts.map(({t}) => 1 - goalFit(t, P, s));
  const dietSD = P.diet === "any" ? 0 : UNC.diet[P.diet], dietPolSD = ["veg","vegan","pesc"].includes(P.diet) && P.pol !== "any" ? UNC.dietPol : 0;
  // One pass computes the total for every draw with all groups varying, and with each group varying alone.
  // Group order matches UGROUPS: census, look, open, values, diet, kids, click.
  const keys = Object.keys(UGROUPS), K = keys.length, tot = new Float64Array(NSIM), solo = keys.map(() => new Float64Array(NSIM));
  const Q = {...VQ}, fac = new Float64Array(K), one = new Float64Array(K);
  for (let d = 0; d < NSIM; d++){
    const z = i => ZS[d*DIMS + i];
    Q.pol = LN(UNC.pol, z(0)); Q.sec = VQ.sec + UNC.sec*z(1); Q.fr = frSD ? LN(frSD, z(2)) : 1; Q.psi = LN(UNC.psi[s.deg ? "ba" : "all"], z(3));
    Q.ds = s.deg ? LN(UNC.degOR, z(31)) : 1;
    const cohab = NR(UNC.cohab, z(4)), click = LN(UNC.his, z(5))*LN(UNC.her, z(6)), diet = (dietSD ? LN(dietSD, z(7)) : 1)*(dietPolSD ? LN(dietPolSD, z(8)) : 1);
    let all = 0; one.fill(0);
    parts.forEach((p, j) => { const g = g0[j], b = 9 + j*7;
      fac[0] = cohab*NR(g.rs, z(b))*(g.ds ? NR(g.ds, z(b+1)) : 1); fac[1] = LN(UNC.look, z(b+2))*cut(gr[j], UNC.goal, z(b+5)); fac[2] = NR(g.os, z(b+3));
      fac[3] = vf[j] ? valRaw(m, p.t, P, Q)/vf[j] : 1; fac[4] = diet; fac[5] = NR(UNC.kids, z(b+4)); fac[6] = click;
      let prod = 1; for (let k = 0; k < K; k++){ prod *= fac[k]; one[k] += p.ck*fac[k]; }
      all += p.ck*prod; });
    tot[d] = all; for (let k = 0; k < K; k++) solo[k][d] = one[k];
  }
  tot.sort();
  const q = p => tot[Math.floor(p*(NSIM - 1))];
  const lv = arr => { let s1 = 0, s2 = 0; arr.forEach(x => { const l = Math.log(Math.max(1e-9, x)); s1 += l; s2 += l*l; }); const n = arr.length; return Math.max(0, s2/n - (s1/n)**2); };
  const vars = solo.map(lv), vt = vars.reduce((a, v) => a + v, 0), ti = vars.indexOf(Math.max(...vars));
  const ranges = keys.map((k, i) => { const a = solo[i].sort(); return {k, lo: a[Math.floor(.1*(NSIM - 1))], hi: a[Math.floor(.9*(NSIM - 1))]}; });
  return {lo: q(.1), hi: q(.9), top: keys[ti], share: vt ? vars[ti]/vt : 0, ranges, draws: tot};
}
const TOP = [...M].sort((a,b) => b.pop - a.pop), BIG = new Set(TOP.slice(0,25));
const SINGLE = 50; // modeled share single for women, used only for a metro without ACS counts
// Heights 4'10" to 6'8" for the height menu, stored as whole cm
const HEIGHTS = Array.from({length: 23}, (_, i) => Math.round((58 + i)*2.54));
const heightFor = you => { const mu = byGender({w: HT.w[0], m: HT.m[0]}, you);
  return HEIGHTS.reduce((b, c) => Math.abs(c - mu) < Math.abs(b - mu) ? c : b); };
// Single-year counts from ACS bands: a monotone cubic (Fritsch–Carlson PCHIP) through the cumulative count at
// each band edge, differenced by year. Every band keeps its exact total, counts never go negative, and years
// change smoothly across band edges instead of stepping. Cached per band array.
const YEARS = new WeakMap(), AGE0 = ACS.bands[0][0];
function singleYears(arr){
  if (YEARS.has(arr)) return YEARS.get(arr);
  const x = [AGE0, ...ACS.bands.map(b => b[1] + 1)], y = [0], n = x.length - 1;
  arr.forEach((v, i) => y.push(y[i] + v));
  const h = [], d = [];
  for (let k = 0; k < n; k++){ h.push(x[k+1] - x[k]); d.push((y[k+1] - y[k])/h[k]); }
  const t = [d[0]];
  for (let k = 1; k < n; k++){ const w1 = 2*h[k] + h[k-1], w2 = h[k] + 2*h[k-1];
    t.push(d[k-1]*d[k] > 0 ? (w1 + w2)/(w1/d[k-1] + w2/d[k]) : 0); }
  t.push(d[n-1]);
  const C = a => { let k = 0; while (k < n - 1 && a >= x[k+1]) k++;
    const u = (a - x[k])/h[k], u2 = u*u, u3 = u2*u;
    return (2*u3 - 3*u2 + 1)*y[k] + (u3 - 2*u2 + u)*h[k]*t[k] + (-2*u3 + 3*u2)*y[k+1] + (u3 - u2)*h[k]*t[k+1]; };
  const out = new Float64Array(x[n] - AGE0);
  for (let a = AGE0; a < x[n]; a++) out[a - AGE0] = Math.max(0, C(a + 1) - C(a));
  YEARS.set(arr, out);
  return out;
}
// Share of each band's count that falls inside the age range, from the single-year counts
function bandWeights(arr, s){
  const yr = singleYears(arr);
  return ACS.bands.map(([lo, hi], i) => { let t = 0;
    for (let a = Math.max(lo, s.ageMin); a <= Math.min(hi, s.ageMax); a++) t += yr[a - AGE0];
    return arr[i] ? t/arr[i] : 0; });
}
// Optional w: a weight for each ACS band, such as the share of singles not living with a partner
function bandSum(arr, s, w){
  const yr = singleYears(arr);
  let t = 0; for (let a = s.ageMin; a <= s.ageMax; a++) t += (yr[a - AGE0] || 0)*(w ? w[ACS.bands.findIndex(([lo, hi]) => a >= lo && a <= hi)] : 1);
  return t;
}
// Degree share of single people of gender g in the age range, in %, and its relative standard error: each year's
// B15001 band share, weighted by single people at that age and scaled by how much less often singles hold degrees
// in that band (PUMS.deg). The bands' standard errors (ACSE) combine as a root sum of squares.
function degParts(m, g, s){
  const a = m.acs, e = ACSE[m.name];
  if (!a) return {p: m.deg[g], rel: .05};
  if (g === "n"){ const w = degParts(m, "w", s), x = degParts(m, "m", s);
    return {p: Math.min(85, (w.p + x.p)/2*DEG_MULT.n*2/(DEG_MULT.w + DEG_MULT.m)), rel: (w.rel + x.rel)/2}; }
  const yr = singleYears(a[g]), W = ACS.degBands.map(() => 0);
  let n = 0;
  for (let y = s.ageMin; y <= s.ageMax; y++){ const w = yr[y - AGE0] || 0; W[ACS.degBands.findIndex(([lo, hi]) => y >= lo && y <= hi)] += w; n += w; }
  if (!n) return {p: m.deg[g], rel: .05};
  let p = 0, v = 0;
  W.forEach((w, i) => { const k = w/n*PUMS.deg[g][i]; p += k*a["d"+g][i]; if (e) v += (k*e["d"+g][i])**2; });
  return {p: Math.min(85, p), rel: e && p ? Math.sqrt(v)/p : .05};
}
const degFor = (m, g, s) => degParts(m, g, s).p;
// Self-check: the single years add back up to each band's total
{ const a = Object.values(ACS.metros)[0].w, yr = singleYears(a);
  ACS.bands.forEach(([lo, hi], i) => { let t = 0; for (let x = lo; x <= hi; x++) t += yr[x - AGE0];
    console.assert(Math.abs(t - a[i]) < 1e-6*Math.max(1, a[i]), "singleYears band total", lo, hi, t, a[i]); }); }

// People of gender g in the age range, and how many of them are single
function base(m, g, s){
  const a = m.acs;
  if (a){
    // ACS counts everyone as a woman or a man; carve the nonbinary share out of both
    const bin = G.w.share + G.m.share;
    // Singles not living with a partner, by age band and sex (PUMS.free)
    if (g !== "n") return {age: bandSum(a[g+"t"], s)*bin, single: bandSum(a[g], s, PUMS.free[g])*bin};
    const all = bandSum(a.wt, s) + bandSum(a.mt, s), sgl = bandSum(a.w, s, PUMS.free.w) + bandSum(a.m, s, PUMS.free.m);
    const age = all*G.n.share;
    return {age, single: age*Math.min(.9, sgl/all + SINGLE_ADJ.n/100)};
  }
  const age = m.pop*G[g].share*Math.min(1, (s.ageMax - s.ageMin + 1)*.0125);
  return {age, single: age*Math.min(.9, (SINGLE + SINGLE_ADJ[g])/100)};
}

// Degree and values shares for a metro, blended across the genders you're looking for
function blends(m, s, P){
  let w1 = 0, e = 0, w2 = 0, v = 0, dt = 0;
  P.seek.forEach(t => {
    const sg = base(m, t, s).single, d = degFor(m, t, s), dg = sg*(s.deg ? d/100 : 1), o = dg*OPEN[t][P.you];
    w1 += sg; e += sg*d; w2 += o; v += o*valRaw(m, t, P)*100; dt += o*dietFit(m, t, P)*100;
  });
  return {edu: e/w1, val: w2 ? v/w2 : 0, diet: w2 ? dt/w2 : 0};
}

// Everything pool() needs that doesn't depend on the metro: trait effects by gender, the click defaults D, and the
// looking and kids-plan rates
function poolCtx(s, P, D){
  const T = traitRel(s, P); T.D = D; T.look = {}; T.want = {}; T.goal = {};
  GK.forEach(g => { T.look[g] = lookFit(g, s); T.want[g] = kidsWant(g, P, s); T.goal[g] = goalFit(g, P, s); });
  return T;
}
// The full funnel for one metro
function pool(m, s, P, T){
  const r = {total:0, age:0, single:0, look:0, deg:0, open:0, vals:0, diet:0, kids:0, click:0, apps:0, parts:[]}, dg = {}, D = T.D;
  // Trait effects averaged over the people they apply to; with no one left after the kids step, over everyone open to you
  const fx = {age:0, ht:0, edu:0, job:0, kids:0, all:0}, fo = {...fx};
  GK.forEach(g => { const b = base(m, g, s), lk = b.single*T.look[g], d = degFor(m, g, s); dg[g] = {b, lk, d, n: lk*(s.deg ? d/100 : 1)}; });
  // Competitors: everyone open to at least one of the genders you're looking for, counted once.
  // OPEN only gives rates per gender, so openness to each is treated as independent.
  let N = 0, C = 0;
  GK.forEach(g => C += dg[g].n*(1 - P.seek.reduce((q, t) => q*(1 - OPEN[g][t]), 1)));
  P.seek.forEach(t => {
    // Your relationship goal narrows your pool and the people the competition ratio counts for you, not the competitors
    const {b} = dg[t], lk = dg[t].lk*T.goal[t], n = dg[t].n*T.goal[t], o = n*OPEN[t][P.you];
    r.total += m.pop*G[t].share; r.age += b.age; r.single += b.single; r.look += lk; r.deg += n; r.open += o;
    const v = o*valRaw(m, t, P), dt = v*dietFit(m, t, P), kf = dt*kidsFit(m, t, P, T.want[t], s);
    const tr = T[t], ba = s.deg ? 1 : dg[t].d/100, f = {age:tr.age, ht:tr.ht, edu:tr.edu(ba), job:tr.job(ba), kids:tr.kids};
    const rel = f.age*f.ht*f.edu*f.job*f.kids, her = Math.min(.95, s.her*ATTRACT[t]/D.her/100*rel), ck = kf*(s.his/100)*her;
    r.parts.push({t, ck, v});
    r.vals += v; r.diet += dt; r.kids += kf; r.click += ck; r.apps += ck*Math.min(.9, s.apps*appsRate(t, P)/D.apps/100);
    Object.keys(f).forEach(k => { fx[k] += kf*f[k]; fo[k] += o*f[k]; }); fx.all += kf*rel; fo.all += o*rel;
    N += n;
  });
  r.fx = Object.fromEntries(Object.keys(fx).map(k => [k, r.kids ? fx[k]/r.kids : r.open ? fo[k]/r.open : 1]));
  r.ratio = C ? N/C : 0;
  r.sexWM = dg.w.n/dg.m.n;
  return r;
}
