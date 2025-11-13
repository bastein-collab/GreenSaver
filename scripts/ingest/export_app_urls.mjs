// scripts/ingest/export_app_urls.mjs
// Produce a single CSV for app import by matching stores.nj.json to website_map.csv
// Output: scripts/ingest/app_menu_urls.csv with: name,city,zip,website

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
function headerMap(cols) { const m={}; cols.forEach((c,i)=>m[String(c).trim().toLowerCase()]=i); return (alts)=>[].concat(alts).map(s=>String(s).toLowerCase()).find(k=>k in m) ?? -1; }
function toCsv(rows){ if(!rows.length) return ''; const headers=Object.keys(rows[0]); const esc=v=>'"'+String(v??'').replace(/"/g,'""')+'"'; return [headers.map(esc).join(',')].concat(rows.map(r=>headers.map(h=>esc(r[h])).join(','))).join('\n')+'\n'; }

function normKey(name, city) {
  const n = String(name||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  const c = String(city||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
  return `${n}__${c}`;
}

function loadMap(p){
  const raw = read(p);
  const rows = parseCSV(raw);
  const head = rows[0]||[]; const idx=headerMap(head);
  const nameIdx = idx(['name','store','dispensary','dispensary name','business name']);
  const cityIdx = idx(['city','municipality','town']);
  const websiteIdx = idx(['website','menu','menu url','website url','link']);
  const byKey = new Map(); const byName = new Map(); const entries=[];
  for(let i=1;i<rows.length;i++){
    const r=rows[i]; const nm=r[nameIdx]||''; const ct=r[cityIdx]||''; const ws=r[websiteIdx]||''; if(!nm||!ws) continue;
    byKey.set(normKey(nm,ct),ws); byName.set(String(nm).toLowerCase(), ws); entries.push({nameLower:String(nm).toLowerCase(), website:ws});
  }
  return { byKey, byName, entries };
}
function fuzzyLookup(name, city, map){
  const n=String(name||'').toLowerCase(); const key=normKey(name, city);
  if(map.byKey.has(key)) return map.byKey.get(key);
  if(map.byName.has(n)) return map.byName.get(n);
  for(const e of map.entries){ if(n.includes(e.nameLower) || e.nameLower.includes(n)) return e.website; }
  return '';
}

function readStores(p){ const j = JSON.parse(read(p)); return Array.isArray(j?.stores)? j.stores : (Array.isArray(j)? j : []); }

function main(){
  const storesPath='scripts/ingest/stores.nj.json';
  const mapPath='scripts/ingest/website_map.csv';
  const outPath='scripts/ingest/app_menu_urls.csv';
  const stores=readStores(storesPath); const map=loadMap(mapPath);
  let matched=0; const out=[];
  for(const s of stores){ const url=fuzzyLookup(s.name, s.city, map); if(url) matched++; out.push({ name:s.name||'', city:s.city||'', zip:s.postal_code||'', website:url }); }
  fs.writeFileSync(outPath, toCsv(out), 'utf8');
  console.log(`App import file written: ${outPath}. Matched ${matched}/${stores.length}.`);
}

main();

