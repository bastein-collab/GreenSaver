// scripts/ingest/auto_discover_websites.mjs
// Attempts to auto-discover menu URLs (Jane/Dutchie) using name/city heuristics.
// Input: a JSON built by build_stores_from_csv.mjs (without websites), or your CSV.
// Output: website_map.csv (name,city,zip,website) with discovered URLs filled.
// Usage:
//   node -r dotenv/config scripts/ingest/auto_discover_websites.mjs scripts/ingest/stores.nj.json > scripts/ingest/website_map.csv

import fs from 'node:fs';
import path from 'node:path';

function read(p) { return fs.readFileSync(path.resolve(process.cwd(), p), 'utf8'); }
function writeCsv(rows) { return rows.map(r => r.map(c => '"' + String(c ?? '').replace(/"/g, '""') + '"').join(',')).join('\n'); }

function sanitizeJsonString(s) {
  let out = s.replace(/^\uFEFF/, '');
  out = out.replace(/\/\*[\s\S]*?\*\//g, '');
  out = out.replace(/(^|[^:])\/\/.*$/gm, '$1');
  out = out.replace(/,\s*(\}|\])/g, '$1');
  return out;
}

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
      } else { cur += ch; }
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

function readStores(p) {
  const raw = read(p);
  // Try JSON first
  try { return JSON.parse(raw).stores || []; } catch {}
  try { return JSON.parse(sanitizeJsonString(raw)).stores || []; } catch {}
  // Fallback: CSV
  const rows = parseCSV(raw);
  if (!rows.length) throw new Error('Empty input');
  const head = rows[0];
  const idx = headerMap(head);
  const nameIdx = idx(['name','store','dispensary','dispensary name','business name']);
  const cityIdx = idx(['city','municipality','town']);
  const zipIdx = idx(['postal_code','zip','zip_code','zipcode','post code','zip code']);
  if (nameIdx < 0 || cityIdx < 0) throw new Error('Invalid CSV: need name and city headers');
  const stores = [];
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const name = r[nameIdx];
    const city = r[cityIdx];
    const postal_code = zipIdx >= 0 ? r[zipIdx] : '';
    if (!name) continue;
    stores.push({ name, city, postal_code });
  }
  return stores;
}

const STOP_WORDS = new Set(['dispensary','cannabis','the','llc','inc','co','company','store','shop']);
function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}
function simplifyName(name) {
  const parts = String(name||'').split(/[^a-z0-9]+/i).filter(Boolean);
  return parts.filter(p => !STOP_WORDS.has(p.toLowerCase())).join(' ');
}

async function pageLooksLike(url, platform) {
  try {
    const r = await fetch(url, { method: 'GET', redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0', accept: 'text/html, */*;q=0.1' } });
    if (!r.ok) return false;
    const html = await r.text();
    if (platform === 'jane') {
      return /iheartjane|window\.__APOLLO_STATE__|graphql|storeSlug/i.test(html);
    }
    if (platform === 'dutchie') {
      return /dutchie|window\.__APOLLO_STATE__|dispensarySlug|graphql/i.test(html);
    }
    return false;
  } catch { return false; }
}

function extractJaneStoreMenus(html, baseUrl, city, zip) {
  const out = [];
  const re = /href=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) {
    let href = m[1];
    if (!/iheartjane\.com\/stores\//i.test(href)) continue;
    try { href = new URL(href, baseUrl).toString(); } catch {}
    if (!/\/menu(\/|$)/i.test(href)) href = href.replace(/\/$/, '') + '/menu';
    out.push(href);
  }
  // score candidates for NJ
  const cityLower = String(city || '').toLowerCase();
  const zipDigits = String(zip || '').replace(/[^0-9]/g, '');
  const scored = out.map((u) => {
    let score = 0;
    if (/\bnew-?jersey\b|\bnj\b/i.test(u)) score += 2;
    if (cityLower && u.toLowerCase().includes(cityLower)) score += 2;
    if (zipDigits && u.includes(zipDigits)) score += 3;
    return { u, score };
  }).sort((a,b)=>b.score-a.score);
  return Array.from(new Set(scored.map(x=>x.u)));
}

async function searchJaneStore(name, city) {
  try {
    const graphUrl = process.env.JANE_GRAPHQL_URL || 'https://apigw.iheartjane.com/graphql';
    const q = {
      query: `query SearchStores($query:String!){
        search(query:$query){
          stores{ id name slug city state }
        }
      }`,
      variables: { query: `${name} ${city} NJ` }
    };
    const r = await fetch(graphUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(q) });
    if (!r.ok) return '';
    const j = await r.json();
    const stores = j?.data?.search?.stores || [];
    if (!stores.length) return '';
    // prefer exact-ish name match and NJ
    const n = String(name || '').toLowerCase();
    const c = String(city || '').toLowerCase();
    const sorted = stores.map(s => {
      let score = 0;
      if ((s.state||'').toLowerCase() === 'nj') score += 2;
      if (s.name && s.name.toLowerCase().includes(n)) score += 2;
      if (s.city && s.city.toLowerCase().includes(c)) score += 2;
      return { s, score };
    }).sort((a,b)=>b.score-a.score);
    const top = sorted[0]?.s;
    if (!top?.id || !top?.slug) return '';
    return `https://www.iheartjane.com/stores/${top.id}/${top.slug}/menu`;
  } catch { return ''; }
}

async function discoverFor(store) {
  const name = store.name || '';
  const city = store.city || '';
  const zip = store.postal_code || '';
  const s1 = slugify(simplifyName(name));
  const c1 = slugify(city);
  const candidates = [];
  // Try Jane GraphQL search first for precise store menu
  const byGraph = await searchJaneStore(name, city);
  if (byGraph) return byGraph;
  // Jane patterns
  for (const domain of ['https://www.iheartjane.com/dispensaries','https://www.iheartjane.com/stores']) {
    candidates.push(`${domain}/${s1}`);
    if (c1) candidates.push(`${domain}/${s1}-${c1}`);
    if (c1) candidates.push(`${domain}/${s1}-${c1}-nj`);
  }
  // Dutchie patterns
  for (const domain of ['https://dutchie.com/dispensary','https://www.dutchie.com/dispensary']) {
    candidates.push(`${domain}/${s1}`);
    if (c1) candidates.push(`${domain}/${s1}-${c1}`);
    if (c1) candidates.push(`${domain}/${s1}-${c1}-nj`);
  }
  for (const u of candidates) {
    if (u.includes('iheartjane') && await pageLooksLike(u, 'jane')) {
      // If this is a dispensaries landing, dig out store menu links and prefer one
      try {
        const r = await fetch(u, { method: 'GET', headers: { 'user-agent': 'Mozilla/5.0', accept: 'text/html, */*;q=0.1' } });
        if (r.ok) {
          const html = await r.text();
          const menus = extractJaneStoreMenus(html, u, city, zip);
          if (menus.length) return menus[0];
        }
      } catch {}
      return u;
    }
    if (u.includes('dutchie') && await pageLooksLike(u, 'dutchie')) return u;
  }
  return '';
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: node scripts/ingest/auto_discover_websites.mjs <stores.json>');
    process.exit(2);
  }
  const stores = readStores(input);
  const out = [['name','city','zip','website']];
  for (const s of stores) {
    const website = await discoverFor(s);
    out.push([s.name || '', s.city || '', s.postal_code || '', website]);
  }
  console.log(writeCsv(out));
}

main().catch(e => { console.error('DISCOVER ERROR:', e?.message || e); process.exit(1); });
