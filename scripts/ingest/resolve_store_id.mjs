// scripts/ingest/resolve_store_id.mjs
// Resolve a vendor storeId from a public store URL.
// Usage:
//   node scripts/ingest/resolve_store_id.mjs https://shop.example.com/city/menu/discounts \
//        --origin https://shop.example.com \
//        --endpoint /_api/Stores/GetStores \
//        --headers '{"accept":"application/json, text/plain, */*"}' \
//        --slug city \
//        --debug

import 'dotenv/config';

function parseArgs() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error('Usage: node scripts/ingest/resolve_store_id.mjs <storePageUrl> [--origin O] [--endpoint E] [--headers JSON] [--slug S]');
    process.exit(2);
  }
  const out = { pageUrl: args[0], origin: null, endpoint: null, headers: {}, slug: null, debug: false };
  for (let i = 1; i < args.length; i += 1) {
    const k = args[i];
    const v = args[i + 1];
    if (k === '--origin') out.origin = v;
    if (k === '--endpoint') out.endpoint = v;
    if (k === '--headers') {
      try { out.headers = JSON.parse(v); } catch { out.headers = {}; }
    }
    if (k === '--slug') out.slug = v;
    if (k === '--debug') { out.debug = true; i -= 1; }
  }
  return out;
}

function getOrigin(urlStr) {
  try { return new URL(urlStr).origin; } catch { return null; }
}

function getSlugFromUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    const parts = u.pathname.split('/').filter(Boolean);
    return parts.length ? parts[0].toLowerCase() : null;
  } catch { return null; }
}

async function tryStoresApi(origin, endpoint, headers, needleSlug, postalCode, cityHint, debug=false) {
  try {
    const endpoints = [
      endpoint || process.env.DEALS_STORES_ENDPOINT,
      '/_api/Stores/GetStores',
      '/_api/Stores',
      '/api/Stores',
      '/api/stores',
      '/stores',
    ].filter(Boolean);
    for (const ep of endpoints) {
      const url = `${origin}${ep}`;
      const res = await fetch(url, { headers: headers || {} });
      if (!res.ok) continue;
      const data = await res.json();
      const list = Array.isArray(data) ? data : (Array.isArray(data?.stores) ? data.stores : []);
      if (!Array.isArray(list)) continue;
      const norm = list.map((s) => ({ id: s?.id, slug: (s?.slug || '').toLowerCase(), name: (s?.name || '').toLowerCase(), postal: String(s?.postalCode || s?.postal_code || '') }));
      if (debug) console.log('DEBUG stores from', ep, JSON.stringify(norm, null, 2));
      if (needleSlug) {
        const bySlug = norm.find((s) => s.slug === needleSlug || s.name.includes(needleSlug));
        if (bySlug?.id) return bySlug;
      }
      if (postalCode) {
        const byZip = norm.find((s) => s.postal.includes(postalCode));
        if (byZip?.id) return byZip;
      }
      if (cityHint) {
        const k = cityHint.split(',')[0].trim().toLowerCase();
        const byCity = norm.find((s) => s.name.includes(k) || s.slug.includes(k));
        if (byCity?.id) return byCity;
      }
      if (norm.length === 1 && norm[0].id) return norm[0];
    }
    return null;
  } catch {
    return null;
  }
}

async function tryPageHtml(pageUrl, headers) {
  try {
    const r = await fetch(pageUrl, { headers: headers || {} });
    if (!r.ok) return null;
    const html = await r.text();
    const m = html.match(/storeId["']?\s*[:=]\s*["']([0-9a-fA-F-]{20,})["']/)
          || html.match(/data-storeid=["']([0-9a-fA-F-]{20,})["']/)
          || html.match(/"storeId"\s*:\s*"([0-9a-fA-F-]{20,})"/);
    if (m && m[1]) return { id: m[1], slug: null, name: null };
    return null;
  } catch {
    return null;
  }
}

const { pageUrl, origin: originArg, endpoint, headers, slug: slugArg, debug } = parseArgs();
const origin = originArg || getOrigin(pageUrl) || process.env.DEALS_ORIGIN || null;
const slug = (slugArg || process.env.DEALS_STORE_SLUG || getSlugFromUrl(pageUrl) || '').toLowerCase();
const postal = process.env.TARGET_STORE_ZIP || '';
const city = process.env.TARGET_STORE_CITY || '';

(async () => {
  if (!origin) {
    console.error('Unable to determine origin. Pass --origin or set DEALS_ORIGIN.');
    process.exit(2);
  }
  const fromApi = await tryStoresApi(origin, endpoint || process.env.DEALS_STORES_ENDPOINT, headers, slug, postal, city, debug);
  if (fromApi?.id) {
    console.log(JSON.stringify({ storeId: String(fromApi.id), strategy: 'stores_api', match: fromApi }, null, 2));
    process.exit(0);
  }
  const fromHtml = await tryPageHtml(pageUrl, headers);
  if (fromHtml?.id) {
    console.log(JSON.stringify({ storeId: String(fromHtml.id), strategy: 'page_html' }, null, 2));
    process.exit(0);
  }
  console.error('storeId not found. Try providing --slug and correct --headers, or set DEALS_STORE_ID in .env');
  process.exit(1);
})();
