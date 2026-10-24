// Smoke test for atlas/index.html and its data.js, run before every deploy: load the page in headless Chromium and fail on any
// script error or failed console.assert self-check, or if the main number never renders. Every section is opened.
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
const p = await browser.newPage(), problems = [];
p.on("pageerror", e => problems.push("script error: " + e.message));
p.on("console", m => { if (m.type() === "assert" || m.type() === "error") problems.push(`console.${m.type()}: ${m.text()}`); });
await p.goto(`http://127.0.0.1:${server.address().port}/`);
// The first visit shows the setup, but the result behind it is computed on load
await p.waitForFunction(() => /^#\d+$/.test(document.getElementById("sRank")?.textContent), null, {timeout: 15000})
  .catch(() => problems.push("the result never rendered (#sRank is still empty)"));
// Charts draw only when visible, so skip the setup, open every section and redraw, to run that code too
if (!problems.length){
  await p.click("#setupSkip");
  await p.waitForFunction(() => document.getElementById("ageCard").offsetParent !== null, null, {timeout: 10000});
  await p.evaluate(() => { document.querySelectorAll("details").forEach(d => d.open = true); drawCharts(); })
    .catch(e => problems.push("script error: " + e.message.split("\n")[0]));
  if (!await p.$eval("#ages", el => el.querySelector("rect"))) problems.push("the age chart didn't draw");
}
const pool = await p.textContent("#sPool");
if (pool !== "142") problems.push(`the default search reads "${pool}", not 142`);
// Pinned results, so a refactor that moves any number fails here. Update them only for an intended model change.
const PINNED = [["m=New York–Newark–Jersey City, NY-NJ&seek=wmn&pol=prog,lib,mod,con&faith=atheist,agnostic,catholic,jewish", "7,796"],
  ["m=Chicago–Naperville–Elgin, IL-IN&you=w&seek=m&age=44&ageMin=38&ageMax=52&kids=have&edu=no&job=less&diet=pesc", "26"],
  ["m=Memphis, TN-MS-AR&pol=any&faith=muslim&diet=kosher", "0"],
  // Bad values in a link are ignored, not fatal
  ['m=Memphis, TN-MS-AR&ry="&diet=constructor&pol=constructor&faith=__proto__', "142"]];
for (const [hash, want] of PINNED){
  const q = await browser.newPage();
  q.on("pageerror", e => problems.push(`script error (#${hash}): ${e.message}`));
  await q.goto(`http://127.0.0.1:${server.address().port}/#${hash}`);
  await q.waitForFunction(() => /^#\d+$/.test(document.getElementById("sRank")?.textContent), null, {timeout: 15000}).catch(() => {});
  const got = await q.textContent("#sPool");
  if (got !== want) problems.push(`#${hash} reads "${got}", not ${want}`);
  await q.close();
}
await browser.close(); server.close();

if (problems.length){ console.error([...new Set(problems)].join("\n")); process.exit(1); }
console.log(`Page OK: ${pool} possibilities for the default search`);
