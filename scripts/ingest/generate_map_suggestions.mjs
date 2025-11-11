// scripts/ingest/generate_map_suggestions.mjs
// Generate suggested website mappings for stores that still have placeholder websites
// (Jane /dispensaries/... or empty). Does NOT modify existing files; prints CSV to stdout.
// Usage:
//   node -r dotenv/config scripts/ingest/generate_map_suggestions.mjs \
//     scripts/ingest/stores.nj.json scripts/ingest/website_map.csv \
//     > scripts/ingest/website_map.suggestions.csv

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

function readStores(jsonPath) {
  const raw = read(jsonPath);
  try { return JSON.parse(raw).stores || []; } catch {}
  try { return JSON.parse(sanitizeJsonString(raw)).stores || []; } catch {}
  throw new Error('Invalid stores JSON input');
}

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
function citySlugify(city) { return slugify(city).replace(/^nj-/, ''); }
function normBrandKey(name) {
  const parts = simplifyName(name).toLowerCase().split(/\s+/).filter(Boolean);
  return parts.slice(0,2).join(' ');
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
    return /<html|<!DOCTYPE/i.test(html);
  } catch { return false; }
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

function learnTemplatesFromMap(mapCsvPath) {
  const learned = new Map(); // brandKey -> Set<template>
  try {
    const raw = read(mapCsvPath);
    const rows = parseCSV(raw);
    if (!rows.length) return learned;
    const idx = headerMap(rows[0]);
    const nameIdx = idx(['name','store','dispensary','dispensary name','business name']);
    const cityIdx = idx(['city','municipality','town']);
    const websiteIdx = idx(['website','menu','menu url','website url','link']);
    for (let i = 1; i < rows.length; i++) {
      const nm = rows[i][nameIdx] || '';
      const ct = rows[i][cityIdx] || '';
      const ws = rows[i][websiteIdx] || '';
      if (!nm || !ct || !ws) continue;
      const key = normBrandKey(nm);
      const cslug = citySlugify(ct);
      try {
        const u = new URL(ws);
        let templ = '';
        if (cslug && (u.pathname.includes(`/${cslug}/`) || u.pathname.endsWith(`/${cslug}`))) {
          templ = u.toString().replace(new RegExp(`/${cslug}(?=/|$)`), '/{city}');
        } else if (cslug && u.hostname.includes(cslug)) {
          templ = u.toString().replace(cslug, '{city}');
        }
        if (templ && templ.includes('{city}')) {
          if (!learned.has(key)) learned.set(key, new Set());
          learned.get(key).add(templ);
        }
      } catch {}
    }
  } catch {}
  return learned;
}

function brandCandidates(name, city, learnedTemplates) {
  const out = [];
  const c1 = citySlugify(city || '');
  const key = normBrandKey(name || '');
  const learned = learnedTemplates.get(key);
  if (learned && c1) {
    for (const t of learned) out.push(t.replace('{city}', c1));
  }
  // Hand-authored patterns to expand coverage fast
  if (/\bzen\s*leaf\b/i.test(name)) {
    if (c1) {
      out.push(`https://zenleafdispensaries.com/locations/${c1}/menu/menu/discounts?promo=products`);
      out.push(`https://zenleafdispensaries.com/locations/${c1}/menu/recreational/menu/discounts?promo=deals`);
    }
  }
  if (/apothecarium/i.test(name)) {
    if (c1) {
      out.push(`https://shop.apothecarium.com/${c1}/recreational/menu?filters=%7B%22quickFilter%22%3A%5B2%5D%7D`);
      out.push(`https://shop.apothecarium.com/${c1}/recreational/menu`);
    }
  }
  if (/\bbotanist\b/i.test(name)) {
    if (c1) {
      out.push(`https://shopbotanist.com/locations/${c1}-dispensary/shop-adult-use/menu/specials`);
      out.push(`https://shopbotanist.com/locations/${c1}-dispensary/shop-adult-use/menu`);
    }
  }
  if (/\bcannabist\b/i.test(name)) {
    if (c1) {
      out.push(`https://www.gocannabist.com/stores/new-jersey/${c1}/shop/recreational/menu/discounts?promo=products`);
      out.push(`https://www.gocannabist.com/stores/new-jersey/${c1}/shop/recreational/menu`);
    }
  }
  if (/social\s*leaf/i.test(name)) {
    if (c1) {
      out.push(`https://shop.thesocialleaf.com/${c1}/menu/discounts?promo=products`);
      out.push(`https://shop.thesocialleaf.com/${c1}/menu`);
    }
  }
  if (/valley\s*wellness/i.test(name)) {
    if (c1) out.push(`https://shop.valleywellnessnj.com/${c1}/menu/discounts`);
  }
  if (/cookies/i.test(name)) {
    if (c1) { out.push(`https://${c1}.cookies.co/specials`); out.push(`https://${c1}.cookies.co/`); }
  }
  if (/high\s*profile/i.test(name)) {
    if (c1) out.push(`https://dutchie.com/dispensary/nj-${c1}-hp/specials`);
  }
  if (/\bascend\b/i.test(name)) {
    if (c1) out.push(`https://letsascend.com/stores/${c1}-new-jersey/specials`);
  }
  if (/frosted\s*nug/i.test(name)) {
    if (c1) out.push(`https://frostednug.com/menu/${c1}/offers`);
  }
  return out;
}

