// Smoke test for atlas/index.html, run before every deploy: load the page in headless Chromium and fail on any
// script error or failed console.assert self-check, or if the main number never renders.
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
const TYPES = {".html": "text/html; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon"};
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
const pool = await p.textContent("#sPool");
if (!/^(<1|[\d,]+)$/.test(pool)) problems.push(`the main number reads "${pool}"`);
await browser.close(); server.close();

if (problems.length){ console.error([...new Set(problems)].join("\n")); process.exit(1); }
console.log(`Page OK: ${pool} possibilities for the default search`);
