// Drawing the funnel, the map and the charts from the last update (LAST). Uses the page helpers in app.js,
// which loads after this file but before anything here runs.
let PTS = [];
// The funnel is one continuous shape behind the rows: each step's width sits at its row's middle, joined by
// curves with vertical tangents, filled with a gradient that blends from one phase color to the next
let FSTEPS = [];
function drawFunnel(){
  const fun = $("funnel"), segs = [...fun.querySelectorAll(".fseg")];
  if (!segs.length || segs.length !== FSTEPS.length) return;
  const fb = fun.getBoundingClientRect(), s0 = segs[0].getBoundingClientRect(), W = s0.width, H = fb.height, cx = W/2;
  if (!W) return;
  const svg = $("fshape"); svg.style.left = (s0.left - fb.left) + "px";
  svg.setAttribute("width", W); svg.setAttribute("height", H); svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const rows = segs.map((el, i) => { const r = el.getBoundingClientRect(); return {...FSTEPS[i], t: r.top - fb.top, b: r.bottom - fb.top, w: Math.max(6, FSTEPS[i].w/100*W)}; });
  // Smooth the step widths into one gentle taper: a Gaussian-weighted local-linear fit through the row middles,
  // sampled at a fixed number of points (so the outline animates between settings) and kept non-increasing
  const pts = [[rows[0].t, rows[0].w], ...rows.map(r => [(r.t + r.b)/2, r.w]), [rows[rows.length - 1].b, rows[rows.length - 1].w*.85]];
  const y0 = pts[0][0], y1 = pts[pts.length - 1][0], bw = 1.1*(y1 - y0)/rows.length, NK = 36;
  const fit = y => { let S = 0, Sx = 0, Sy = 0, Sxx = 0, Sxy = 0;
    pts.forEach(([py, pw]) => { const q = Math.exp(-(((py - y)/bw)**2)/2), dx = py - y; S += q; Sx += q*dx; Sy += q*pw; Sxx += q*dx*dx; Sxy += q*dx*pw; });
    const det = S*Sxx - Sx*Sx; return det > 1e-9 ? (Sy*Sxx - Sx*Sxy)/det : Sy/S; };
  const k = []; let wPrev = Infinity;
  for (let i = 0; i < NK; i++){ const y = y0 + (y1 - y0)*i/(NK - 1); wPrev = Math.max(4, Math.min(wPrev, fit(y), W)); k.push([y, wPrev]); }
  // Monotone cubic (Fritsch-Carlson) through the knots, so the edge tapers without bulges; flat at the top
  const n = k.length, dl = k.slice(1).map(([y, w], i) => (w - k[i][1])/(y - k[i][0])), m = k.map((_, i) =>
    i === 0 ? 0 : i === n - 1 ? dl[n - 2] : dl[i-1]*dl[i] <= 0 ? 0 : 2/(1/dl[i-1] + 1/dl[i]));
  const f = v => v.toFixed(1), seg = (sg, i, j) => { const [y0, w0] = k[i], [y1, w1] = k[j], h = (y1 - y0)/3;
    return `C${f(cx + sg*(w0 + m[i]*h)/2)},${f(y0 + h)} ${f(cx + sg*(w1 - m[j]*h)/2)},${f(y1 - h)} ${f(cx + sg*w1/2)},${f(y1)}`; };
  // Down the left edge, across the bottom, back up the right edge
  const down = k.slice(1).map((_, i) => seg(-1, i, i + 1)).join(" ");
  const up = k.slice(1).map((_, i) => seg(1, n - 1 - i, n - 2 - i)).join(" ");
  const d = `M${f(cx - k[0][1]/2)},${f(k[0][0])} ${down} L${f(cx + k[n-1][1]/2)},${f(k[n-1][0])} ${up} Z`;
  $("fbody").setAttribute("d", d); $("fclipP").setAttribute("d", d);
  const g = $("fgrad"); g.setAttribute("y2", H);
  // Each row holds its phase color. Phases blend over the gap between them (through an OKLab midpoint), except a
  // phase marked sharp, where blending would pass through a muddy gray (blue into the orange "who clicks")
  const o = y => (Math.min(H, Math.max(0, y))/H).toFixed(4);
  g.innerHTML = rows.map((r, i) => { const nx = rows[i+1];
    return `<stop offset="${o(r.t + 6)}" style="stop-color:${r.c}"/><stop offset="${o(r.b - 6)}" style="stop-color:${r.c}"/>` +
      (nx && nx.ph !== r.ph ? (PHASES[nx.ph].sharp ? `<stop offset="${o((r.b + nx.t)/2 - 3)}" style="stop-color:${r.c}"/><stop offset="${o((r.b + nx.t)/2 + 3)}" style="stop-color:${nx.c}"/>`
        : `<stop offset="${o((r.b + nx.t)/2)}" style="stop-color:color-mix(in oklab, ${r.c}, ${nx.c})"/>`) : ""); }).join("");
  // A faint line between steps in the same phase, a solid cut into a sharp phase; other phase changes show by color
  $("fdiv").innerHTML = rows.slice(0, -1).map((r, i) => { const nx = rows[i+1];
    return r.ph === nx.ph ? `<line class="div" x1="0" x2="${W}" y1="${f(r.b)}" y2="${f(r.b)}"/>`
      : PHASES[nx.ph].sharp ? `<line class="div cut" x1="0" x2="${W}" y1="${f((r.b + nx.t)/2)}" y2="${f((r.b + nx.t)/2)}"/>` : ""; }).join("");
}

