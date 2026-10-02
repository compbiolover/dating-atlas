// Rebuilds the map data embedded in atlas/index.html (MAPXY and USMAP).
// Usage: download and unzip 2023_Gaz_cbsa_national.zip from the Census Gazetteer next to this script, then
//   npm i d3-geo topojson-client us-atlas && node scripts/build_map.mjs > map.json
// and paste xy into MAPXY and nation/borders into USMAP.
import fs from 'fs';
import { geoAlbersUsa, geoPath } from 'd3-geo';
import * as topo from 'topojson-client';
const html = fs.readFileSync(new URL('../atlas/index.html', import.meta.url),'utf8');
const RAW = JSON.parse(html.match(/const RAW = (\[\[.*?\]\]);/)[1]);
const gaz = fs.readFileSync(new URL('2023_Gaz_cbsa_national.txt', import.meta.url),'utf8').trim().split('\n').slice(1).map(l=>l.split('\t').map(x=>x.trim()));
const ALIAS = {'virginia beach-norfolk-newport news, va-nc':'virginia beach-chesapeake-norfolk, va-nc'};
const norm0 = s => s.replace(/–/g,'-').replace(/--/g,'-').replace(/ (Metro|Micro) Area$/,'').toLowerCase();
const norm = s => { const n = norm0(s); return ALIAS[n] || n; };
const G = new Map(gaz.filter(r=>r[3]==='1').map(r=>[norm(r[2]), [+r[8], +r[9]]]));
const proj = geoAlbersUsa().scale(1300).translate([487.5,305]);
const xy = {}, miss = [];
for (const [name] of RAW){ const ll = G.get(norm(name)); if(!ll){miss.push(name);continue;} const p = proj([ll[1], ll[0]]); if(!p){miss.push(name+' (unprojectable)');continue;} xy[name] = [Math.round(p[0]*10)/10, Math.round(p[1]*10)/10]; }
console.error('matched', Object.keys(xy).length, 'missing', miss);
const us = JSON.parse(fs.readFileSync(new URL('../node_modules/us-atlas/states-albers-10m.json', import.meta.url)));
const path = geoPath(); path.digits?.(0);
const round = d => d.replace(/(\d+)\.\d+/g,'$1');
const nation = round(path(topo.feature(us, us.objects.nation)));
const borders = round(path(topo.mesh(us, us.objects.states, (a,b)=>a!==b)));
console.error('nation', nation.length, 'borders', borders.length);
console.log(JSON.stringify({xy, nation, borders}));
