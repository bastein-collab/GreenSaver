// scripts/ingest/apply_webmap.mjs
// Applies website_map.csv (or JSON array) to an existing stores JSON file.
// Usage:
//   node -r dotenv/config scripts/ingest/apply_webmap.mjs path/to/stores.json --webmap scripts/ingest/website_map.csv > scripts/ingest/stores.nj.mapped.json
// If you pass --inplace, it will overwrite the input JSON file.

import fs from 'node:fs';
import path from 'node:path';

function read(p) { return fs.readFileSync(path.resolve(process.cwd(), p), 'utf8'); }

function parseCSV(text) {
  const rows = [];
  let i = 0, cur = '', row = [], inQ = false;
  function pushCell() { row.push(cur); cur = ''; }
  function pushRow() { rows.push(row); row = []; }
  while (i < text.length) {
    const ch = text[i++];
    if (inQ) {
      if (ch === '"') { if (text[i] === '"') { cur += '"'; i++; } else { inQ = false; } }
      else { cur += ch; }
    } else {
      if (ch === '"') inQ = true;
      else if (ch === ',') pushCell();
      else if (ch === '\n') { pushCell(); pushRow(); }
      else if (ch === '\r') { /* ignore */ }
      else cur += ch;
    }
  }
  if (cur.length || row.length) { pushCell(); pushRow(); }
  return rows;
}

function headerMap(cols) {
  const m = {};
  cols.forEach((c, idx) => { m[c.trim().toLowerCase()] = idx; });
  return (alts) => {
    const keys = [].concat(alts).map((s)=>String(s).toLowerCase());
    for (const k of keys) if (k in m) return m[k];
    return -1;
  };
}

function normKey(name, city) {
  const n = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const c = String(city || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return `${n}__${c}`;
}

function loadMap(p) {
  const raw = read(p);
  try { // JSON array of {name,city,zip,website}
    const arr = JSON.parse(raw);
    const byKey = new Map();
    const byName = new Map();
    const entries = [];
    for (const it of arr) {
      if (!it) continue;
      const key = normKey(it.name, it.city);
      if (it.website) byKey.set(key, it.website);
      if (it.name && it.website) byName.set(String(it.name).toLowerCase(), it.website);
      if (it.name && it.website) entries.push({ nameLower: String(it.name).toLowerCase(), website: it.website });
    }
    return { byKey, byName, entries };
  } catch {}
  const rows = parseCSV(raw);
  const head = rows[0] || [];
  const idx = headerMap(head);
  const nameIdx = idx(['name','store','dispensary','dispensary name','business name']);
  const cityIdx = idx(['city','municipality','town']);
  const websiteIdx = idx(['website','menu','menu url','website url','link']);
  const byKey = new Map();
  const byName = new Map();
  const entries = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const nm = nameIdx >= 0 ? r[nameIdx] : '';
    const ct = cityIdx >= 0 ? r[cityIdx] : '';
    const ws = websiteIdx >= 0 ? r[websiteIdx] : '';
    if (!nm || !ws) continue;
    byKey.set(normKey(nm, ct), ws);
    byName.set(String(nm).toLowerCase(), ws);
    entries.push({ nameLower: String(nm).toLowerCase(), website: ws });
  }
  return { byKey, byName, entries };
}

function fuzzyLookup(name, city, map) {
  const n = String(name || '').toLowerCase();
  const key = normKey(name, city);
  if (map.byKey.has(key)) return map.byKey.get(key);
  if (map.byName.has(n)) return map.byName.get(n);
  for (const e of map.entries) {
    if (n.includes(e.nameLower) || e.nameLower.includes(n)) return e.website;
  }
  return '';
}

function sanitizeJsonString(s) {
  let out = s.replace(/^\uFEFF/, '');
  out = out.replace(/\/\*[\s\S]*?\*\//g, '');
  out = out.replace(/(^|[^:])\/\/.*$/gm, '$1');
  out = out.replace(/,\s*(\}|\])/g, '$1');
  return out;
}

function readJson(p) {
  const buf = fs.readFileSync(path.resolve(process.cwd(), p));
  const text = buf.toString('utf8');
  try { return JSON.parse(text); } catch { return JSON.parse(sanitizeJsonString(text)); }
}

const input = process.argv[2];
if (!input) { console.error('Usage: node scripts/ingest/apply_webmap.mjs <stores.json> --webmap <map.csv> [--inplace]'); process.exit(2); }
let webmapPath = null;
let inplace = false;
for (let i = 3; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (a === '--webmap') { webmapPath = process.argv[i+1]; i++; }
  else if (a === '--inplace') { inplace = true; }
}
webmapPath = webmapPath || 'scripts/ingest/website_map.csv';

const cfg = readJson(input);
const stores = Array.isArray(cfg?.stores) ? cfg.stores : (Array.isArray(cfg) ? cfg : []);
if (!stores.length) { console.error('Input must be { stores: [...] } or an array'); process.exit(2); }
let map = { byKey: new Map(), byName: new Map(), entries: [] };
try { map = loadMap(webmapPath); } catch {}

let updated = 0;
for (const s of stores) {
  const url = fuzzyLookup(s.name, s.city, map);
  if (!url) continue;
  const cur = String(s.website || '');
  const isPlaceholder = /iheartjane\.com\/dispensaries\//i.test(cur) || cur.trim() === '';
  if (isPlaceholder) {
    s.website = url;
    updated++;
  }
}
const outText = JSON.stringify(Array.isArray(cfg?.stores) ? { stores } : stores, null, 2);
if (inplace) {
  fs.writeFileSync(path.resolve(process.cwd(), input), outText);
  console.error(`Applied website map to ${input}. Updated ${updated} stores.`);
} else {
  console.error(`Applied website map. Updated ${updated} stores.`);
  process.stdout.write(outText);
}
