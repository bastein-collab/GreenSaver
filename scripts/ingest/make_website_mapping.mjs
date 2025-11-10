// scripts/ingest/make_website_mapping.mjs
// Generates a stub website-mapping CSV from a base stores CSV.
// Usage:
//   node scripts/ingest/make_website_mapping.mjs path/to/stores.csv > scripts/ingest/website_map.csv

import fs from 'node:fs';
import path from 'node:path';

function readFile(p) { return fs.readFileSync(path.resolve(process.cwd(), p), 'utf8'); }

function parseCSV(text) {
  const rows = [];
  let i = 0, cur = '', row = [], inQ = false;
  function pushCell() { row.push(cur); cur = ''; }
  function pushRow() { rows.push(row); row = []; }
  while (i < text.length) {
    const ch = text[i++];
    if (inQ) {
      if (ch === '"') {
        if (text[i] === '"') { cur += '"'; i++; } else { inQ = false; }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') { inQ = true; }
      else if (ch === ',') { pushCell(); }
      else if (ch === '\n') { pushCell(); pushRow(); }
      else if (ch === '\r') { /* skip */ }
      else { cur += ch; }
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

const p = process.argv[2];
if (!p) { console.error('Usage: node scripts/ingest/make_website_mapping.mjs <stores.csv>'); process.exit(2); }

const text = readFile(p);
const rows = parseCSV(text);
if (!rows.length) { console.error('Empty CSV'); process.exit(2); }
const head = rows[0];
const idx = headerMap(head);
const nameIdx = idx(['name','store','store_name','dispensary','dispensary name','business name']);
const cityIdx = idx(['city','municipality','town']);
const zipIdx = idx(['postal_code','zip','zip_code','zipcode','post code']);

const out = [['name','city','zip','website']];
const seen = new Set();
for (let i = 1; i < rows.length; i++) {
  const r = rows[i];
  const nm = nameIdx >= 0 ? r[nameIdx] : '';
  const ct = cityIdx >= 0 ? r[cityIdx] : '';
  const zp = zipIdx >= 0 ? r[zipIdx] : '';
  if (!nm) continue;
  const key = `${nm}__${ct}`;
  if (seen.has(key)) continue;
  seen.add(key);
  out.push([nm, ct, zp, '']);
}

const csv = out.map((row)=> row.map((c)=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
console.log(csv);

