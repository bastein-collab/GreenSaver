// scripts/ingest/social_leaf.mjs
// Minimal ingest for a single store using a JSON endpoint.
// Uses env from .env: SUPABASE_URL, SUPABASE_SERVICE_ROLE, TARGET_STORE_*, DEALS_JSON_URL
// Run: node -r dotenv/config scripts/ingest/social_leaf.mjs

import 'dotenv/config';
import { makeClient, getDispensaryId, getBrandId, toCents } from './_helpers.mjs';

const SUPABASE = makeClient();

const STORE = {
  name: process.env.TARGET_STORE_NAME || 'The Social Leaf',
  city: process.env.TARGET_STORE_CITY || 'Toms River, NJ',
  postal_code: process.env.TARGET_STORE_ZIP || '08757',
  website: process.env.TARGET_STORE_URL || null,
  lat: Number(process.env.TARGET_STORE_LAT || 39.9536),
  lon: Number(process.env.TARGET_STORE_LON || -74.1979),
};

const SOURCE = process.env.DEALS_JSON_URL || '';
const METHOD = (process.env.DEALS_METHOD || 'GET').toUpperCase();
const HEADERS = safeParseJSON(process.env.DEALS_HEADERS_JSON) || { accept: 'application/json, text/plain, */*' };
const BODY_TEMPLATE = safeParseJSON(process.env.DEALS_BODY_JSON) || null;
const PAGE_SIZE = Number(process.env.DEALS_PAGE_SIZE || (BODY_TEMPLATE?.pageSize ?? 100));
const MAX_PAGES = Number(process.env.DEALS_MAX_PAGES || 10);
const ENV_STORE_ID = process.env.DEALS_STORE_ID || null;
const ENV_STORE_SLUG = (process.env.DEALS_STORE_SLUG || '').trim() || null;
const ENV_STORES_ENDPOINT = (process.env.DEALS_STORES_ENDPOINT || '/_api/Stores/GetStores').trim();
const ENV_ORIGIN = (process.env.DEALS_ORIGIN || '').trim() || null;

