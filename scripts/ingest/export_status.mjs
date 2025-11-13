// scripts/ingest/export_status.mjs
// Generate two CSVs summarizing current mapping status from scripts/ingest/stores.nj.json
// - scripts/ingest/dispensaries_status.csv         (all stores with placeholder flag)
// - scripts/ingest/dispensaries_needing_urls.csv   (subset still needing real URLs)

import fs from 'node:fs';
import path from 'node:path';

function readJson(p) {
  const full = path.resolve(process.cwd(), p);
  const raw = fs.readFileSync(full, 'utf8');
  try { return JSON.parse(raw); } catch { return JSON.parse(raw.replace(/,\s*(\}|\])/g, '$1')); }
}

function toCsv(rows) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const out = [headers.map(esc).join(',')];
  for (const r of rows) out.push(headers.map((h) => esc(r[h])).join(','));
  return out.join('\n') + '\n';
}

function isPlaceholder(url) {
  const u = String(url || '');
  return !u || /iheartjane\.com\/dispensaries\//i.test(u);
}

function main() {
  const storesPath = 'scripts/ingest/stores.nj.json';
  const outDir = 'scripts/ingest';
  const j = readJson(storesPath);
  const stores = Array.isArray(j?.stores) ? j.stores : Array.isArray(j) ? j : [];
  if (!stores.length) {
    console.error('No stores found in', storesPath);
    process.exit(2);
  }
  const rowsAll = stores.map((s) => ({
    name: s.name || '',
    city: s.city || '',
    zip: s.postal_code || '',
    website: String(s.website || ''),
    placeholder: String(isPlaceholder(s.website)),
    platform: (s.source && s.source.type) || '',
    lat: s.lat ?? '',
    lon: s.lon ?? ''
  }));
  const rowsMissing = rowsAll.filter((r) => r.placeholder === 'true').map(({ placeholder, platform, lat, lon, ...rest }) => rest);

  const p1 = path.join(outDir, 'dispensaries_status.csv');
  const p2 = path.join(outDir, 'dispensaries_needing_urls.csv');
  fs.writeFileSync(p1, toCsv(rowsAll), 'utf8');
  fs.writeFileSync(p2, toCsv(rowsMissing), 'utf8');
  console.log('Wrote', p1, '(', rowsAll.length, 'rows )');
  console.log('Wrote', p2, '(', rowsMissing.length, 'rows need URLs )');
}

main();