// The map and scatter pick their label and dot sizes from the width they're drawn at, not the window
const mapNarrow = () => NARROW.matches || ($("map").clientWidth || 975) < 700;
const plotNarrow = () => NARROW.matches || ($("plot").clientWidth || 760) < 600;
let sizeKey = "", LAST = null;
// Visible on screen: laid out, and not inside a closed question section (Chromium lays those out while hidden)
const shown = el => el.offsetParent !== null && !el.closest(".qsec:not([open])");
function drawCharts(){
  if (!LAST) return;
  const {m, all, who, s, P} = LAST;
  if (shown($("cmp"))) usMap(m, all, who);
  if (shown($("plotCard"))) plot(m, s, P, all);
  if (shown($("rentCard"))) rentPlot(m, P, all);
  if (shown($("drvCard"))) drivers(LAST);
  if (shown($("ageCard"))) ages(LAST);
  if (shown($("cmpCard"))) compare(LAST);
  if (shown($("sexCard"))) sexByAge(LAST);
  answers(LAST);
}

// The one-line answer on each closed section, from the same numbers its charts use
const pctBelow = (arr, v) => Math.round(100*arr.filter(x => x < v).length/arr.length);
// "more than in 62% of metros", or from the other side when the metro is in the bottom half
const vsMetros = (arr, v, up, down, pre = "") => { const b = pctBelow(arr, v), a = Math.round(100*arr.filter(x => x > v).length/arr.length);
  return b >= a ? `${up} than ${pre}${b}% of metros` : `${down} than ${pre}${a}% of metros`; };
function sexInRange(m, s, P){
  const a = m.acs, sv = sexView(P), b = sv.inv ? "m" : "w", o = sv.inv ? "w" : "m";
  if (!a) return null;
  const yb = singleYears(a[b]), yo = singleYears(a[o]); let nb = 0, no = 0;
  for (let x = s.ageMin; x <= s.ageMax; x++){ nb += yb[x - AGE0] || 0; no += yo[x - AGE0] || 0; }
  return no ? nb/no : null;
}
// The age with the most possibilities; when every age is 0, the first age would "win", so say so instead
const peakText = peak => peak.v ? `The most possibilities are at age ${peak.a}` : "No one fits these filters at any age";
function answers({m, all, s, P, iv, byAge, cmp}){
  const me = all.find(a => a.m === m), last = cmp.rows.find(r => r.t === "Mutual attraction"), k = !last ? 1 : last.a ? last.b/last.a : last.b ? Infinity : 1;
  const cheaper = me ? all.filter(a => a.v > me.v && a.rent <= BURDEN).length : 0;
  $("qWhereA").textContent = (cmp.cm === m ? "" : k === Infinity ? `${cmp.cm.short} has more possibilities. ` : k >= 1.05 ? `${cmp.cm.short} has about ${k.toFixed(1)}× as many possibilities. ` : k <= .95 ? `${cmp.cm.short} has fewer possibilities than ${m.short}. ` : `${cmp.cm.short} has about as many. `) +
    (cheaper ? `${cheaper} metro${cheaper === 1 ? " has" : "s have"} more than ${m.short} with rent under ${BURDEN}% of pay.` : `No metro has more than ${m.short} with rent under ${BURDEN}% of pay.`);
  const peak = byAge.reduce((p, x) => x.v > p.v ? x : p), sr = sexInRange(m, s, P), sv = sexView(P);
  $("qWhoA").textContent = peakText(peak) + "." + (sr ? ` Counting all singles in your age range, there are about ${fmt2(sr)} ${sv.label}.` : "");
  $("qSureA").textContent = iv ? rangeText(iv) : "The pool is too small to put a range on.";
}