function safeParseJSON(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

function pick(obj, keys) {
  for (const k of keys) {
    if (obj == null) continue;
    if (obj[k] != null && obj[k] !== '') return obj[k];
  }
  return null;
}

function firstVariant(obj) {
  if (Array.isArray(obj?.variants) && obj.variants.length > 0) return obj.variants[0];
  return null;
}

function parsePercent(val) {
  if (val == null) return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  const m = String(val).match(/(\d+(?:\.\d+)?)\s*%?/);
  return m ? Number(m[1]) : null;
}

function findDiscount(p, price) {
  // Try direct keys
  let d = pick(p, ['discount_percent','discountPercentage','discount','percent_off','percentOff','savingsPercent']);
  d = parsePercent(d);
  if (d != null && d > 0) return d;

  // Nested price/pricing objects
  if (p.price) {
    d = pick(p.price, ['discountPercent','discount','savingsPercent']);
    d = parsePercent(d);
    if (d != null && d > 0) return d;
  }
  if (p.pricing) {
    d = pick(p.pricing, ['discountPercent','discount','savingsPercent']);
    d = parsePercent(d);
    if (d != null && d > 0) return d;
  }

  // Promotions arrays/objects
  const promoContainers = [p.promo, p.promotion, p.promotions, p.deal, p.deals, p.badges, p.tags, p.labels];
  for (const cont of promoContainers) {
    if (!cont) continue;
    if (typeof cont === 'object' && !Array.isArray(cont)) {
      const v = parsePercent(pick(cont, ['percent','percentage','value']));
      if (v != null && v > 0) return v;
    }
    if (Array.isArray(cont)) {
      for (const it of cont) {
        const v = parsePercent(it?.percent ?? it?.value ?? it?.percentage ?? it);
        if (v != null && v > 0) return v;
      }
    }
  }

  // Parse from title/name like "40% Off"
  const text = [p.title, p.name, p.product_name].filter(Boolean).join(' ');
  const m = String(text).match(/(\d+(?:\.\d+)?)\s*%\s*off/i);
  if (m) return Number(m[1]);

  // Derive from original vs sale price
  let original = pick(p, ['originalPrice','regularPrice','compareAtPrice','msrp']);
  if (original == null && p.price) original = pick(p.price, ['original','regular','base','compareAt']);
  const o = Number(original);
  const pr = Number(price);
  if (Number.isFinite(o) && o > 0 && Number.isFinite(pr) && pr >= 0) {
    const pct = Math.round(((o - pr) / o) * 100);
    if (pct > 0 && pct <= 100) return pct;
  }
  return 0;
}

function mapProduct(p) {
  // Try several field names used across common vendors
  const product_name = pick(p, ['name', 'title', 'product_name', 'display_name']) || pick(p.product || {}, ['name']) || 'Unknown product';
  let brand_any = pick(p, ['brandName', 'brand']);
  if (brand_any && typeof brand_any === 'object') brand_any = brand_any.name;
  const brand_name = typeof brand_any === 'string' ? brand_any : (p.brand && typeof p.brand.name === 'string' ? p.brand.name : null);
  // price can live in many places; check object, nested price, or first variant
  let price = pick(p, ['price', 'finalPrice', 'salePrice']);
  if (price == null && p.price) price = pick(p.price, ['final', 'sale', 'value', 'finalPrice', 'salePrice']);
  if (price == null) {
    const v = firstVariant(p);
    if (v) price = pick(v, ['price', 'finalPrice', 'salePrice', 'unitPrice']);
  }
  const discount = findDiscount(p, price);
  const category = pick(p, ['category', 'categoryName']) || pick(p.category || {}, ['name']) || null;
  const subcategory = pick(p, ['subcategory', 'subCategory']) || pick(p.subcategory || {}, ['name']) || null;

  return {
    product_name,
    brand_name: brand_name,
    price_cents: toCents(price),
    percent_off: Number(discount || 0),
    product_type: category || subcategory || null,
    category: category,
    subcategory: subcategory,
  };
}

function getOrigin(urlStr) {
  try { return new URL(urlStr).origin; } catch { return null; }
}

function getSlug(urlStr) {
  if (ENV_STORE_SLUG) return ENV_STORE_SLUG;
  try {
    const u = new URL(urlStr);
    const parts = u.pathname.split('/').filter(Boolean);
    // e.g. /toms-river/menu/discounts -> 'toms-river'
    return parts.length ? parts[0] : null;
  } catch { return null; }
}

async function resolveStoreId() {
  if (ENV_STORE_ID && ENV_STORE_ID.length > 10) {
    console.log('Using storeId from env');
    return ENV_STORE_ID;
  }
  const origin = ENV_ORIGIN || getOrigin(STORE.website || SOURCE || process.env.TARGET_STORE_URL || '');
  if (!origin) return null;
  const slug = getSlug(STORE.website || process.env.TARGET_STORE_URL || '') || null;

  // 1) Try platform stores listing
  try {
    const res = await fetch(`${origin}${ENV_STORES_ENDPOINT}`, { headers: HEADERS || {} });
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data) ? data : (Array.isArray(data?.stores) ? data.stores : []);
      if (Array.isArray(list)) {
        const normalized = list.map((s) => ({ id: s?.id, slug: (s?.slug || '').toLowerCase(), name: (s?.name || '').toLowerCase(), postal: String(s?.postalCode || s?.postal_code || '') }));
        const bySlug = slug && normalized.find((s) => s.slug === slug.toLowerCase() || s.name.includes(slug.toLowerCase()));
        if (bySlug?.id) return String(bySlug.id);
        const byZip = STORE.postal_code && normalized.find((s) => s.postal.includes(STORE.postal_code));
        if (byZip?.id) return String(byZip.id);
        // Last chance: unique by city keyword
        if (STORE.city) {
          const cityKey = String(STORE.city).split(',')[0].trim().toLowerCase();
          const byCity = normalized.find((s) => s.name.includes(cityKey) || s.slug.includes(cityKey));
          if (byCity?.id) return String(byCity.id);
        }
      }
    }
  } catch {}

  // 2) Try scraping HTML for embedded storeId
  try {
    const pageUrl = STORE.website || process.env.TARGET_STORE_URL || '';
    if (pageUrl) {
      const r = await fetch(pageUrl, { headers: HEADERS || {} });
      if (r.ok) {
        const html = await r.text();
        const m = html.match(/storeId["']?\s*[:=]\s*["']([0-9a-fA-F-]{20,})["']/) ||
                  html.match(/data-storeid=["']([0-9a-fA-F-]{20,})["']/) ||
                  html.match(/"storeId"\s*:\s*"([0-9a-fA-F-]{20,})"/);
        if (m && m[1]) return m[1];
      }
    }
  } catch {}

  return null;
}

async function fetchDeals() {
  if (!SOURCE) {
    console.error('DEALS_JSON_URL missing in .env');
    return [];
  }
  const storeId = await resolveStoreId();
  if (!storeId) {
    const originHint = ENV_ORIGIN || getOrigin(STORE.website || SOURCE || process.env.TARGET_STORE_URL || '') || '(origin)';
    console.warn('Warning: storeId could not be resolved automatically. If the API requires it, set DEALS_STORE_ID in .env or run:');
    console.warn('  node scripts/ingest/resolve_store_id.mjs', STORE.website || process.env.TARGET_STORE_URL || '(storeURL)', '\n   --origin', originHint, '\n   --endpoint', ENV_STORES_ENDPOINT);
  } else {
    console.log('Resolved storeId:', storeId);
  }
  const all = [];
  if (METHOD === 'POST') {
    let page = Number(process.env.DEALS_START_PAGE || 1);
    for (let i = 0; i < MAX_PAGES; i++) {
      const body = { storeId: storeId ?? undefined, ...(BODY_TEMPLATE || {}), page, pageSize: PAGE_SIZE };
      const res = await fetch(SOURCE, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(HEADERS || {}) },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Fetch failed: ${res.status} ${text?.slice(0,200)}`);
      }
      const json = await res.json();
      const list = Array.isArray(json)
        ? json
        : Array.isArray(json?.list)
        ? json.list
        : Array.isArray(json?.data)
        ? json.data
        : Array.isArray(json?.items)
        ? json.items
        : [];
      all.push(...list);
      if (!Array.isArray(list) || list.length < PAGE_SIZE) break;
      await new Promise((r) => setTimeout(r, 250));
      page += 1;
    }
  } else {
    const url = new URL(SOURCE);
    if (storeId) url.searchParams.set('storeId', storeId);
    const res = await fetch(url.toString(), { method: 'GET', headers: HEADERS || {} });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Fetch failed: ${res.status} ${text?.slice(0,200)}`);
    }
    const json = await res.json();
    const list = Array.isArray(json)
      ? json
      : Array.isArray(json?.list)
      ? json.list
      : Array.isArray(json?.data)
      ? json.data
      : Array.isArray(json?.items)
      ? json.items
      : [];
    all.push(...list);
  }
  return all.map(mapProduct).filter((x) => x.product_name && Number.isFinite(x.price_cents));
}

