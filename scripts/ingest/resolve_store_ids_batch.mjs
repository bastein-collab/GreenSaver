// scripts/ingest/resolve_store_ids_batch.mjs
// Batch resolve storeIds for many stores and print a JSON with results.
// Input: a JSON file like scripts/ingest/stores.nj.json
// Usage:
//   node -r dotenv/config scripts/ingest/resolve_store_ids_batch.mjs scripts/ingest/stores.nj.json > scripts/ingest/stores.nj.resolved.json
// After that, run multi-store ingest using the resolved file.

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';

function sanitizeJsonString(s) {
  let out = s.replace(/^\uFEFF/, ''); // strip BOM
  // strip /* */ comments
  out = out.replace(/\/\*[\s\S]*?\*\//g, '');
  // strip // comments (naive, avoids lines with "://")
  out = out.replace(/(^|[^:])\/\/.*$/gm, '$1');
  // remove trailing commas before } or ]
  out = out.replace(/,\s*(\}|\])/g, '$1');
  return out;
}

function readJson(p) {
  const full = path.resolve(process.cwd(), p);
  const buf = fs.readFileSync(full);
  let text;
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    text = buf.slice(3).toString('utf8');
  } else if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
    // UTF-16 LE
    text = buf.slice(2).toString('utf16le');
  } else if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {
    // UTF-16 BE -> swap to LE
    const swapped = Buffer.allocUnsafe(buf.length - 2);
    for (let i = 2; i < buf.length; i += 2) {
      swapped[i - 2] = buf[i + 1];
      swapped[i - 1] = buf[i];
    }
    text = swapped.toString('utf16le');
  } else {
    text = buf.toString('utf8');
  }
  try {
    return JSON.parse(text);
  } catch {
    const cleaned = sanitizeJsonString(text);
    return JSON.parse(cleaned);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function tryStoresApi(origin, endpoints, headers, needleSlug, postalCode, cityHint) {
  for (const ep of endpoints) {
    try {
      const url = `${origin}${ep}`;
      const res = await fetch(url, { headers });
      if (!res.ok) continue;
      const data = await res.json();
      const list = Array.isArray(data) ? data : (Array.isArray(data?.stores) ? data.stores : []);
      if (!Array.isArray(list)) continue;
      const norm = list.map((s) => ({ id: s?.id, slug: (s?.slug || '').toLowerCase(), name: (s?.name || '').toLowerCase(), postal: String(s?.postalCode || s?.postal_code || '') }));
      if (needleSlug) {
        const bySlug = norm.find((s) => s.slug === needleSlug || s.name.includes(needleSlug));
        if (bySlug?.id) return String(bySlug.id);
      }
      if (postalCode) {
        const byZip = norm.find((s) => s.postal.includes(postalCode));
        if (byZip?.id) return String(byZip.id);
      }
      if (cityHint) {
        const k = cityHint.split(',')[0].trim().toLowerCase();
        const byCity = norm.find((s) => s.name.includes(k) || s.slug.includes(k));
        if (byCity?.id) return String(byCity.id);
      }
      if (norm.length === 1 && norm[0].id) return String(norm[0].id);
    } catch {}
  }
  return null;
}

async function tryPageHtml(pageUrl, headers) {
  try {
    const r = await fetch(pageUrl, { headers });
    if (!r.ok) return null;
    const html = await r.text();
    // Generic GUID-like id
    const m = html.match(/storeId["']?\s*[:=]\s*["']([0-9a-fA-F-]{20,})["']/)
          || html.match(/data-storeid=["']([0-9a-fA-F-]{20,})["']/)
          || html.match(/"storeId"\s*:\s*"([0-9a-fA-F-]{20,})"/);
    if (m && m[1]) return { id: m[1] };

    // Dutchie embed hints (slug/id)
    const slug = (html.match(/dispensarySlug["']?\s*[:=]\s*["']([a-z0-9-]{3,})["']/i) || html.match(/"slug"\s*:\s*"([a-z0-9-]{3,})"/i))?.[1] || null;
    const did = (html.match(/dispensaryId["']?\s*[:=]\s*["']([A-Za-z0-9_-]{8,})["']/i) || html.match(/locationId["']?\s*[:=]\s*["']([A-Za-z0-9_-]{8,})["']/i))?.[1] || null;
    if (slug || did) return { id: did || null, type: 'dutchie', slug };

    // Jane embed hints (slug)
    const jSlug = (html.match(/iheartjane\.com\/dispensaries\/([a-z0-9-]{3,})/i) || html.match(/data-jane-?store-?slug=["']([a-z0-9-]{3,})["']/i) || html.match(/"storeSlug"\s*:\s*"([a-z0-9-]{3,})"/i))?.[1] || null;
    if (jSlug) return { id: null, type: 'jane', slug: jSlug };
  } catch {}
  return null;
}

function slugFromUrl(u) {
  try { const p = new URL(u).pathname.split('/').filter(Boolean); return p.length ? p[0].toLowerCase() : null; } catch { return null; }
}

async function resolveOne(store) {
  const origin = (() => { try { return new URL(store.website).origin; } catch { return null; } })();
  const slug = store.slug || slugFromUrl(store.website) || null;

  const defaultHeaders = {
    accept: 'application/json, text/plain, */*',
    'user-agent': 'Mozilla/5.0 (GreenSaver)'
  };
  const htmlHeaders = {
    accept: 'text/html, */*;q=0.1',
    'user-agent': 'Mozilla/5.0 (GreenSaver)',
    referer: store.website
  };
  const endpoints = [process.env.DEALS_STORES_ENDPOINT || '/_api/Stores/GetStores', '/_api/Stores', '/api/Stores', '/api/stores', '/stores'];

  if (!origin) return { ...store, store_id: store.store_id || null, _error: 'no-origin' };

  // 0) Jane shortcut: upgrade dispensaries/<slug> to stores/<id>/<slug>/menu via GraphQL
  try {
    if (/iheartjane\.com\/dispensaries\//i.test(store.website)) {
      const m = store.website.match(/dispensaries\/([^\/?#]+)/i);
      const jSlug = (m && m[1]) || slug || '';
      if (jSlug) {
        const graphUrl = process.env.JANE_GRAPHQL_URL || 'https://apigw.iheartjane.com/graphql';
        const q = { query: "query StoreBySlug($slug:String!){ store(slug:$slug){ id slug } }", variables: { slug: jSlug } };
        const r = await fetch(graphUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(q) });
        if (r.ok) {
          const j = await r.json();
          const id = j?.data?.store?.id || null;
          const sslug = j?.data?.store?.slug || jSlug;
          if (id) {
            const upgraded = `https://www.iheartjane.com/stores/${id}/${sslug}/menu`;
            return { ...store, website: upgraded, source: { ...(store.source || {}), type: 'jane', slug: sslug } };
          }
        }
      }
    }
    // Ensure Jane store URLs include /menu
    if (/iheartjane\.com\/stores\//i.test(store.website) && !/\/menu(\/|$)/i.test(store.website)) {
      return { ...store, website: store.website.replace(/\/$/, '') + '/menu' };
    }
  } catch {}

  // 1) Use API
  const fromApi = await tryStoresApi(origin, endpoints, defaultHeaders, slug, store.postal_code, store.city);
  if (fromApi) return { ...store, store_id: fromApi };

  // 2) HTML fallback
  const fromHtml = await tryPageHtml(store.website, htmlHeaders);
  if (fromHtml) {
    if (typeof fromHtml === 'string') return { ...store, store_id: fromHtml };
    const next = { ...store, store_id: fromHtml.id || store.store_id };
    if (fromHtml.type === 'dutchie') {
      next.source = { ...(store.source || {}), type: 'dutchie', slug: fromHtml.slug || (store.source && store.source.slug) || null };
    } else if (fromHtml.type === 'jane') {
      next.source = { ...(store.source || {}), type: 'jane', slug: fromHtml.slug || (store.source && store.source.slug) || null };
    }
    return next;
  }

  return { ...store, store_id: store.store_id || null, _error: 'not-found' };
}

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: node scripts/ingest/resolve_store_ids_batch.mjs <stores.json>');
    process.exit(2);
  }
  const cfg = readJson(input);
  const stores = Array.isArray(cfg?.stores) ? cfg.stores : (Array.isArray(cfg) ? cfg : []);
  if (!stores.length) {
    console.error('No stores found in input. Expected { stores: [...] }');
    process.exit(2);
  }
  const out = [];
  const concurrency = Number(process.env.RESOLVE_CONCURRENCY || 4);
  let i = 0;
  while (i < stores.length) {
    const batch = stores.slice(i, i + concurrency);
    const results = await Promise.all(batch.map(resolveOne));
    out.push(...results);
    i += concurrency;
    await sleep(100);
  }
  console.log(JSON.stringify({ stores: out }, null, 2));
}

main().catch((e) => { console.error('Resolver error:', e?.message || e); process.exit(1); });