// Bubble map: one circle per metro at its Census center, area proportional to the people on the apps now
let MAPPTS = [];
function usMap(m, all, who){
  const nw = mapNarrow(), k = nw ? 2.2 : 1, rMax = nw ? 34 : 28, rMin = nw ? 3 : 1.6;
  const mx = Math.max(...all.map(a => a.apps)), sc = rMax/Math.sqrt(mx || 1), rad = v => Math.max(rMin, Math.sqrt(v)*sc);
  MAPPTS = all.filter(a => MAPXY[a.m.name]).map(a => ({a, x:MAPXY[a.m.name][0], y:MAPXY[a.m.name][1], r:rad(a.apps)})).sort((p, q) => q.r - p.r);
  const dots = MAPPTS.filter(p => p.a.m !== m).map(p => `<circle data-i="${p.a.m.i}" cx="${p.x}" cy="${p.y}" r="${p.r.toFixed(1)}"/>`).join("");
  const me = MAPPTS.find(p => p.a.m === m);
  // Size key at the scale the map is drawn on screen: three round values, side by side
  const top = 10**Math.floor(Math.log10(mx || 1)), vals = [top, top/10, top/100].filter(v => v >= 1 && rad(v) > rMin);
  const f = ($("map").clientWidth || 975)/975, kr = vals.map(v => Math.max(1.5, rad(v)*f)), kh = 2*Math.max(...kr, 2);
  let kx = 0; const keyDots = vals.map((v, i) => { const cx = kx + Math.max(kr[i], 22); kx = cx + Math.max(kr[i], 22) + 6;
    return `<circle cx="${cx}" cy="${kh - kr[i]}" r="${kr[i]}"/><text x="${cx}" y="${kh + 14}" text-anchor="middle">${fmt(v)}</text>`; }).join("");
  const lbl = me ? (() => { const right = me.x > 780; return `<circle class="on" cx="${me.x}" cy="${me.y}" r="${Math.max(me.r, 5*k).toFixed(1)}"/><text class="lbl" x="${right ? me.x - me.r - 6 : me.x + Math.max(me.r, 5*k) + 6}" y="${me.y + 5*k}" font-size="${14*k}" text-anchor="${right ? "end" : "start"}">${m.short}</text>`; })() : "";
  if (!$("mapDots")) $("map").innerHTML = `<svg viewBox="0 0 975 610" role="img" id="mapSvg"><path class="land" d="${USMAP.nation}"/><path class="bord" d="${USMAP.borders}"/><g id="mapDots"></g></svg><div class="tip" id="mapTip" hidden></div>`;
  $("mapDots").innerHTML = dots + lbl;
  $("mapSvg").setAttribute("aria-label", `Map of ${all.length} U.S. metros, with circles sized by how many of the ${who} you're looking for are on the apps right now. ${m.short} has about ${fmt(me ? me.a.apps : 0)}. The ranked list below has every metro.`);
  $("mapKey").innerHTML = `<span>People on the apps now</span><svg width="${kx}" height="${kh + 18}" aria-hidden="true">${keyDots}</svg>`;
  const best = MAPPTS[0];
  $("mapT").textContent = !best.a.apps ? `No metro has ${who} who fit these filters` : `${LAST.P.climate === "any" ? "" : `Among metros with ${CLIMATES[LAST.P.climate].toLowerCase()}, `}${best.a.m === m ? m.short : best.a.m.short} has the most ${who} on the apps right now`;
  $("mapNote").textContent = `Each circle is a metro, placed at its center. ${!best.a.apps ? "Every metro is at 0 with these filters." : best.a.m === m ? `${m.short} has the most ${who} on the apps.` : `${best.a.m.short} has the most ${who} on the apps, about ${fmt(best.a.apps)}, against ${fmt(me ? me.a.apps : 0)} in ${m.short}.`} Tap or click a circle to switch metros.`;
}
// Nearest circle to a pointer, within its radius plus a margin so small ones are easy to hit
function mapHit(e){
  const svg = $("map").querySelector("svg"); if (!svg) return null;
  const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
  const pad = mapNarrow() ? 22 : 10;
  let hit = null, bd = Infinity;
  MAPPTS.forEach(p => { const d = Math.hypot(p.x - pt.x, p.y - pt.y); if (d < p.r + pad && d - p.r < bd){ bd = d - p.r; hit = p; } });
  return hit;
}

// The two metro scatters share a frame: size, axis titles, a dot per metro, the selected metro labeled, and the list
// a tap picks the nearest dot from. pts are {m, x, y, tip} in drawing units; g holds the caller's grid.
const frame = () => { const nw = plotNarrow(); return {nw, W: nw ? 400 : 760, H: nw ? 380 : 470, L: nw ? 40 : 48, R: 16, T: 16, B: 40, k: nw ? 1.4 : 1}; };
function scatter(id, {nw, W, H, L, R, T, B, k}, m, pts, g, xT, yT, aria){
  g += `<text x="${(L+W-R)/2}" y="${H-6}" text-anchor="middle">${xT}</text>`;
  if (!nw) g += `<text transform="translate(12 ${(T+H-B)/2}) rotate(-90)" text-anchor="middle">${yT}</text>`;
  const others = pts.filter(p => p.m !== m), me = pts.find(p => p.m === m);
  g += others.map(p => `<circle class="${BIG.has(p.m) ? "big" : ""}" data-i="${p.m.i}" cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${(BIG.has(p.m) ? 4.5 : 3)*k}"><title>${p.m.name}: ${p.tip}</title></circle>`).join("");
  if (me){ const right = me.x > W - (nw ? 90 : 140);
    g += `<circle class="on" cx="${me.x}" cy="${me.y}" r="7"><title>${m.name}</title></circle><text class="lbl" x="${right ? me.x-11 : me.x+11}" y="${me.y+4}" text-anchor="${right ? "end" : "start"}">${m.short}</text>`; }
  $(id).innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${aria}">${g}</svg>`;
  return others.map(p => [p.m, p.x, p.y]);
}