async function upsert(deals) {
  const dispensary_id = await getDispensaryId(SUPABASE, STORE);
  let inserted = 0, updated = 0;
  for (const d of deals) {
    const brand_id = await getBrandId(SUPABASE, d.brand_name);
    // Look for an existing row by dispensary_id + product_name
    const { data: existing } = await SUPABASE
      .from('deals')
      .select('id, price_cents, percent_off')
      .eq('dispensary_id', dispensary_id)
      .eq('product_name', d.product_name)
      .maybeSingle();

    if (!existing) {
      const { error } = await SUPABASE.from('deals').insert({
        dispensary_id,
        brand_id,
        product_name: d.product_name,
        price_cents: d.price_cents,
        percent_off: d.percent_off,
        postal_code: STORE.postal_code,
        product_type: d.product_type,
        category: d.category,
        subcategory: d.subcategory,
      });
      if (error) throw error;
      inserted++;
    } else {
      const { error } = await SUPABASE
        .from('deals')
        .update({
          brand_id,
          price_cents: d.price_cents,
          percent_off: d.percent_off,
          product_type: d.product_type,
          category: d.category,
          subcategory: d.subcategory,
        })
        .eq('id', existing.id);
      if (error) throw error;
      updated++;
    }
  }
  return { inserted, updated };
}

try {
  const items = await fetchDeals();
  const stats = await upsert(items);
  console.log(`Ingest complete for ${STORE.name}:`, stats, 'items:', items.length);
  process.exit(0);
} catch (e) {
  console.error('INGEST ERROR:', e?.message || e);
  process.exit(1);
}
