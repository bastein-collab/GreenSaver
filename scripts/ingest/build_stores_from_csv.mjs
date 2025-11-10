// scripts/ingest/build_stores_from_csv.mjs
// Converts a CSV of NJ stores into a JSON config, auto-detecting platform endpoints.
// Usage:
//   node -r dotenv/config scripts/ingest/build_stores_from_csv.mjs path/to/stores.csv > scripts/ingest/stores.nj.json
// CSV headers (case-insensitive, flexible):
//   name, city, postal_code(or zip), website, lat, lon
// Optional headers: state, store_id, platform

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

function readFile(p) {
  return fs.readFileSync(path.resolve(process.cwd(), p), 'utf8');
}

// Minimal CSV parser supporting quotes and commas
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
      else if (ch === '\r') { /* ignore */ }
      else { cur += ch; }
    }
  }
  if (cur.length || row.length) { pushCell(); pushRow(); }
  return rows;
}

function headerMap(cols) {
  const m = {};
  cols.forEach((c, idx) => { m[c.trim().toLowerCase()] = idx; });
  return (name, ...alts) => {
    const keys = [name, ...alts].flat().map((s) => String(s).toLowerCase());
    for (const k of keys) if (k in m) return m[k];
    return -1;
  };
}

function slugFromUrl(u) { try { const p = new URL(u).pathname.split('/').filter(Boolean); return p.length ? p[0].toLowerCase() : null; } catch { return null; } }
function originFromUrl(u) { try { return new URL(u).origin; } catch { return null; } }

function parseArgs(argv) {
  const out = { debug: false, webmap: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--debug') out.debug = true;
    if (a === '--webmap') { out.webmap = argv[i + 1]; i += 1; }
  }
  return out;
}

async function probeJsonEndpoint(url, headers) {
  try {
    const r = await fetch(url, { method: 'GET', headers, redirect: 'manual' });
    const ct = (r.headers.get('content-type') || '').toLowerCase();
    if (!(ct.includes('application/json') || ct.includes('json'))) return { ok: false, status: r.status };
    // light parse
    const txt = await r.text();
    if (!txt || !txt.trim().length) return { ok: true, status: r.status };
    try { JSON.parse(txt); } catch { return { ok: false, status: r.status }; }
    return { ok: true, status: r.status };
  } catch { return { ok: false, status: 0 }; }
}

async function detectEndpoint(website) {
  const origin = originFromUrl(website);
  if (!origin) return null;
  const headers = { accept: 'application/json, text/plain, */*', 'user-agent': 'Mozilla/5.0 (GreenSaver)' };
  // Quick platform detection from URL
  if (/iheartjane|jane\./i.test(website)) {
    // Try to derive a slug from URL path
    const slugMatch = website.match(/dispensaries\/([^\/\?]+)/i) || website.match(/stores\/([^\/\?]+)/i);
    const slug = slugMatch ? slugMatch[1] : (website.split('/').filter(Boolean).pop() || null);
    return { type: 'jane', slug: slug || null, headers: { ...headers, referer: website, origin }, pageSize: 100, maxPages: 5 };
  }
  if (/dutchie/i.test(website) || /(dtche%5B|dtche%5b|\bdtche\b)/i.test(website)) {
    const slugMatch = website.match(/dispensary\/([^\/\?]+)/i) || website.match(/stores?\/([^\/\?]+)/i);
    const slug = slugMatch ? slugMatch[1] : (website.split('/').filter(Boolean).pop() || null);
    return { type: 'dutchie', slug: slug || null, headers: { ...headers, referer: website, origin }, pageSize: 100, maxPages: 5 };
  }
  // Lightweight HTML sniff for embeds
  try {
    const r = await fetch(website, { method: 'GET', headers: { 'user-agent': 'Mozilla/5.0', accept: 'text/html, */*;q=0.1' }, redirect: 'follow' });
    if (r.ok) {
      const html = await r.text();
      if (/iheartjane|storeSlug|jane-embed/i.test(html)) {
        return { type: 'jane', slug: null, headers: { ...headers, referer: website, origin }, pageSize: 100, maxPages: 5 };
      }
      if (/dutchie|dispensarySlug|dtche|Dutchie/i.test(html)) {
        return { type: 'dutchie', slug: null, headers: { ...headers, referer: website, origin }, pageSize: 100, maxPages: 5 };
      }
    }
  } catch {}
  const candidates = [
    '/_api/Products/GetProductList',
    '/_api/Product/GetProductList',
    '/api/Products/GetProductList',
  ];
  for (const ep of candidates) {
    const url = `${origin}${ep}`;
    const pr = await probeJsonEndpoint(url, headers);
    if (pr.ok) return { url, method: 'POST', pageSize: 150, maxPages: 5 };
  }
  // Heuristics for other platforms (placeholder; you can extend):
  // - Dutchie/Leafly/Jane require platform-specific adapters; mark type for later handling.
  if (/iheartjane|jane\./i.test(website)) {
    return { type: 'jane', skip: true, note: 'Jane platform detected; adapter required' };
  }
  if (/dutchie|dutchie\.com/i.test(website)) {
    return { type: 'dutchie', skip: true, note: 'Dutchie platform detected; adapter required' };
  }
  return null;
}