function plot(m, s, P, all){
  const c = frame(), {W, H, L, R, T, B} = c;
  const raw = document.querySelector('input[name="yfit"]:checked').value === "n";
  const fit = raw ? new Map(all.map(a => [a.m, a.vals])) : new Map(all.map(a => [a.m, blends(a.m, s, P).val]));
  const yMax = Math.max(70, Math.ceil(Math.max(...fit.values())/10)*10);
  const x0 = Math.log10(50000), x1 = Math.log10(25e6);
  // Counts span several orders of magnitude, so they get a log axis from the decade below the smallest
  const y0 = raw ? Math.floor(Math.log10(Math.max(1, Math.min(...fit.values())))) : 0, y1 = raw ? Math.ceil(Math.log10(Math.max(10, ...fit.values()))) : 0;
  const X = p => L + (Math.log10(p) - x0)/(x1 - x0)*(W - L - R), Y = v => T + (1 - (raw ? (Math.log10(Math.max(v, 10**y0)) - y0)/(y1 - y0) : v/yMax))*(H - T - B);
  const yLbl = v => raw ? fmtAx(v) : Math.round(v) + "%";
  let g = "";
  [1e5, 3e5, 1e6, 3e6, 1e7].forEach(p => g += `<line class="gridl" x1="${X(p)}" x2="${X(p)}" y1="${T}" y2="${H-B}"/><text x="${X(p)}" y="${H-B+16}" text-anchor="middle">${p >= 1e6 ? p/1e6 + "M" : p/1e3 + "k"}</text>`);
  (raw ? Array.from({length: y1 - y0 + 1}, (_, i) => 10**(y0 + i)) : Array.from({length: yMax/10 + 1}, (_, i) => i*10))
    .forEach(v => g += `<line class="gridl" x1="${L}" x2="${W-R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L-8}" y="${Y(v)+4}" text-anchor="end">${yLbl(v)}</text>`);
  const vf = [...fit.values()], mine = fit.get(m);
  $("plotT").textContent = raw ? `${fmt(mine)} of them share your values in ${m.short}, ${vsMetros(vf, mine, "more", "fewer", "in ")}`
    : `${Math.round(mine)}% of them share your values in ${m.short}, ${vsMetros(vf, mine, "more", "fewer", "in ")}`;
  PTS = scatter("plot", c, m, [...fit.keys()].map(x => ({m: x, x: X(x.pop), y: Y(fit.get(x)), tip: `${raw ? fmt(fit.get(x)) + " share your values" : Math.round(fit.get(x)) + "%"}, ${fmt(x.pop)} people`})),
    g, "Metro population (log scale)", raw ? "Share your values (log scale)" : "Values fit",
    `Scatter plot of ${fit.size} metros by population and values fit. ${m.short} has ${fmt(m.pop)} people and ${raw ? `${fmt(mine)} who share your values` : `a values fit of ${Math.round(mine)}%`}.`);
}

