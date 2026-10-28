// Renders each ```math block in README.md to docs/math-N.svg, in order, so the GitHub app (which doesn't render math) can show it.
// Usage: npm i mathjax-full@3 && node scripts/render_math.mjs
// Rerun after editing a formula in README.md.
import fs from 'fs';
import { mathjax } from 'mathjax-full/js/mathjax.js';
import { TeX } from 'mathjax-full/js/input/tex.js';
import { SVG } from 'mathjax-full/js/output/svg.js';
import { liteAdaptor } from 'mathjax-full/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from 'mathjax-full/js/handlers/html.js';
import { AllPackages } from 'mathjax-full/js/input/tex/AllPackages.js';
const adaptor = liteAdaptor();
RegisterHTMLHandler(adaptor);
const doc = mathjax.document('', { InputJax: new TeX({ packages: AllPackages }), OutputJax: new SVG({ fontCache: 'local' }) });
const readme = fs.readFileSync(new URL('../README.md', import.meta.url), 'utf8');
const blocks = [...readme.matchAll(/^```math\n([\s\S]*?)\n```$/gm)].map(m => m[1]);
blocks.forEach((tex, i) => {
  let svg = adaptor.innerHTML(doc.convert(tex, { display: true }));
  // White background and black text, so it stays readable in dark mode.
  const [x, y, w, h] = svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number), pad = 400;
  svg = svg.replace(/viewBox="[^"]+"/, `viewBox="${x - pad} ${y - pad} ${w + 2 * pad} ${h + 2 * pad}"`)
    .replace(/width="[\d.]+ex"/, `width="${((w + 2 * pad) * 0.018).toFixed(1)}px"`)  // 18px per em
    .replace(/height="[\d.]+ex"/, `height="${((h + 2 * pad) * 0.018).toFixed(1)}px"`)
    .replace(/currentColor/g, '#000')
    .replace(/(<svg[^>]*>)/, `$1<rect x="${x - pad}" y="${y - pad}" width="${w + 2 * pad}" height="${h + 2 * pad}" fill="#fff"/>`);
  fs.writeFileSync(new URL(`../docs/math-${i + 1}.svg`, import.meta.url), `<?xml version="1.0" encoding="UTF-8"?>\n` + svg);
});
console.log(`wrote ${blocks.length} images`);