function normKey(name, city) {
  const n = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const c = String(city || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return `${n}__${c}`;
}

function loadWebMap(p) {
  if (!p) return { byKey: new Map(), byName: new Map() };
  try {
    const raw = readFile(p);
    // Try JSON first
    try {
      const arr = JSON.parse(raw);
      const byKey = new Map();
      const byName = new Map();
      for (const it of arr) {
        const key = normKey(it.name, it.city);
        if (it.website) byKey.set(key, it.website);
        if (it.name && it.website) byName.set(String(it.name).toLowerCase(), it.website);
      }
      return { byKey, byName };
    } catch {}
    // CSV fallback
    const rows = parseCSV(raw);
    const head = rows[0] || [];
    const idx = headerMap(head);
    const nameIdx = idx(['name','store','dispensary','dispensary name','business name']);
    const cityIdx = idx(['city','municipality','town']);
    const websiteIdx = idx(['website','menu','menu url','website url','link']);
    const byKey = new Map();
    const byName = new Map();
    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const nm = nameIdx >= 0 ? r[nameIdx] : '';
      const ct = cityIdx >= 0 ? r[cityIdx] : '';
      const ws = websiteIdx >= 0 ? r[websiteIdx] : '';
      if (!nm || !ws) continue;
      byKey.set(normKey(nm, ct), ws);
      byName.set(String(nm).toLowerCase(), ws);
    }
    return { byKey, byName };
  } catch {
    return { byKey: new Map(), byName: new Map() };
  }
}

async function build(csvPath) {
  const opts = parseArgs(process.argv);
  const webmap = loadWebMap(opts.webmap);
  const text = readFile(csvPath);
  const rows = parseCSV(text);
  if (!rows.length) throw new Error('Empty CSV');
  const head = rows[0];
  const idx = headerMap(head);
  const out = [];
  let missingWebsite = 0, missingZip = 0, usedWebmap = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;
    const envCol = (name) => (process.env[name] || '').split('|').map((s)=>s.trim()).filter(Boolean);
    const name = r[idx(envCol('CSV_NAME_COL').length? envCol('CSV_NAME_COL') : ['name','store','store_name','dispensary','dispensary_name','business name'])] || '';
    const city = r[idx(envCol('CSV_CITY_COL').length? envCol('CSV_CITY_COL') : ['city','municipality','town','place'])] || '';
    const postal = r[idx(envCol('CSV_ZIP_COL').length? envCol('CSV_ZIP_COL') : ['postal_code','zip','zip_code','zipcode','postal','post_code','zip code'])] || '';
    const website = r[idx(envCol('CSV_WEBSITE_COL').length? envCol('CSV_WEBSITE_COL') : ['website','menu','menu_url','url','link','website_url','menu link','menu_link','website url','menu page','menu page url'])] || '';
    const lat = Number(r[idx(envCol('CSV_LAT_COL').length? envCol('CSV_LAT_COL') : ['lat','latitude','y','lat_dd'])] || '');
    const lon = Number(r[idx(envCol('CSV_LON_COL').length? envCol('CSV_LON_COL') : ['lon','lng','longitude','x','lon_dd'])] || '');
    const state = r[idx(envCol('CSV_STATE_COL').length? envCol('CSV_STATE_COL') : ['state','st'])] || 'NJ';
    const store_id = r[idx(envCol('CSV_STORE_ID_COL').length? envCol('CSV_STORE_ID_COL') : ['store_id','storeid','id'])] || '';
    // Enrich website from webmap if missing
    let websiteFilled = website;
    const k = normKey(name, city);
    const mapped = webmap.byKey.get(k) || webmap.byName.get(String(name || '').toLowerCase()) || '';
    // Prefer webmap mapping if provided (allows overrides of auto-discovered URLs)
    if (mapped) { websiteFilled = mapped; usedWebmap++; }
    const base = { name, city, state, postal_code: postal, website: websiteFilled, lat, lon };
    let source = null;
    try { source = await detectEndpoint(websiteFilled); } catch {}
    // Add sensible default headers if endpoint detected
    if (source && source.url) {
      const origin = originFromUrl(websiteFilled);
      source.headers = {
        accept: 'application/json, text/plain, */*',
        'content-type': 'application/json',
        origin,
        referer: websiteFilled,
        'user-agent': 'Mozilla/5.0 (GreenSaver)'
      };
    }
    out.push({ ...base, store_id: store_id || undefined, slug: slugFromUrl(website) || undefined, source: source || undefined });
    if (!websiteFilled) missingWebsite++;
    if (!postal) missingZip++;
    // small delay to avoid hammering
    await new Promise((res)=>setTimeout(res, 50));
  }
  console.error(`Parsed ${out.length} rows. Missing website: ${missingWebsite}, missing ZIP: ${missingZip}, webmap used: ${usedWebmap}`);
  if (opts.debug) {
    console.error('Detected headers:', head);
  }
  console.log(JSON.stringify({ stores: out }, null, 2));
}

build(process.argv[2]).catch((e) => { console.error('BUILD ERROR:', e?.message || e); process.exit(1); });