// Dumbbell lollipops: the 10th to 90th percentile of the result when only one input group varies
const DRV = {census:"Census counts", look:"Singles looking", open:"Open to dating you", values:"Politics and faith", diet:"Diet rates", kids:"Kids plans", click:"Mutual attraction"};
function drivers({iv, est, m}){
  const rows = iv ? iv.ranges.filter(r => r.lo > 0 && r.hi/r.lo > 1.01).sort((a, b) => b.hi/b.lo - a.hi/a.lo) : [];
  if (!rows.length){ $("drivers").innerHTML = ""; $("drvNote").textContent = `The pool in ${m.short} is too small to break down.`; return; }
  const d = iv.draws, dq = p => d[Math.floor(p*(d.length - 1))], DH = 70;
  const W = $("drivers").clientWidth || 520, nw = W < 440, L = nw ? 12 : 150, R = 44, T = 30 + DH + (nw ? 22 : 12), RH = nw ? 46 : 34, H = T + rows.length*RH + 26;
  const lo = Math.max(1e-3, Math.min(est, dq(.02), ...rows.map(r => r.lo)))/1.25, hi = Math.max(est, dq(.98), ...rows.map(r => r.hi))*1.25;
  const X = v => L + (Math.log(v) - Math.log(lo))/(Math.log(hi) - Math.log(lo))*(W - L - R);
  // Log ticks per decade: denser when the span is narrow, whole decades when it's wide
  const span = hi/lo, ks = span > 300 ? [1] : span > 12 ? [1, 2, 5] : [1, 1.5, 2, 3, 4, 5, 7], ticks = [];
  for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) ks.forEach(k => { const v = k*10**e; if (v >= lo && v <= hi) ticks.push(v); });
  let g = `<line class="top" x1="0" x2="${W}" y1="1" y2="1"/>`;
  ticks.forEach(v => g += `<line class="tick" x1="${X(v)}" x2="${X(v)}" y1="24" y2="${H - 22}"/><text x="${X(v)}" y="18" text-anchor="middle">${fmtAx(v)}</text>`);
  // Smoothed density of all the draws together: a Gaussian kernel on log values, Silverman's bandwidth
  const ls = Array.from(d, v => Math.log(Math.max(v, 1e-3))), n = ls.length, mu = ls.reduce((a, b) => a + b, 0)/n;
  const bw = 1.06*Math.sqrt(ls.reduce((a, b) => a + (b - mu)**2, 0)/n)*n**-.2 || .05, NP = 90, xs = [], ys = [];
  for (let i = 0; i < NP; i++){ const x = Math.log(lo) + i/(NP - 1)*(Math.log(hi) - Math.log(lo)); let k = 0; for (let j = 0; j < n; j++) k += Math.exp(-.5*((x - ls[j])/bw)**2); xs.push(Math.exp(x)); ys.push(k); }
  const ym = Math.max(...ys), base = 30 + DH, DY = k => base - k/ym*(DH - 6);
  const pts = xs.map((x, i) => `${X(x).toFixed(1)},${DY(ys[i]).toFixed(1)}`), inb = xs.map((x, i) => [x, i]).filter(([x]) => x >= dq(.1) && x <= dq(.9));
  g += `<path class="dens" d="M${X(xs[0])},${base}L${pts.join("L")}L${X(xs[NP - 1])},${base}Z"/>`;
  if (inb.length) g += `<path class="densb" d="M${X(inb[0][0])},${base}L${inb.map(([x, i]) => pts[i]).join("L")}L${X(inb[inb.length - 1][0])},${base}Z"/>`;
  g += `<path class="densl" d="M${pts.join("L")}"/><line class="tick" x1="${L}" x2="${W - R}" y1="${base}" y2="${base}"/>`;
  g += `<text class="nm" x="${nw ? L : L - 12}" y="${nw ? base + 16 : base - 8}" text-anchor="${nw ? "start" : "end"}">All inputs together</text>`;
  rows.forEach((r, i) => {
    const y = T + i*RH + (nw ? 30 : RH/2), x1 = X(r.lo), x2 = X(r.hi);
    g += `<g class="${i ? "" : "lead"}"><text class="nm" x="${nw ? L : L - 12}" y="${nw ? y - 12 : y + 4}" text-anchor="${nw ? "start" : "end"}">${DRV[r.k]}</text>` +
      `<line class="stem" x1="${x1}" x2="${x2}" y1="${y}" y2="${y}"/><circle cx="${x1}" cy="${y}" r="5"/><circle cx="${x2}" cy="${y}" r="5"/>` +
      `<text class="v" x="${x1 - 9}" y="${y + 4}" text-anchor="end">${fmt(nice(r.lo))}</text><text class="v" x="${x2 + 9}" y="${y + 4}">${fmt(nice(r.hi))}</text>` +
      `<title>${DRV[r.k]}: ${fmt(nice(r.lo))} to ${fmt(nice(r.hi))}</title></g>`;
  });
  g += `<line class="est" x1="${X(est)}" x2="${X(est)}" y1="24" y2="${H - 20}"/><text class="estt" x="${X(est)}" y="${H - 6}" text-anchor="middle">Your estimate, ${fmt(est)}</text>`;
  $("drivers").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="How much each input moves the estimate of ${fmt(est)} possibilities in ${m.short}. ${rows.map(r => `${DRV[r.k]}: ${fmt(nice(r.lo))} to ${fmt(nice(r.hi))}`).join(". ")}.">${g}</svg>`;
  $("drvT").textContent = `Your number hinges most on ${DRV[rows[0].k].toLowerCase()}`;
  $("drvNote").textContent = `The curve at the top smooths all ${n.toLocaleString("en-US")} simulated results, with the shaded middle 80% matching the range under the main number. Each line below spans the middle 80% of results when only that input varies and everything else stays at its best guess; the dashed line is your estimate. Biggest source of uncertainty: ${DRV[rows[0].k].toLowerCase()}. Log scale.`;
}

// Columns per year of the people's age: inside your range in blue, your own age in orange
function ages({byAge, s, m, age}){
  const W = $("ages").clientWidth || 900, nw = W < 560, L = nw ? 36 : 48, R = 8, T = 10, B = 34, H = nw ? 200 : 240;
  const vmax = Math.max(...byAge.map(b => b.v)) || 1, step = Math.pow(10, Math.floor(Math.log10(vmax))), top = Math.ceil(vmax/step)*step;
  const n = byAge.length, bw = (W - L - R)/n, X = i => L + i*bw, Y = v => T + (1 - v/top)*(H - T - B);
  let g = "";
  for (let k = 0; k <= top/step; k++){ const v = k*step; if (top/step > 6 && k % 2) continue;
    g += `<line class="tick" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${fmtAx(v)}</text>`; }
  byAge.forEach((b, i) => {
    const inR = b.a >= s.ageMin && b.a <= s.ageMax, cls = b.a === age ? "bar you" : inR ? "bar in" : "bar";
    g += `<rect class="${cls}" x="${(X(i) + 1).toFixed(1)}" y="${Y(b.v).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${(Y(0) - Y(b.v)).toFixed(1)}"><title>Age ${b.a}: about ${fmt(b.v)}</title></rect>`;
    if (b.a % 5 === 0) g += `<text x="${X(i) + bw/2}" y="${H - B + 16}" text-anchor="middle">${b.a}</text>`;
  });
  g += `<text x="${(L + W - R)/2}" y="${H - 4}" text-anchor="middle">Their age</text>`;
  const sum = (a, b) => byAge.filter(x => x.a >= a && x.a <= b).reduce((t, x) => t + x.v, 0);
  const inside = sum(s.ageMin, s.ageMax), wider = sum(s.ageMin - 2, s.ageMax + 2), peak = byAge.reduce((p, x) => x.v > p.v ? x : p);
  $("ageT").textContent = peakText(peak);
  $("ages").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Possibilities in ${m.short} for each year of age from ${byAge[0].a} to ${byAge[n - 1].a}. Your range, ${s.ageMin} to ${s.ageMax}, is highlighted. ${peak.v ? `The most are at age ${peak.a}, about ${fmt(peak.v)}.` : "No age has any."}">${g}</svg>`;
  $("ageNote").textContent = `Blue bars are your range, ${s.ageMin} to ${s.ageMax}; the orange bar is your own age. ${peak.v ? `The most possibilities in ${m.short} are at age ${peak.a}. ` : ""}Widening your range by two years at each end would add about ${fmt(Math.max(0, wider - inside))}. Single years are interpolated smoothly from the Census's 5-year age bands. The drops at 40 and 65 are real: in Pew's surveys, far fewer singles 40 and older say they're looking to date, especially women, and fewer still from 65. Each year is estimated on its own, so the bars only roughly add up to your total.`;
}

