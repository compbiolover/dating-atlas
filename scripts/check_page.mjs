// Smoke test for the page in atlas/, run before every deploy: load it in headless Chromium and fail on any script error
// or failed console.assert self-check, if the result never renders, if the default search or a pinned link reads a
// different number, or if any text or chart on a pinned page shows NaN, Infinity or undefined. Every section is opened.
// Usage: node scripts/check_page.mjs   (CHROME=/path/to/chrome to use an installed Chrome instead of Playwright's)
import path from "node:path";
import { execSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import { fileURLToPath } from "node:url";

// playwright-core from a local install (CI), else a global playwright
const { chromium } = await import("playwright-core")
  .catch(() => import(path.join(execSync("npm root -g").toString().trim(), "playwright/index.mjs")));
// Serve atlas/ over HTTP as Pages does, so root paths like /favicon.svg resolve
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "atlas");
const TYPES = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon"};
const server = http.createServer((q, r) => {
  const f = path.join(root, new URL(q.url, "http://x").pathname.replace(/\/$/, "/index.html"));
  fs.readFile(f, (e, d) => { r.writeHead(e ? 404 : 200, {"Content-Type": TYPES[path.extname(f)] || "application/octet-stream"}); r.end(d); });
});
await new Promise(ok => server.listen(0, "127.0.0.1", ok));

const browser = await chromium.launch(process.env.CHROME ? {executablePath: process.env.CHROME} : {});
const problems = [];
// Open the page at a hash and wait for the result, or for the first script error. A fixed time zone keeps the
// hashless default (which picks its metro from the time zone) on Memphis wherever this runs.
async function load(hash){
  const p = await browser.newPage({timezoneId: "UTC"}), at = hash ? ` (#${hash})` : "";
  p.on("console", m => { if (m.type() === "assert" || m.type() === "error") problems.push(`console.${m.type()}${at}: ${m.text()}`); });
  let fail; const failed = new Promise((_, no) => fail = no);
  p.on("pageerror", e => { problems.push(`script error${at}: ${e.message}`); fail(e); });
  failed.catch(() => {});
  await p.goto(`http://127.0.0.1:${server.address().port}/${hash ? "#" + hash : ""}`);
  // The first visit shows the setup, but the result behind it is computed on load
  const ok = await Promise.race([p.waitForFunction(() => /^(#\d+|–)$/.test(document.getElementById("sRank")?.textContent), null, {timeout: 15000}), failed])
    .then(() => true, () => false);
  if (!ok && !problems.some(x => x.includes(at || "script error:"))) problems.push(`the result never rendered${at} (#sRank is still empty)`);
  return ok && p;
}
// Charts draw only when visible: open every section and redraw, to run that code too
const openAll = p => p.evaluate(() => { document.querySelectorAll("details").forEach(d => d.open = true); drawCharts(); });

const p = await load("");
if (p){
  await p.click("#setupSkip");
  await p.waitForFunction(() => document.getElementById("ageCard").offsetParent !== null, null, {timeout: 10000});
  await openAll(p).catch(e => problems.push("script error: " + e.message.split("\n")[0]));
  if (!await p.$eval("#ages", el => el.querySelector("rect"))) problems.push("the age chart didn't draw");
}
const pool = p ? await p.textContent("#sPool") : "";
if (p && pool !== "142") problems.push(`the default search reads "${pool}", not 142`);
// Pinned results, so a change that moves one of these numbers fails here. Update them only for an intended model change.
const PINNED = [["m=New York–Newark–Jersey City, NY-NJ&seek=wmn&pol=prog,lib,mod,con&faith=atheist,agnostic,catholic,jewish", "7,796"],
  ["m=Chicago–Naperville–Elgin, IL-IN&you=w&seek=m&age=44&ageMin=38&ageMax=52&kids=have&edu=no&job=less&diet=pesc", "26"],
  // An empty pool everywhere, and a faith with no local share next to one with some
  ["m=Memphis, TN-MS-AR&pol=any&faith=muslim&diet=kosher", "0"],
  ["m=Tucson, AZ&faith=hindu,secular", "146"],
  // Progressive alone stays Progressive alone when it comes back from a link
  ["m=Memphis, TN-MS-AR&pol=prog", "77"],
  // Bad values in a link are ignored, and a number written another way still counts
  ['m=Memphis, TN-MS-AR&ry="&diet=constructor&pol=constructor&faith=__proto__&seek=women', "142"],
  ["m=Memphis, TN-MS-AR&ht=180.0", "159"]];
if (!problems.length) await Promise.all(PINNED.map(async ([hash, want]) => {
  const q = await load(hash);
  if (!q) return;
  const got = await q.textContent("#sPool");
  if (got !== want) problems.push(`#${hash} reads "${got}", not ${want}`);
  await openAll(q).catch(e => problems.push(`script error (#${hash}): ${e.message.split("\n")[0]}`));
  const bad = await q.evaluate(() => (document.querySelector(".wrap").innerText + document.querySelector(".wrap").innerHTML).match(/NaN|Infinity|undefined/));
  if (bad) problems.push(`#${hash} shows "${bad[0]}"`);
}));
await browser.close(); server.close();

if (problems.length){ console.error([...new Set(problems)].join("\n")); process.exit(1); }
console.log(`Page OK: ${pool} possibilities for the default search, and ${PINNED.length} pinned links`);