function buildGenericCandidates(name, city) {
  const out = [];
  const s1 = slugify(simplifyName(name));
  const c1 = slugify(city);
  // Dutchie
  for (const domain of ['https://dutchie.com/dispensary','https://www.dutchie.com/dispensary']) {
    out.push(`${domain}/${s1}`);
    out.push(`${domain}/${s1}/specials`);
    if (c1) out.push(`${domain}/${s1}-${c1}`);
    if (c1) out.push(`${domain}/${s1}-${c1}/specials`);
    if (c1) out.push(`${domain}/${s1}-${c1}-nj`);
  }
  return out;
}

function scoreCandidate(u, city) {
  const c1 = citySlugify(city || '');
  let score = 0;
  if (/\bdeals|specials|offers|discounts\b/i.test(u)) score += 4;
  if (c1 && u.toLowerCase().includes(`/${c1}`)) score += 2;
  if (/dutchie\.com/.test(u)) score += 1;
  return score;
}

async function suggestForStore(store, learnedTemplates) {
  const name = store.name || '';
  const city = store.city || '';
  const suggestions = [];
  // Prefer official Jane store menu if available
  const janeMenu = await searchJaneStore(name, city);
  if (janeMenu) suggestions.push({ u: janeMenu, score: 10, source: 'jane-graphql' });
  // Brand-specific + learned templates
  for (const u of brandCandidates(name, city, learnedTemplates)) {
    const ok = await pageLooksLike(u, /dutchie/.test(u) ? 'dutchie' : undefined);
    if (ok) suggestions.push({ u, score: scoreCandidate(u, city) + 5, source: 'brand' });
  }
  // Generic patterns
  for (const u of buildGenericCandidates(name, city)) {
    const ok = await pageLooksLike(u, /dutchie/.test(u) ? 'dutchie' : undefined);
    if (ok) suggestions.push({ u, score: scoreCandidate(u, city), source: 'generic' });
  }
  if (!suggestions.length) return null;
  suggestions.sort((a,b)=>b.score-a.score);
  return suggestions[0];
}

async function main() {
  const storesPath = process.argv[2] || 'scripts/ingest/stores.nj.json';
  const mapPath = process.argv[3] || 'scripts/ingest/website_map.csv';
  const stores = readStores(storesPath);
  const learned = learnTemplatesFromMap(mapPath);
  const out = [['name','city','zip','website','confidence','source']];
  for (const s of stores) {
    const w = String(s.website || '');
    const isPlaceholder = !w || /iheartjane\.com\/dispensaries\//i.test(w);
    if (!isPlaceholder) continue;
    try {
      const best = await suggestForStore(s, learned);
      if (best?.u) {
        out.push([s.name || '', s.city || '', s.postal_code || '', best.u, String(best.score), best.source || '']);
      } else {
        out.push([s.name || '', s.city || '', s.postal_code || '', '', '', '']);
      }
    } catch {
      out.push([s.name || '', s.city || '', s.postal_code || '', '', '', '']);
    }
  }
  process.stdout.write(writeCsv(out) + '\n');
}

main().catch(e => { console.error('SUGGESTIONS ERROR:', e?.message || e); process.exit(1); });