// Dumbbells per funnel step: your metro in orange, the comparison in blue, on one log axis
function compare({m, cmp}){
  const {cm, rows} = cmp, W = $("cmpChart").clientWidth || 520, nw = W < 440, L = nw ? 12 : 215, R = 52, T = 44, RH = nw ? 44 : 30, LH = 15;
  // SVG text never wraps, so long step names (many faiths picked) break into up to 3 lines at ~6.5px a character,
  // and are cut only past that; the full name is in the tooltip and the aria label
  const fit = Math.floor((nw ? W - L - 4 : L - 16)/6.5), cut = t => t.length > fit ? t.slice(0, fit - 1).trimEnd() + "…" : t;
  const wrap = (t, n = 3) => { if (t.length <= fit || n === 1) return [cut(t)]; const b = t.lastIndexOf(" ", fit); return b > 0 ? [t.slice(0, b), ...wrap(t.slice(b + 1), n - 1)] : [cut(t)]; };
  const lines = rows.map(r => wrap(r.t)), tops = lines.map((l, i) => T + lines.slice(0, i).reduce((a, x) => a + RH + (x.length - 1)*LH, 0));
  const H = T + lines.reduce((a, x) => a + RH + (x.length - 1)*LH, 0) + 6;
  const vals = rows.flatMap(r => [r.a, r.b]).filter(v => v > 0), lo = Math.min(...vals)/1.5, hi = Math.max(...vals)*1.3;
  const X = v => L + (Math.log(Math.max(v, lo)) - Math.log(lo))/(Math.log(hi) - Math.log(lo))*(W - L - R);
  let g = `<line class="top" x1="0" x2="${W}" y1="1" y2="1"/>`;
  for (let e = Math.ceil(Math.log10(lo)); e <= Math.floor(Math.log10(hi)); e++) g += `<line class="tick" x1="${X(10**e)}" x2="${X(10**e)}" y1="${T - 8}" y2="${H - 4}"/><text x="${X(10**e)}" y="${T - 14}" text-anchor="middle">${fmtAx(10**e)}</text>`;
  g += `<circle class="key you" cx="${L + 6}" cy="14" r="5"/><text class="nm" x="${L + 16}" y="18">${m.short}</text>`;
  g += `<circle class="key them" cx="${L + 26 + m.short.length*7.5}" cy="14" r="5"/><text class="nm" x="${L + 36 + m.short.length*7.5}" y="18">${cm.short}</text>`;
  rows.forEach((r, i) => {
    const n = lines[i].length - 1, y = tops[i] + (nw ? 28 + n*LH : RH/2 + n*LH/2), xa = X(r.a), xb = X(r.b), k = r.a ? r.b/r.a : 0, ly = nw ? y - 11 - n*LH : y + 4 - n*LH/2;
    g += `<text class="nm" text-anchor="${nw ? "start" : "end"}">${lines[i].map((t, j) => `<tspan x="${nw ? L : L - 12}" y="${ly + j*LH}">${t}</tspan>`).join("")}<title>${r.full}</title></text>` +
      `<line class="stem" x1="${Math.min(xa, xb)}" x2="${Math.max(xa, xb)}" y1="${y}" y2="${y}"/>` +
      `<g class="them"><circle cx="${xb}" cy="${y}" r="5"><title>${cm.short}: ${fmt(r.b)}</title></circle></g><g class="you"><circle cx="${xa}" cy="${y}" r="5"><title>${m.short}: ${fmt(r.a)}</title></circle></g>` +
      `<text class="v" x="${W - 4}" y="${y + 4}" text-anchor="end">${k ? "×" + (k >= 10 ? Math.round(k) : k.toFixed(1)) : ""}</text>`;
  });
  $("cmpChart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Funnel steps in ${m.short} and ${cm.short}. ${rows.map(r => `${r.full}: ${fmt(r.a)} versus ${fmt(r.b)}`).join(". ")}.">${g}</svg>`;
  // Where the gap opens or closes: each step's keep rate in one metro against the other
  const steps = rows.slice(1).map((r, i) => ({t: r.t, ka: rows[i].a ? r.a/rows[i].a : 0, kb: rows[i].b ? r.b/rows[i].b : 0})).filter(x => x.ka || x.kb).map(x => ({...x, d: x.ka ? x.kb/x.ka : Infinity}));
  const best = steps.reduce((p, x) => x.d > p.d ? x : p, steps[0]), worst = steps.reduce((p, x) => x.d < p.d ? x : p, steps[0]), last = rows[rows.length - 2];
  const kp = v => pct(v*100);
  $("cmpT").textContent = cm === m ? `${m.short}, step by step` : best.d > 1.05 ? `${cm.short} pulls ahead at “${best.t}”` + (worst.d < .95 ? `, ${m.short} at “${worst.t}”` : "")
    : worst.d < .95 ? `${m.short} pulls ahead at “${worst.t}”` : `${m.short} and ${cm.short} keep pace at every step`;
  $("cmpNote").textContent = cm === m ? "Pick another metro to compare." :
    `${cm.short} ends with ${fmt(last.b)} possibilities to ${fmt(last.a)} in ${m.short}. ` +
    (best.d > 1.05 ? `Its biggest edge is "${best.t}", which keeps ${kp(best.kb)} there against ${kp(best.ka)} here. ` : "") +
    (worst.d < .95 ? `${m.short} does better at "${worst.t}": ${kp(worst.ka)} against ${kp(worst.kb)}. ` : "") +
    "The right column is how many times bigger each step is in " + cm.short + ". Log scale.";
}

// Single people of the gender you're looking for per single person of yours, by year of age, from the ACS
function sexByAge({m, s, P}){
  const a = m.acs, sv = sexView(P), base = sv.inv ? "m" : "w", other = sv.inv ? "w" : "m";
  if (!a){ $("sexChart").innerHTML = ""; $("sexNote").textContent = `No Census age counts for ${m.short}.`; return; }
  const yb = singleYears(a[base]), yo = singleYears(a[other]);
  const pts = []; for (let x = +$("ageMin").min; x <= +$("ageMax").max; x++){ const nb = yb[x - AGE0], no = yo[x - AGE0];
    if (nb > 0 && no > 0) pts.push({x, r: nb/no, l: nb*lookRate(base, x)/(no*lookRate(other, x))}); }
  const W = $("sexChart").clientWidth || 520, nw = W < 440, L = 40, R = 10, T = 12, B = 34, H = nw ? 220 : 250;
  const lo = Math.min(.8, ...pts.map(p => Math.min(p.r, p.l)))/1.1, hi = Math.max(1.25, ...pts.map(p => Math.max(p.r, p.l)))*1.1;
  const x0 = pts[0].x, x1 = pts[pts.length - 1].x, X = x => L + (x - x0)/(x1 - x0)*(W - L - R), Y = v => T + (1 - Math.log(v/lo)/Math.log(hi/lo))*(H - T - B);
  let g = `<rect class="rng" x="${X(Math.max(x0, s.ageMin))}" y="${T}" width="${Math.max(0, X(Math.min(x1, s.ageMax)) - X(Math.max(x0, s.ageMin)))}" height="${H - T - B}"/>`;
  [.25, .5, .75, 1, 1.5, 2, 3, 4].filter(v => v >= lo && v <= hi).forEach(v => g += `<line class="tick" x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end">${fmtAx(v)}</text>`);
  for (let x = Math.ceil(x0/5)*5; x <= x1; x += 5) g += `<text x="${X(x)}" y="${H - B + 16}" text-anchor="middle">${x}</text>`;
  g += `<line class="even" x1="${L}" x2="${W - R}" y1="${Y(1)}" y2="${Y(1)}"/><text class="estt" x="${W - R}" y="${Y(1) - 6}" text-anchor="end">Even</text>`;
  const path = k => "M" + pts.map(p => `${X(p.x).toFixed(1)},${Y(p[k]).toFixed(1)}`).join("L");
  g += `<path class="ln" d="${path("r")}"/><path class="ln look" d="${path("l")}"/><text x="${(L + W - R)/2}" y="${H - 4}" text-anchor="middle">Age</text>`;
  $("sexChart").innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Single ${sv.label} in ${m.short} by age, for all singles and for singles who are looking to date.">${g}</svg>`;
  const inR = pts.filter(p => p.x >= s.ageMin && p.x <= s.ageMax), sum = (k) => inR.reduce((t, p) => t + yb[p.x - AGE0]*(k ? lookRate(base, p.x) : 1), 0)/inR.reduce((t, p) => t + yo[p.x - AGE0]*(k ? lookRate(other, p.x) : 1), 0);
  $("sexT").textContent = inR.length ? `Counting all singles in your age range: about ${fmt2(sum(0))} ${sv.label}` : `Single ${sv.label}, by age`;
  $("sexNote").textContent = `Solid line: all single ${sv.label.split(" ")[0]} per single ${sv.label.split(" ").pop()}, from Census counts. Dashed: only those looking to date, using Pew's rates, which drop at 40, most of all for women, and again at 65. ` +
    (inR.length ? `Across your range, ${s.ageMin} to ${s.ageMax} (shaded), that's about ${fmt2(sum(0))} overall and ${fmt2(sum(1))} among those looking.` : "") + " Log scale.";
}

// Possibilities (log) against rent as a share of pay, with HUD's cost-burden line
let RPTS = [];
function rentPlot(m, P, all){
  const mode = document.querySelector('input[name="ry"]:checked').value, sv = sexView(P);
  // Each y-axis: its value, whether lower is better, the reference line and how to label it
  const C = {
    rent: {t:"rent", get: a => a.rent, ok: v => v === v, low: true, ref: BURDEN, refT: `Cost-burdened above ${BURDEN}%`,
      ax: "Rent for a 1-bedroom, share of pay", tick: v => v + "%", tip: a => `rent ${a.rent}% of pay`},
    ratio: {t:"competition", get: a => a.ratio, ok: v => v > 0, ref: 1, refT: "Even competition",
      ax: "Possibilities per competitor (log scale)", tick: v => fmtAx(v), tip: a => `${fmt1(a.ratio)} per competitor`},
    sex: {t:"gender balance", get: a => a.sex, ok: v => v > 0, ref: 1, refT: "Even",
      ax: `${cap(sv.label)} among singles looking to date (log scale)`, tick: v => fmtAx(v), tip: a => `${fmt2(a.sex)} ${sv.label}`}}[mode];
  const c = frame(), {W, H, L, R, T, B} = c;
  const pts = all.filter(a => C.ok(C.get(a)) && a.v > 0), vs = pts.map(a => a.v), ys = pts.map(C.get);
  const x0 = Math.floor(Math.log10(Math.min(...vs))), x1 = Math.max(x0 + 1, Math.ceil(Math.log10(Math.max(...vs))));
  const X = v => L + (Math.log10(v) - x0)/(x1 - x0)*(W - L - R);
  let Y, yt;
  if (mode === "rent"){ const yMax = Math.max(50, Math.ceil(Math.max(...ys)/10)*10); Y = v => T + (1 - v/yMax)*(H - T - B); yt = []; for (let v = 0; v <= yMax; v += 10) yt.push(v); }
  else { const lo = Math.min(.8, ...ys)/1.1, hi = Math.max(1.25, ...ys)*1.1; Y = v => T + (1 - Math.log(v/lo)/Math.log(hi/lo))*(H - T - B);
    yt = [.25, .5, .75, 1, 1.5, 2, 3, 4].filter(v => v >= lo && v <= hi); }
  let g = "";
  for (let e = x0; e <= x1; e++) g += `<line class="gridl" x1="${X(10**e)}" x2="${X(10**e)}" y1="${T}" y2="${H-B}"/><text x="${X(10**e)}" y="${H-B+16}" text-anchor="${e === x1 ? "end" : "middle"}">${fmtAx(10**e)}</text>`;
  yt.forEach(v => g += `<line class="gridl" x1="${L}" x2="${W-R}" y1="${Y(v)}" y2="${Y(v)}"/><text x="${L-8}" y="${Y(v)+4}" text-anchor="end">${C.tick(v)}</text>`);
  g += `<line class="burdenl" x1="${L}" x2="${W-R}" y1="${Y(C.ref)}" y2="${Y(C.ref)}"/><text class="burdent" x="${L+6}" y="${Y(C.ref)-6}">${C.refT}</text>`;
  const me = pts.find(a => a.m === m);
  RPTS = scatter("rplot", c, m, pts.map(a => ({m: a.m, x: X(a.v), y: Y(C.get(a)), tip: `${fmt(a.v)} possibilities, ${C.tip(a)}`})), g, "Possibilities (log scale)", C.ax,
    `Scatter plot of ${pts.length} metros by possibilities and ${C.t}.${me ? ` ${m.short} has ${fmt(me.v)} possibilities, ${C.tip(me)}.` : ""}`);
  $("rentT").textContent = !me ? `Pool versus ${C.t}` : mode === "rent" ? `Rent in ${m.short} takes ${me.rent}% of pay, ${me.rent <= BURDEN ? "under" : "over"} the ${BURDEN}% line`
    : mode === "ratio" ? `${m.short} has ${fmt1(me.ratio)} for every competitor, ${vsMetros(ys, me.ratio, "better", "worse")}`
    : `Among singles looking to date${LAST.s.deg ? " with a degree" : ""}, ${m.short} has ${fmt2(me.sex)} ${sv.label}, ${vsMetros(ys, me.sex, "higher", "lower")}`;
  // "Better" means more possibilities and a better value on this axis: under the burden line for rent, higher for the others
  const better = me ? pts.filter(a => a.v > me.v && (C.low ? C.get(a) <= C.ref : C.get(a) > C.get(me))).length : 0, what = C.low ? `rent under ${BURDEN}%` : mode === "ratio" ? "better odds" : `more ${sv.label.split(" ")[0]} per ${sv.label.split(" ").pop()}`;
  $("rentNote").textContent = (C.low ? `The best spots sit low and to the right: more possibilities, rent under ${BURDEN}% of ${P.edu === "ba" ? "a grad's" : "typical"} pay. `
      : `The best spots sit high and to the right: more possibilities and ${mode === "ratio" ? "more of them for each person competing for them" : `more ${sv.label} among singles looking to date`}. `) +
    (!me ? (C.ok(C.get(all.find(a => a.m === m))) ? `${m.short} has no possibilities with these filters, so it's off this log-scale chart.` : `There's no data for ${m.short} on this measure.`) : better ? `${better} metro${better === 1 ? " has" : "s have"} more possibilities than ${m.short} and ${what}.` : `No metro has more possibilities than ${m.short} and ${what}.`) + " Blue dots are the 25 largest metros.";
}
