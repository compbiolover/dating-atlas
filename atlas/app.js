// The page: reading the form, saved settings and shared links, running the model for the current search, filling
// in the text, wiring up every control, and the first-visit setup. Loads last, after model.js and charts.js.
const $ = id => document.getElementById(id);
const cap = t => t[0].toUpperCase() + t.slice(1);
// localStorage can be missing or blocked; reads then return null and writes do nothing
const store = {get: k => { try { return localStorage.getItem(k); } catch(e){ return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch(e){} }};
// Counts are people, so whole numbers only; one that would round to 0 shows as "<1". Ratios keep fmt1/fmt2.
const fmt = n => n > 0 && n < .5 ? "<1" : Math.round(n).toLocaleString("en-US");
const fmt2 = n => n.toFixed(2);
const fmtAx = n => n >= 1e6 ? n/1e6 + "M" : n >= 1e3 ? n/1e3 + "k" : String(n);
const fmt1 = n => n.toFixed(1);
const fmtX = n => n >= 10 ? fmt(n) : fmt1(n); // multiples like "2.3×"
// Round to two significant figures for the range under the main number
const nice = n => { if (n < 10) return Math.round(n); const q = 10**(Math.floor(Math.log10(n)) - 1); return Math.round(n/q)*q; };
const pct = n => fmtX(n) + "%";
const rangeText = iv => `${iv.hi < 10 ? "Likely fewer than 10" : `Likely between ${fmt(nice(iv.lo))} and ${fmt(nice(iv.hi))}`}, mostly depending on ${UGROUPS[iv.top]}.`;
const nACS = M.filter(m => m.acs).length;
const near = (x, m) => x.pop >= m.pop*.6 && x.pop <= m.pop*1.4;
const NARROW = matchMedia("(max-width:560px)");
const SLIDERS = ["ageMin","ageMax","his","her","apps"];
let cur = M.find(m => m.short === "Memphis"), shownCur = null;

// Profile: who you are and who you're looking for
function profile(){
  const you = document.querySelector('input[name="you"]:checked').value;
  const seek = [...document.querySelectorAll('input[name="seek"]:checked')].map(x => x.value);
  const kids = document.querySelector('input[name="kids"]:checked').value;
  return {you, seek, age:numVal($("yAge")), ht:+$("yHt").value, edu:$("yEdu").value, job:$("yJob").value, kids, openP:$("openP").checked, degOnly:$("degOnly").checked, pol:picked("pol"), faith:picked("faith"), diet:$("diet").value, climate:$("climate").value};
}
function nounFor(seek){
  if (seek.length === 3) return "people";
  const n = seek.map(t => G[t].noun);
  return n.length === 1 ? n[0] : n.join(" and ");
}
// The height menu: 4'10" to 6'8"
HEIGHTS.forEach(cm => { const i = Math.round(cm/2.54);
  $("yHt").insertAdjacentHTML("beforeend", `<option value="${cm}">${Math.floor(i/12)}′${i%12}″ (${cm} cm)</option>`); });
let htSet = false; // until you pick a height, it follows the average for your gender
const defaultHt = () => heightFor(document.querySelector('input[name="you"]:checked').value);
// Chip groups (politics, faith): "Any" and the rest exclude each other, and an umbrella (Any Christian, Any
// non-religious) covers its parts, shown ticked and locked. picked() reads a group as the profile's comma list.
const CHIPS = {pol: {}, faith: {christian: CHRISTIAN.slice(1), secular: SECULAR.slice(1)}};
const boxes = n => [...document.querySelectorAll(`input[name="${n}"]`)], box = (n, v) => boxes(n).find(x => x.value === v);
function syncChips(n){
  Object.entries(CHIPS[n]).forEach(([u, subs]) => { const on = box(n, u).checked;
    subs.forEach(v => { const x = box(n, v); if (on){ x.checked = true; x.disabled = true; } else if (x.disabled){ x.disabled = false; x.checked = false; } }); });
  if (!boxes(n).some(x => x.checked)) box(n, "any").checked = true;
}
// Every politics group ticked is everyone, so it reads as Any
const picked = n => { const on = boxes(n).filter(x => x.checked && !x.disabled && x.value !== "any").map(x => x.value);
  return !on.length || (n === "pol" && on.length === boxes(n).length - 1) ? "any" : on.join(","); };
function setChips(n, v){ const on = new Set(v.split(",")); boxes(n).forEach(x => { x.disabled = false; x.checked = on.has(x.value); }); syncChips(n); }
const syncFaith = () => { syncChips("pol"); syncChips("faith"); };
["pol", "faith"].forEach(n => boxes(n).forEach(x => x.addEventListener("change", () => {
  if (x.value === "any" && x.checked) boxes(n).forEach(y => { if (y !== x){ y.checked = false; y.disabled = false; } });
  else if (x.checked) box(n, "any").checked = false;
  syncChips(n); saveProfile(); schedule();
})));
syncFaith();  // the default (Any non-religious) shows its parts as included from the start
// Links and saved profiles from before the six politics groups say "cons" for the opposite quick pick. (Their "prog"
// can't be mapped the same way: it's also today's Progressive group.)
const OLD_POL = {cons: PRESETS.opp.pol};
// One loader for every setting, from the saved profile or a shared link. get(key) returns a string or null.
function applySettings(get){
  const one = (k, ok, set) => { const v = get(k); if (v != null && ok(v)) set(v); };
  const inList = list => v => list.includes(v), num = (lo, hi) => v => v !== "" && +v >= lo && +v <= hi, bool = inList(["0","1"]);
  one("you", inList(GK), v => $("you-" + v).checked = true);
  one("seek", v => /^[wmn]+$/.test(v), v => GK.forEach(t => $("seek-" + t).checked = v.includes(t)));
  one("age", num(21, 85), v => $("yAge").value = +v);
  one("ht", v => HEIGHTS.includes(+v), v => { $("yHt").value = +v; htSet = true; });
  one("edu", inList(["ba","no"]), v => $("yEdu").value = v);
  one("job", inList(["job","less","none"]), v => $("yJob").value = v);
  one("kids", inList(["any","want","dont","have"]), v => $("kids-" + v).checked = true);
  one("openP", bool, v => $("openP").checked = v === "1");
  one("deg", bool, v => $("degOnly").checked = v === "1");
  const pol = v => v === "cons" ? OLD_POL.cons : v, keys = o => inList(Object.keys(o));
  one("pol", v => pol(v).split(",").every(keys(POLS)), v => setChips("pol", pol(v)));
  one("faith", v => v.split(",").every(keys(FAITHS)), v => setChips("faith", v));
  one("diet", keys(DIETS), v => $("diet").value = v);
  one("climate", keys(CLIMATES), v => $("climate").value = v);
}
const saved = (() => { try { return JSON.parse(store.get("atlas.profile") || "null"); } catch(e){ return null; } })();
if (saved) applySettings(k => { const v = saved[k === "deg" ? "degOnly" : k];
  return v == null ? null : Array.isArray(v) ? v.join("") : typeof v === "boolean" ? (v ? "1" : "0") : String(v); });
// A shared link carries the metro and every setting in the hash, and wins over the saved profile
const HQ = (() => { try { return new URLSearchParams(location.hash.slice(1)); } catch(e){ return new URLSearchParams(); } })();
const hNum = (k, lo, hi) => { const v = +HQ.get(k); return HQ.has(k) && v >= lo && v <= hi ? v : null; };
applySettings(k => HQ.get(k));
[["yfit", "y"], ["ry", "ry"]].forEach(([n, k]) => { const el = box(n, HQ.get(k) || store.get("atlas." + n)); if (el) el.checked = true; });
if (!htSet) $("yHt").value = defaultHt();

$("metroList").innerHTML = M.map(m => `<option value="${m.name}">`).join("");
$("statusT").textContent = nACS ? `Singles and degrees from the 2019 to 2023 ACS for ${nACS} of 387 metros` : "Singles and degrees are modeled estimates";
$("status").classList.toggle("live", !!nACS);
// Quick picks: the selected metro, then the closest metros to it by map position, rebuilt when the metro changes
let quickFor = null;
// Chip names: the short name, with its state when another metro shares it (Jackson, MS and Jackson, TN)
const SHORTN = new Map(M.map(x => { const n = x.short, dup = M.some(y => y !== x && y.short === x.short);
  return [x, dup ? `${n}, ${x.name.slice(x.name.lastIndexOf(", ") + 2).split("-")[0]}` : n]; }));
function quickPicks(m){
  if (quickFor === m) return; quickFor = m;
  // Bigger metros count as a bit closer, so a regional center isn't crowded out by small neighbors. Alaska and Hawaii
  // sit in map insets, so their distances to the other states mean nothing: they only pair within their own state.
  const st = x => x.name.slice(x.name.lastIndexOf(", ") + 2), inset = x => /^(AK|HI)$/.test(st(x));
  const c = MAPXY[m.name], d = x => { const p = MAPXY[x.name]; return c && p ? Math.hypot(p[0] - c[0], p[1] - c[1])/Math.pow(x.pop, .25) : Infinity; };
  const near = M.filter(x => x !== m && MAPXY[x.name] && (inset(m) || inset(x) ? st(x) === st(m) : true)).sort((a, b) => d(a) - d(b)).slice(0, 8);
  $("quick").replaceChildren(Object.assign(document.createElement("span"), {className: "qlbl", textContent: "Nearby"}), ...[m, ...near].map(x => {
    const b = document.createElement("button"); b.type = "button"; b.textContent = SHORTN.get(x);
    b.setAttribute("aria-pressed", x === m); b.onclick = () => select(x); return b; }));
}

// A number field's value as a whole number in its range; mid-typing values ("7" on the way to 70) are clamped
function numVal(el){ return Math.min(+el.max, Math.max(+el.min, Math.round(+el.value || +el.defaultValue))); }
function S(){ const s = {deg: $("degOnly").checked}; SLIDERS.forEach(k => s[k] = numVal($(k)));
  if (s.ageMax <= s.ageMin){ s.ageMax = s.ageMin + 1; $("ageMax").value = s.ageMax; } return s; }

// Sex ratio shown from your side when you're a man or woman looking only for the other binary gender
function sexView(P){
  if (P.seek.length === 1 && P.you === "w" && P.seek[0] === "m") return {inv:true, label:"men per woman"};
  return {inv:false, label:"women per man"};
}

function select(m){ cur = m; store.set("atlas.metro", m.name); $("metro").value = m.name; update(); }
function resetClicks(){ const D = clickDefaults(profile()); ["his","her","apps"].forEach(k => $(k).value = Math.round(D[k])); }
$("metro").addEventListener("change", e => { const q = e.target.value.trim().toLowerCase();
  const m = byName.get(q) || (q && M.find(x => x.name.toLowerCase().includes(q)));
  if (m) select(m); else e.target.value = cur.name; });

// Keep the hash in step with the page so the address bar always holds a link to this result
let hashT = 0;
function writeHash(s, P){
  clearTimeout(hashT);
  hashT = setTimeout(() => { const q = new URLSearchParams({m:cur.name, you:P.you, seek:P.seek.join(""), age:P.age, ht:P.ht, edu:P.edu, job:P.job, kids:P.kids,
    openP:+P.openP, deg:+P.degOnly, pol:P.pol, faith:P.faith, diet:P.diet, climate:P.climate, ageMin:s.ageMin, ageMax:s.ageMax, his:s.his, her:s.her, apps:s.apps, y:document.querySelector('input[name="yfit"]:checked').value, ry:document.querySelector('input[name="ry"]:checked').value});
    try { history.replaceState(null, "", "#" + q); } catch(e){} }, 250);
}
$("share").addEventListener("click", () => {
  const url = location.href, btn = $("share"), done = t => { btn.textContent = t; setTimeout(() => btn.textContent = "Copy link to this result", 2000); };
  (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => done("Link copied"), () => { window.prompt("Copy this link", url); });
});
$("resetAll").addEventListener("click", () => {
  $("refine").reset(); syncFaith(); htSet = false; rangeOff = null; $("yHt").value = defaultHt();  // the form's own defaults are the default profile
  document.querySelector('input[name="yfit"][value="pct"]').checked = true; store.set("atlas.yfit", "pct");
  document.querySelector('input[name="ry"][value="rent"]').checked = true; store.set("atlas.ry", "rent");
  saveProfile(); resetClicks(); update();
});

const saveProfile = () => { const p = profile(); if (!htSet) delete p.ht; store.set("atlas.profile", JSON.stringify(p)); };
document.querySelectorAll('input[name="you"],input[name="seek"]').forEach(el => el.addEventListener("change", () => {
  if (!document.querySelector('input[name="seek"]:checked')) el.checked = true; // keep at least one
  if (!htSet) $("yHt").value = defaultHt();
  saveProfile(); resetClicks(); update();
}));
$("yHt").addEventListener("change", () => htSet = true);
// Your age carries the age range you're looking for with it, keeping its gap from your age as of the last
// time you set the range, so a trip into the sliders' limits and back restores it
M.slice().sort((a, b) => a.name.localeCompare(b.name)).forEach(x => $("cmpSel").add(new Option(x.name, x.i)));
$("cmpSel").addEventListener("change", update);
// Nearest metro to the viewer's location: their position goes through the same Albers USA projection as the map
// (loaded only on click), then the closest metro center wins. The position is never stored or sent anywhere.
$("geoBtn").addEventListener("click", () => {
  const say = t => { $("geoMsg").hidden = !t; $("geoMsg").textContent = t; };
  if (!navigator.geolocation) return say("This browser can't share a location. Type your metro instead.");
  $("geoBtn").disabled = true; say("Finding you…");
  navigator.geolocation.getCurrentPosition(async pos => {
    try {
      const {geoAlbersUsa} = await import("https://cdn.jsdelivr.net/npm/d3-geo@3.1.1/+esm");
      const xy = geoAlbersUsa().scale(1300).translate([487.5, 305])([pos.coords.longitude, pos.coords.latitude]);
      if (!xy) return say("You look to be outside the U.S. Type a metro instead.");
      let best = null, bd = Infinity;
      M.forEach(x => { const c = MAPXY[x.name]; if (c){ const d = Math.hypot(c[0] - xy[0], c[1] - xy[1]); if (d < bd){ bd = d; best = x; } } });
      select(best); say(`Closest metro: ${best.name}.`);
    } catch(e){ say("Couldn't work out your metro. Type it instead."); }
    finally { $("geoBtn").disabled = false; }
  }, err => { $("geoBtn").disabled = false;
    // A refusal won't change this visit (and inside an embedding frame that blocks location it comes without a prompt), so drop the button
    if (err.code === 1){ $("geoBtn").hidden = true; return say("Location isn't available here. Type your metro instead."); }
    say("Couldn't get your location. Type your metro instead."); },
  {maximumAge: 600000, timeout: 15000});
});
// Hide the button up front where the browser already says location is off: a frame without the geolocation
// permission (Chromium's featurePolicy) or a denied permission (Permissions API, Chromium and recent Safari)
if (!navigator.geolocation || document.featurePolicy?.allowsFeature?.("geolocation") === false) $("geoBtn").hidden = true;
else navigator.permissions?.query({name: "geolocation"}).then(st => { if (st.state === "denied") $("geoBtn").hidden = true; }, () => {});
// Number fields: only a whole value in range reaches the page while typing; leaving the field snaps it into
// range. The − and + buttons step it. Registered before any other listener on these fields, so it runs first.
["yAge", ...SLIDERS].forEach(k => { const el = $(k);
  el.addEventListener("input", e => { if (el.value === "" || !el.validity.valid) e.stopImmediatePropagation(); });
  el.addEventListener("change", () => { const v = String(numVal(el)); if (v !== el.value){ el.value = v; el.dispatchEvent(new Event("input")); } });
});
document.querySelectorAll(".sb").forEach(b => b.addEventListener("click", () => {
  const el = $(b.dataset.for); el.value = numVal(el) + +b.dataset.d; el.value = numVal(el); el.dispatchEvent(new Event("input")); }));
// A hint's Reset link puts its % back to the default for this profile. One listener, since update() redraws the hints
$("refine").addEventListener("click", e => { const k = e.target.dataset?.r; if (k){ $(k).value = Math.round(clickDefaults(profile())[k]); update(); } });
let rangeOff = null;
$("yAge").addEventListener("input", () => {
  if (!LAST) return;
  rangeOff = rangeOff || [LAST.s.ageMin - LAST.age, LAST.s.ageMax - LAST.age];
  const a = +$("yAge").value, clamp = (el, v) => Math.min(+el.max, Math.max(+el.min, v));
  $("ageMin").value = clamp($("ageMin"), a + rangeOff[0]); $("ageMax").value = clamp($("ageMax"), a + rangeOff[1]);
});
["ageMin","ageMax"].forEach(k => $(k).addEventListener("input", () => rangeOff = null));
["yAge","yHt","yEdu","yJob","openP","degOnly","diet","climate"].forEach(id => $(id).addEventListener(id === "yAge" ? "input" : "change", () => { saveProfile(); schedule(); }));
["yfit","ry"].forEach(n => document.querySelectorAll(`input[name="${n}"]`).forEach(el => el.addEventListener("change", () => { store.set("atlas." + n, el.value); drawCharts(); if (LAST) writeHash(LAST.s, LAST.P); })));
document.querySelectorAll('input[name="kids"]').forEach(el => el.addEventListener("change", () => { saveProfile(); update(); }));
document.querySelectorAll('input[name="preset"]').forEach(el => el.addEventListener("change", () => {
  Object.entries(PRESETS[el.value]).forEach(([k, v]) => setChips(k, v)); saveProfile(); update(); }));

function update(){
  const s = S(), m = cur, P = profile(), who = nounFor(P.seek), sv = sexView(P);
  quickPicks(m);

  const b = blends(m, s, P);
  const sg = P.seek.reduce((t, g) => { const x = base(m, g, s); return [t[0] + x.single, t[1] + x.age]; }, [0, 0]);
  $("singleO").textContent = Math.round(sg[0]/sg[1]*100) + "%";
  $("singleHint").textContent = m.acs ? `From ACS counts of never-married, divorced and widowed people in ${m.short}, less about 15% who live with a partner.` : `Modeled for ${who} aged ${s.ageMin} to ${s.ageMax}: not married and not living with a partner, about half of women this age and a few points more for men.`;
  $("eduO").textContent = Math.round(b.edu) + "%"; $("valuesO").textContent = pct(b.val);
  $("eduHint").textContent = `Estimate for ${who} aged ${s.ageMin} to ${s.ageMax} in ${m.short}.${s.deg ? "" : " Not used as a filter."}`;
  Object.entries(PRESETS).forEach(([k, v]) => $("preset-" + k).checked = Object.entries(v).every(([f, x]) => P[f] === x));
  $("valuesL").textContent = valuesLabel(P) || "Any politics or faith";
  $("rbSum").textContent = `${cap(G[P.you].one)}, ${P.age} · ${cap(who)} ${s.ageMin} to ${s.ageMax} · ` +
    `${valuesLabel(P) || "Any politics or faith"}${P.diet !== "any" ? " · " + DIETS[P.diet] : ""}${P.climate !== "any" ? " · " + CLIMATES[P.climate] : ""}${s.deg ? "" : " · Any education"}`;
  const vote = `the 2024 Harris share (${m.dem}%${m.demNote ? ", statewide" : ""}) with CES politics`, F = m.faith;
  const note = f => f === "secular" ? `${m.none}% with no religion and ${m.adh}% in a congregation`
    : SECULAR.includes(f) ? `${m.none}% with no religion here and CES's share of the non-religious who say ${FAITHS[f].toLowerCase()}`
    : f === "pagan" ? "about 0.3% nationally, scaled by the local share of other religions"
    : F ? `PRRI's estimate that ${+faithPct(F, f).toFixed(2)}% of adults here are ${FAITHS[f]}` : "no PRRI estimate for this metro";
  const faithNote = P.faith === "any" ? "" : [...new Set(faithList(P).map(note))].join(", ");
  const parts = [P.pol !== "any" ? vote : "", faithNote].filter(Boolean);
  $("valuesHint").textContent = parts.length ? `Modeled for ${m.short} from ${parts.join(" and ")}.` : `Not used as a filter.`;
  $("dietHint").textContent = P.diet === "any" ? "Not used as a filter." : P.diet === "kosher" ? `About ${pct(b.diet)} of them. 17% of Jewish Americans keep kosher at home.`
    : P.diet === "halal" ? `About ${pct(b.diet)} of them. 83% of Muslim Americans only buy halal or prefer it.`
    : `About ${pct(b.diet)} of them, from national rates by gender${P.pol !== "any" ? " and politics" : ""}.${P.diet === "pesc" ? " Counts vegetarians too." : ""}`;
  const D = clickDefaults(P), rst = k => s[k] !== Math.round(D[k]) ? ` <button type="button" data-r="${k}">Reset</button>` : "";
  $("hisHint").innerHTML = `Speed-dating data suggest about 35% for men and 25% for women judging the people they meet. Default for you: ${Math.round(D.his)}%.` + rst("his");
  $("appsHint").innerHTML = `Share of singles looking to date who are on an app now. Pew found 28% in 2022, so about ${Math.round(D.apps)}% for the ${who} you picked${P.seek.some(t => appsRate(t, P) > APPS[t]) ? ", with LGB singles at about 1.5 times the rate" : ""}.` + rst("apps");

  // Everything the pool needs that doesn't depend on the metro, computed once per update
  const T = poolCtx(s, P, D);
  const f = pool(m, s, P, T);
  const all = M.map(x => { const r = x === m ? f : pool(x, s, P, T); return {m:x, v:r.click, apps:r.apps, vals:r.vals, ratio:r.ratio, sex: sv.inv ? 1/r.sexWM : r.sexWM, rent: rentShare(x, P)}; });
  // Where to look: metros with your climate, and always the selected one. Ranks stay out of all 387.
  const fits = x => x === m || P.climate === "any" || climateOf(x) === P.climate, cand = all.filter(a => fits(a.m));
  const nClim = all.filter(a => climateOf(a.m) === P.climate).length;
  $("climateHint").textContent = (m.clim ? `${m.short}: January averages ${Math.round(m.clim[0])}°F and July ${Math.round(m.clim[1])}°F, so it has ${CLIMATES[climateOf(m)].toLowerCase()}. ` : "") +
    (P.climate === "any" ? "Pick one to show only metros with that climate." : `${nClim} of 387 metros have ${CLIMATES[P.climate].toLowerCase()}. The map, ranked list and comparisons show only those${climateOf(m) !== P.climate ? `, plus ${m.short}` : ""}.`);
  const byPool = [...all].sort((a,b) => b.v - a.v), byCand = byPool.filter(a => fits(a.m)), byRatio = [...all].sort((a,b) => b.ratio - a.ratio);
  const rank = 1 + all.filter(a => a.v > f.click).length, rRank = byRatio.findIndex(a => a.m === m) + 1;
  const iv = interval(m, s, P, f);
  // The funnel rerun for one year of age at a time, across the range the sliders allow
  const byAge = [];
  for (let a = +$("ageMin").min; a <= +$("ageMax").max; a++){
    const sa = {...s, ageMin:a, ageMax:a};
    byAge.push({a, v: pool(m, sa, P, poolCtx(sa, P, D)).click});
  }
  $("sPool").textContent = fmt(f.click); $("sApps").textContent = fmt(f.apps); $("sRank").textContent = f.click ? "#" + rank : "–";
  $("sRankL").textContent = f.click ? "of 387 metros by number of possibilities" : "no rank: no one here fits these filters";
  $("sPoolL").textContent = `real possibilities in ${m.short}`;
  $("sRange").textContent = iv ? rangeText(iv) : "";
  $("sRatio").textContent = fmt1(f.ratio);
  const rs = rentShare(m, P), pay = P.edu === "ba" ? "pay for someone with a bachelor's" : "pay for someone with some college";
  const byRent = all.filter(a => a.rent === a.rent).sort((a,b) => a.rent - b.rent), hRank = byRent.findIndex(a => a.m === m) + 1;
  $("sRent").textContent = rs === rs ? rs + "%" : "n/a";
  $("sRentC").classList.toggle("burden", rs > BURDEN);
  $("sRentL").textContent = rs === rs ? `of ${P.edu === "ba" ? "a grad's" : "typical"} pay for a 1-bed at $${fmt(m.house[0])}/mo, #${hRank} of 387 for affordability` : "no rent data for this metro";
  $("miniM").textContent = m.short; $("miniP").textContent = fmt(f.click); $("miniR").textContent = fmt1(f.ratio);
  $("sRatioL").textContent = `${who === "people" ? "possible partners" : who} for every person looking for them, #${rRank} of 387`;

  const fx = f.fx, xs = [["age", "your age"], ["ht", "your height"], ["edu", "your education"], ["job", "your work situation"], ["kids", "having kids"]]
    .filter(([k]) => Math.abs(fx[k] - 1) > .005).map(([, l]) => l);
  const herEff = Math.round(Math.min(95, s.her*fx.all)), tl = xs.length > 1 ? xs.slice(0, -1).join(", ") + " and " + xs[xs.length - 1] : xs[0];
  $("herHint").innerHTML = `For someone their own age, of average height, with a degree, a steady job and no kids. Default for the ${who} you picked: ${Math.round(D.her)}%. ` +
    (xs.length ? (herEff === s.her ? `${cap(tl)} barely change${xs.length > 1 || tl === "having kids" ? "" : "s"} it.` :
      `${cap(tl)} ${herEff < s.her ? "lower" : "raise"}${xs.length > 1 || tl === "having kids" ? "" : "s"} it from ${s.her}% to about ${herEff}%.`) : "Your traits match that.") + rst("her");
  const openTo = `Open to dating a ${G[P.you].one}`;
  const pc = (a, b) => b ? `×${pct(a/b*100)}` : "";
  // The funnel steps, shared by the funnel and the comparison: [label, count from a metro and its pool, phase, shown, cut note].
  // Without a note, a step's cut is its keep rate from the step before, shown or not.
  const allSteps = [["Everyone in the metro", x => x.pop, 0, true, ""],
    [cap(who), (x, r) => r.total, 0, P.seek.length < 3],
    [`Ages ${s.ageMin} to ${s.ageMax}`, (x, r) => r.age, 0, true, m.acs ? "ACS" : `${s.ageMax - s.ageMin + 1} yrs`],
    ["Single", (x, r) => r.single, 1, true],
    ["Unattached and looking to date", (x, r) => r.look, 1, true],
    ["Bachelor's or higher", (x, r) => r.deg, 1, s.deg],
    [openTo, (x, r) => r.open, 2, true],
    [valuesStep(P), (x, r) => r.vals, 2, !!valuesLabel(P)],
    [DIETS[P.diet], (x, r) => r.diet, 2, P.diet !== "any"],
    ["Compatible on kids", (x, r) => r.kids, 2, Math.abs(f.kids - f.diet) > .5],
    ["Mutual attraction", (x, r) => r.click, 3, true],
    ["On the apps now", (x, r) => r.apps, 3, true]]
    .map(([t, get, ph, show, note]) => ({t, full: t === valuesStep(P) ? `${t}: ${valuesLabel(P)}` : t, get, ph, show, v: get(m, f), note}));
  allSteps.forEach((r, i) => { if (r.note == null) r.note = pc(r.v, allSteps[i - 1].v); });
  const rows = allSteps.filter(r => r.show);
  // Each funnel step: [label, count, cut note, phase]
  const steps = rows.map(r => [r.t, r.v, r.note, r.ph, r.full]);
  $("funnelTitle").textContent = `The funnel in ${m.short}`;
  $("funnelSub").textContent = `How ${fmt(m.pop)} people narrow to ${fmt(f.click)} possibilities.`;
  // Widths on a log scale from 1 person to the whole metro, so every stage stays visible
  const lmax = Math.log10(m.pop), wd = v => Math.max(4, Math.log10(Math.max(1, v))/lmax*100);
  const end = PHASES.map((_, p) => steps.filter(st => st[3] === p).pop());
  $("phases").innerHTML = PHASES.map((ph, p) => `<span class="ph"><i style="background:${ph.c}"></i>${ph.name} <b>${fmt(end[p][1])}</b></span>`).join('<span class="arr" aria-hidden="true">→</span>');
  FSTEPS = steps.map(st => ({w: wd(st[1]), c: PHASES[st[3]].c, ph: st[3]}));
  $("funnel").innerHTML = steps.map((st, i) => {
    const last = i === steps.length - 1 ? " last" : "";
    const tag = i === 0 || st[3] !== steps[i-1][3] ? `<div class="ptag">${PHASES[st[3]].name}</div>` : "";
    return `${tag}<div class="lab${last}"><span${st[4] !== st[0] ? ` title="${st[4]}"` : ""}>${st[0]}</span><span class="cut">${st[2] && st[2][0] === "×" ? "keeps " + st[2].slice(1) : st[2]}</span></div>` +
      `<div class="fseg" aria-hidden="true"></div><div class="c${last}">${fmt(st[1])}</div>`;
  }).join("");
  drawFunnel();

  const peer = byCand.find(a => a.m !== m && near(a.m, m)), withC = P.climate === "any" ? "" : " with " + CLIMATES[P.climate].toLowerCase();
  const edu = s.deg ? "single, looking, degree-holding" : "single, looking";
  // How many times your pool another metro's is. Every use checks f.click first: an empty pool has nothing to divide by.
  const times = v => fmtX(v/f.click);
  const many = (v, none, pre = "") => f.click ? `${pre}about <strong>${times(v)}×</strong> as many` : none;
  $("readout").innerHTML = `About <strong>${fmt(f.click)}</strong> ${who} in the ${m.name} metro fit what you're looking for, and about <strong>${fmt(f.apps)}</strong> of them are on the apps right now. ` +
    (peer && peer.v > f.click ? `Among metros of similar size${withC}, ${peer.m.short} has ${many(peer.v, "more")}.` : byCand[0].m === m || !byCand[0].v ? `No metro${withC} has more.` : `No metro of similar size${withC} has more. ${byCand[0].m.short} has the most${many(byCand[0].v, "", ", ")}.`);

  const scope = $("scope").value, sort = $("sort").value;
  let set = scope === "near" ? new Set(M.filter(x => near(x, m))) : new Set(TOP.slice(0, +scope));
  set.add(m);
  const key = sort === "pool" ? "v" : sort;
  const ordered = sort === "pool" ? byPool : sort === "ratio" ? byRatio : sort === "rent" ? [...byRent, ...all.filter(a => a.rent !== a.rent)] : [...all].sort((a,b) => b.sex - a.sex);
  ordered.forEach((a, i) => a.rk = i + 1);
  const shown = ordered.filter(a => set.has(a.m) && fits(a.m));
  const maxK = Math.max(...shown.map(a => a[key] || 0));
  $("ranked").classList.toggle("byrent", sort === "rent");
  const rcol = sort === "sex" ? "sex" : "ratio";
  $("ratioH").textContent = sort === "sex" ? (sv.inv ? "M per W" : "W per M") : "Odds";
  const rk = byPool.findIndex(a => a.m === m) + 1;
  $("qRankA").textContent = rk === 1 ? `${m.short} has the most possibilities of all ${all.length} metros.`
    : `${m.short} ranks #${rk} of ${all.length} metros for possibilities. ${byPool[0].m.short} has the most.`;
  $("listNote").textContent = sort === "pool"
    ? `Ranked by possibilities with your settings. Odds is how many ${who} there are for each person looking for them; the last column is each pool against yours.`
    : sort === "ratio"
    ? `Ranked by least competition: how many ${edu} ${who} in your age range there are for every ${edu} person of any gender open to dating them. Higher is better for you.`
    : sort === "rent"
    ? `Ranked by housing cost, cheapest first: a recent mover's 1-bedroom rent as a share of the typical ${pay} in that metro. Above 30% is cost-burdened by HUD's standard.`
    : `Ranked by gender balance: ${edu} ${sv.label} in your age range. ${nACS ? "" : "Without ACS data this only varies with the local degree gap, so treat it as a placeholder."}`;
  $("listNote").textContent += " Tap a row to switch to that metro.";
  $("list").innerHTML = shown.map(a => `<button type="button" class="crow${a.m === m ? " on" : ""}" data-i="${a.m.i}" aria-label="#${a.rk} ${a.m.name}: pool ${fmt(a.v)}, ${rcol === "sex" ? sv.label : `${who} per person looking for them`} ${fmt2(a[rcol])}${a.rent === a.rent ? `, rent ${a.rent}% of pay` : ""}${a.m === m ? ", selected" : f.click ? `, ${times(a.v)} times yours` : ""}"><span class="rk">${a.rk}</span><span class="nm" title="${a.m.name}">${a.m.short}, ${a.m.name.slice(a.m.name.lastIndexOf(", ") + 2, a.m.name.lastIndexOf(", ") + 4)}</span><span class="cb"><i style="width:${Math.max(.5, maxK ? a[key]/maxK*100 : 0)}%"></i></span><span class="v">${fmt(a.v)}</span><span class="r">${fmt2(a[rcol])}</span><span class="h${a.rent > BURDEN ? " hi" : ""}">${a.rent === a.rent ? a.rent + "%" : "–"}</span><span class="x">${a.m === m ? "you" : f.click ? times(a.v) + "×" : "–"}</span></button>`).join("");
  const onRow = $("list").querySelector(".crow.on"), lst = $("list");
  if (onRow && shownCur !== m){ lst.scrollTop = Math.max(0, onRow.offsetTop - lst.offsetTop - lst.clientHeight/2); shownCur = m; }

  const cm = $("cmpSel").value !== "" ? M[+$("cmpSel").value] : (peer || byCand.find(a => a.m !== m) || byPool.find(a => a.m !== m)).m;
  const cf = cm === m ? f : pool(cm, s, P, T);
  const cmp = {cm, rows: rows.map(r => ({t: r.t, full: r.full, a: r.v, b: r.get(cm, cf)}))};
  LAST = {m, all: cand, who, s, P, iv, est: f.click, byAge, age: P.age, cmp};
  drawCharts();
  writeHash(s, P);
}

new ResizeObserver(() => drawFunnel()).observe($("funnel"));
// A closed section draws nothing; opening it draws its charts at their real width
document.querySelectorAll(".qsec").forEach(d => d.addEventListener("toggle", drawCharts));
$("qRank").addEventListener("toggle", () => { shownCur = null; update(); });  // the list can only scroll to your metro once it's open
new ResizeObserver(() => { const k = `${mapNarrow()}${plotNarrow()}`; if (k !== sizeKey){ sizeKey = k; drawCharts(); } }).observe($("viz"));
$("map").addEventListener("pointermove", e => {
  const h = mapHit(e), tip = $("mapTip"); if (!tip) return;
  $("map").querySelectorAll("circle.hov").forEach(c => c.classList.remove("hov"));
  if (!h){ tip.hidden = true; return; }
  const c = $("map").querySelector(`circle[data-i="${h.a.m.i}"]`); if (c) c.classList.add("hov");
  const box = $("map").getBoundingClientRect(), f = box.width/975;
  tip.innerHTML = `<b>${h.a.m.short}</b><br>${fmt(h.a.apps)} on the apps now · ${fmt(h.a.v)} possibilities`;
  tip.style.left = Math.min(box.width - 90, Math.max(90, h.x*f)) + "px"; tip.style.top = (h.y - h.r)*f + "px"; tip.hidden = false;
});
$("map").addEventListener("pointerleave", () => { const tip = $("mapTip"); if (tip) tip.hidden = true; });
$("map").addEventListener("click", e => { const h = mapHit(e); if (h) select(h.a.m); });
// Holding a key on a number field fires input faster than a full update; coalesce to one update per frame
let raf = 0;
const schedule = () => { raf = raf || requestAnimationFrame(() => { raf = 0; update(); }); };
SLIDERS.forEach(k => $(k).addEventListener("input", schedule));
// One click handler each for the list rows and each scatter's dots
$("list").addEventListener("click", e => { const t = e.target.closest("[data-i]"); if (t) select(M[+t.dataset.i]); });
// Dots are small on a phone, so a tap picks the nearest dot within reach
[["plot", () => PTS], ["rplot", () => RPTS]].forEach(([id, pts]) => $(id).addEventListener("click", e => {
  const t = e.target.closest("[data-i]"); if (t) return select(M[+t.dataset.i]);
  const svg = $(id).querySelector("svg"); if (!svg) return;
  const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
  let best = null, bd = 18*18;
  pts().forEach(([x, px, py]) => { const d = (px - pt.x)**2 + (py - pt.y)**2; if (d < bd){ bd = d; best = x; } });
  if (best) select(best);
}));
NARROW.addEventListener("change", update);
if (NARROW.matches) document.querySelectorAll("#refine .sec").forEach(d => d.open = false);
["scope","sort"].forEach(id => $(id).addEventListener("change", () => { shownCur = null; update(); }));
resetClicks();
SLIDERS.forEach(k => { const el = $(k); if (hNum(k, +el.min, +el.max) !== null) el.value = hNum(k, +el.min, +el.max); });
// Starting metro: a shared link's, else the last one picked here, else the biggest metro in the browser's time zone
// (no prompt, nothing sent), else Memphis. Where location is already allowed, the nearest metro replaces the guess.
const TZM = {"America/New_York":"New York", "America/Detroit":"Detroit", "America/Indiana/Indianapolis":"Indianapolis",
  "America/Kentucky/Louisville":"Louisville", "America/Chicago":"Chicago", "America/Denver":"Denver", "America/Boise":"Boise",
  "America/Phoenix":"Phoenix", "America/Los_Angeles":"Los Angeles", "America/Anchorage":"Anchorage", "Pacific/Honolulu":"Urban Honolulu"};
const pickedM = (HQ.get("m") || store.get("atlas.metro") || "").toLowerCase();
if (byName.has(pickedM)) cur = byName.get(pickedM);
else { const tz = TZM[Intl.DateTimeFormat().resolvedOptions().timeZone]; cur = (tz && M.find(x => x.name.startsWith(tz))) || cur;
  navigator.permissions?.query({name: "geolocation"}).then(st => { if (st.state === "granted") $("geoBtn").click(); }, () => {}); }
$("metro").value = cur.name; update();

// Guided setup for first visits: three short steps that borrow the page's own controls, then hand back to
// the full page. Visitors with a saved profile or a shared link skip it.
const STEPS = [
  {t:"Start with you", help:"Who you are sets who's likely to be open to dating you, and how your age plays into it.", ids:["g-you","g-age"]},
  {t:"Who are you looking for?", help:"Pick the genders and ages you date, and the politics, faith and diet you want them to share. Quick picks fill in politics and faith.",
   ids:["g-seek","g-ages","g-preset","g-pol","g-faith","g-diet"]},
  {t:"Where are you looking?", help:"Type one of 387 U.S. metros, tap a city, or use your location. Pick a climate to see only metros that have it. You can switch either anytime.", ids:["g-pick","g-climate"]}];
let stepI = -1;
const homes = new Map();  // borrowed element -> placeholder marking where it lives on the page
function borrow(ids){
  const body = $("setupBody"); body.innerHTML = "";
  ids.forEach(id => { const el = $(id); if (!homes.has(el)){ const ph = document.createComment(id); el.before(ph); homes.set(el, ph); } body.appendChild(el); });
}
function giveBack(){ homes.forEach((ph, el) => ph.replaceWith(el)); homes.clear(); }
function showStep(i){
  giveBack(); stepI = i; const st = STEPS[i];
  $("setupStep").textContent = `Step ${i + 1} of ${STEPS.length}`;
  $("setupT").textContent = st.t; $("setupHelp").textContent = st.help;
  borrow(st.ids);
  $("setupBack").disabled = i === 0;
  $("setupNext").textContent = i === STEPS.length - 1 ? "Show my results" : "Next";
  // Reuse the dots so the current one can grow into a pill (a CSS transition) instead of being redrawn
  if ($("setupDots").children.length !== STEPS.length) $("setupDots").innerHTML = STEPS.map(() => "<i></i>").join("");
  [...$("setupDots").children].forEach((d, j) => { d.classList.toggle("on", j <= i); d.classList.toggle("cur", j === i); });
  $("setupT").focus();
}
// Motion: steps slide out the way you're going and the next one slides in, its title, help and fields
// arriving one after another while the card eases to its new height. Reduced motion gets instant changes.
const REDUCE = matchMedia("(prefers-reduced-motion: reduce)"), EASE = "cubic-bezier(.2,.7,.2,1)";
let busy = false;  // ignore clicks while a step is leaving, so a double tap can't skip one
const arrive = (els, dx, dy, base = 0) => els.forEach((el, k) => el.animate(
  [{opacity: 0, transform: `translate(${dx}px, ${dy}px)`}, {opacity: 1, transform: "none"}],
  {duration: 380, delay: base + 45*k, easing: EASE, fill: "backwards"}));
const stepParts = () => [$("setupT"), $("setupHelp"), ...$("setupBody").children];
async function goStep(i){
  if (busy || i === stepI) return;
  if (REDUCE.matches) return showStep(i);
  busy = true;
  const dir = i > stepI ? 1 : -1, card = $("setup"), out = [$("setupT"), $("setupHelp"), $("setupBody")], h0 = card.offsetHeight;
  await Promise.all(out.map(el => el.animate([{opacity: 1, transform: "none"}, {opacity: 0, transform: `translateX(${-28*dir}px)`}],
    {duration: 170, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards"}).finished));
  showStep(i);
  out.forEach(el => el.getAnimations().forEach(a => a.cancel()));
  const h1 = card.offsetHeight;
  card.style.overflow = "hidden";
  card.animate([{height: h0 + "px"}, {height: h1 + "px"}], {duration: 320, easing: EASE}).finished.then(() => card.style.overflow = "");
  arrive(stepParts(), 28*dir, 0);
  busy = false;
}
function startSetup(){
  document.body.classList.add("onboarding"); $("setup").hidden = false; stepI = -1; showStep(0); window.scrollTo(0, 0);
  if (!REDUCE.matches){ $("setup").animate([{opacity: 0, transform: "translateY(16px) scale(.985)"}, {opacity: 1, transform: "none"}], {duration: 480, easing: EASE});
    arrive(stepParts(), 0, 10, 120); }
}
async function finishSetup(){
  if (busy) return;
  if (!REDUCE.matches){ busy = true;
    await $("setup").animate([{opacity: 1, transform: "none"}, {opacity: 0, transform: "translateY(-10px) scale(.985)"}], {duration: 220, easing: "cubic-bezier(.4,0,1,1)", fill: "forwards"}).finished;
    $("setup").getAnimations().forEach(a => a.cancel()); busy = false; }
  giveBack(); $("setup").hidden = true; document.body.classList.remove("onboarding");
  store.set("atlas.onboarded", "1"); saveProfile(); update();
  window.scrollTo(0, 0);
  if (!REDUCE.matches) arrive([...document.querySelectorAll(".wrap > .pick, .grid > *")].slice(0, 4), 0, 14);
}
$("setupNext").addEventListener("click", () => stepI < STEPS.length - 1 ? goStep(stepI + 1) : finishSetup());
$("setupBack").addEventListener("click", () => stepI > 0 && goStep(stepI - 1));
$("setupSkip").addEventListener("click", finishSetup);
$("rerunSetup").addEventListener("click", startSetup);
if (!HQ.toString() && !store.get("atlas.profile") && !store.get("atlas.onboarded")) startSetup();
