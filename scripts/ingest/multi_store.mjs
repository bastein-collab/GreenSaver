// scripts/ingest/multi_store.mjs
// Batch ingest for multiple stores using JSON config.
// Run: node -r dotenv/config scripts/ingest/multi_store.mjs [path/to/stores.json]

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { makeClient, getDispensaryId, getBrandId, toCents } from './_helpers.mjs';
import { renderPage } from './_renderer.mjs';
import { load as loadHtml } from 'cheerio';

const SUPABASE = makeClient();

function sanitizeJsonString(s) {
  let out = s.replace(/^\uFEFF/, '');
  out = out.replace(/\/\*[\s\S]*?\*\//g, '');
  out = out.replace(/(^|[^:])\/\/.*$/gm, '$1');
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
    text = buf.slice(2).toString('utf16le');
  } else if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {
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
  let d = pick(p, ['discount_percent','discountPercentage','discount','percent_off','percentOff','savingsPercent']);
  d = parsePercent(d);
  if (d != null && d > 0) return d;
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
  const text = [p.title, p.name, p.product_name].filter(Boolean).join(' ');
  const m = String(text).match(/(\d+(?:\.\d+)?)\s*%\s*off/i);
  if (m) return Number(m[1]);
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
  const product_name = pick(p, ['name', 'title', 'product_name', 'display_name']) || pick(p.product || {}, ['name']) || 'Unknown product';
  let brand_any = pick(p, ['brandName', 'brand']);
  if (brand_any && typeof brand_any === 'object') brand_any = brand_any.name;
  const brand_name = typeof brand_any === 'string' ? brand_any : (p.brand && typeof p.brand.name === 'string' ? p.brand.name : null);
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

function originFromUrl(u) { try { return new URL(u).origin; } catch { return null; } }

async function ping(url, headers) {
  try { const r = await fetch(url, { method: 'GET', headers, redirect: 'manual' }); return r.status; } catch { return 0; }
}

async function detectEndpoint(website) {
  const origin = originFromUrl(website);
  if (!origin) return null;
  const headers = { accept: 'application/json, text/plain, */*', 'user-agent': 'Mozilla/5.0 (GreenSaver)' };
  const candidates = [
    '/_api/Products/GetProductList',
    '/_api/Product/GetProductList',
    '/api/Products/GetProductList',
  ];
  for (const ep of candidates) {
    const url = `${origin}${ep}`;
    const st = await ping(url, headers);
    if (st === 200 || st === 400 || st === 401) {
      return { url, method: 'POST', pageSize: 150, maxPages: 5, headers: { ...headers, 'content-type': 'application/json', origin, referer: website } };
    }
  }
  return null;
}

function parseJsonEnv(name, fallback) {
  try { return JSON.parse(process.env[name] || ''); } catch { return fallback; }
}

async function fetchList(source, store) {
  const METHOD = (source?.method || 'GET').toUpperCase();
  const GLOBAL_HEADERS = parseJsonEnv('DEALS_HEADERS_JSON', null);
  const HEADERS = { accept: 'application/json, text/plain, */*', ...(GLOBAL_HEADERS || {}), ...(source?.headers || {}) };
  const BODY_TEMPLATE = source?.bodyTemplate || null;
  const PAGE_SIZE = Number(source?.pageSize || (BODY_TEMPLATE?.pageSize ?? 100));
  const MAX_PAGES = Number(source?.maxPages || 10);
  const STORE_ID = store?.store_id || null;

  if (source?.skip) {
    console.warn('Skipping source (marked skip):', store?.name || store?.website);
    return [];
  }

  // Platform adapters
  if (source?.type === 'jane') {
    return await fetchFromJane(source, store, HEADERS, PAGE_SIZE, MAX_PAGES);
  }
  if (source?.type === 'dutchie') {
    return await fetchFromDutchie(source, store, HEADERS, PAGE_SIZE, MAX_PAGES);
  }

  if (!source?.url) {
    console.warn('Skipping store due to missing source.url:', store?.name || store?.website);
    return [];
  }

  const all = [];
  if (METHOD === 'POST') {
    let page = Number(source?.startPage || 1);
    for (let i = 0; i < MAX_PAGES; i++) {
      const body = { ...(BODY_TEMPLATE || {}), ...(STORE_ID ? { storeId: STORE_ID } : {}), page, pageSize: PAGE_SIZE };
      const res = await fetch(source.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(HEADERS || {}) },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
      const json = await res.json();
      const list = Array.isArray(json)
        ? json
        : Array.isArray(json?.list) ? json.list
        : Array.isArray(json?.data) ? json.data
        : Array.isArray(json?.items) ? json.items
        : [];
      all.push(...list);
      if (!Array.isArray(list) || list.length < PAGE_SIZE) break;
      await new Promise((r) => setTimeout(r, 250));
      page += 1;
    }
  } else {
    const u = new URL(source.url);
    if (STORE_ID) u.searchParams.set('storeId', STORE_ID);
    const res = await fetch(u.toString(), { method: 'GET', headers: HEADERS || {} });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const json = await res.json();
    const list = Array.isArray(json)
      ? json
      : Array.isArray(json?.list) ? json.list
      : Array.isArray(json?.data) ? json.data
      : Array.isArray(json?.items) ? json.items
      : [];
    all.push(...list);
  }
  return all.map(mapProduct).filter((x) => x.product_name && Number.isFinite(x.price_cents));
}

// ---------------- Platform adapters ----------------
async function fetchFromJane(source, store, headers, pageSize = 100, maxPages = 5) {
  const out = [];
  const janeHeaders = { 'content-type': 'application/json', ...headers };
  const graphUrl = process.env.JANE_GRAPHQL_URL || 'https://apigw.iheartjane.com/graphql';
  // Optional override: try HTML parsing first; if it yields nothing, fall back to GraphQL
  if (String(process.env.JANE_HTML_ONLY || '').trim() === '1') {
    const htmlItems = await fetchFromJaneHtml(store, headers);
    if (Array.isArray(htmlItems) && htmlItems.length) return htmlItems;
    console.warn('  -> Jane HTML yielded 0 items; attempting GraphQL fallback');
  }
  let storeId = store.store_id || source.store_id || null;
  // Attempt to resolve storeId via a lightweight store query if missing
  if (!storeId && source.slug) {
    try {
      const q = { query: "query StoreBySlug($slug:String!){ store(slug:$slug){ id name } }", variables: { slug: source.slug } };
      const r = await fetch(graphUrl, { method: 'POST', headers: janeHeaders, body: JSON.stringify(q) });
      if (r.ok) {
        const j = await r.json();
        storeId = j?.data?.store?.id || storeId;
      }
    } catch {}
  }
  if (!storeId) {
    const htmlItems = await fetchFromJaneHtml(store, headers);
    if (htmlItems.length) return htmlItems;
    console.warn('  -> Jane: missing storeId and could not resolve');
    return [];
  }
  // Basic products query (public GraphQL). Schema may vary; we handle safely.
  let page = 0;
  for (let i = 0; i < maxPages; i++) {
    try {
      const q = {
        query: `query Products($storeId:ID!,$page:Int,$per:Int){
          products(storeId:$storeId, page:$page, per:$per){
            edges{ node{ name brand{name} price{ regular sale } category{name} subcategory{name} }
            }
          }
        }`,
        variables: { storeId, page, per: pageSize },
      };
      const r = await fetch(graphUrl, { method: 'POST', headers: janeHeaders, body: JSON.stringify(q) });
      if (!r.ok) break;
      const j = await r.json();
      const edges = j?.data?.products?.edges || [];
      if (!edges.length) break;
      for (const e of edges) {
        const n = e?.node || {};
        const regular = Number(n?.price?.regular ?? 0);
        const sale = Number(n?.price?.sale ?? regular);
        const pct = regular > 0 ? Math.round(((regular - sale) / regular) * 100) : 0;
        out.push({
          product_name: n?.name || 'Unknown',
          brand_name: n?.brand?.name || null,
          price_cents: Math.round((sale || regular) * 100),
          percent_off: pct,
          product_type: n?.category?.name || n?.subcategory?.name || null,
          category: n?.category?.name || null,
          subcategory: n?.subcategory?.name || null,
        });
      }
      if (edges.length < pageSize) break;
      page += 1;
      await new Promise((r) => setTimeout(r, 200));
    } catch {
      break;
    }
  }
  if (!out.length) {
    const htmlItems = await fetchFromJaneHtml(store, headers);
    if (htmlItems.length) return htmlItems;
  }
  return out;
}

async function fetchFromDutchie(source, store, headers, pageSize = 100, maxPages = 5) {
  const out = [];
  const dutchieHeaders = { 'content-type': 'application/json', ...headers };
  const graphUrl = process.env.DUTCHIE_GRAPHQL_URL || 'https://www.dutchie.com/graphql';
  let storeId = store.store_id || source.store_id || null;
  // If slug present and no id, some deployments accept slug in variables.
  const slug = source.slug || null;
  let after = null;
  for (let i = 0; i < maxPages; i++) {
    try {
      const q = {
        operationName: 'MenuProducts',
        variables: { dispensaryId: storeId, dispensarySlug: slug, first: pageSize, after },
        query: `query MenuProducts($dispensaryId: ID, $dispensarySlug: String, $first: Int, $after: String){
          products(dispensaryId:$dispensaryId, dispensarySlug:$dispensarySlug, first:$first, after:$after){
            pageInfo{ hasNextPage endCursor }
            edges{ node{ name brand{name} pricing{ price originalPrice } categories{name} } }
          }
        }`,
      };
      const r = await fetch(graphUrl, { method: 'POST', headers: dutchieHeaders, body: JSON.stringify(q) });
      if (!r.ok) break;
      const j = await r.json();
      const edges = j?.data?.products?.edges || [];
      if (!edges.length) break;
      for (const e of edges) {
        const n = e?.node || {};
        const regular = Number(n?.pricing?.originalPrice ?? 0);
        const sale = Number(n?.pricing?.price ?? regular);
        const pct = regular > 0 ? Math.round(((regular - sale) / regular) * 100) : 0;
        out.push({
          product_name: n?.name || 'Unknown',
          brand_name: n?.brand?.name || null,
          price_cents: Math.round((sale || regular) * 100),
          percent_off: pct,
          product_type: Array.isArray(n?.categories) && n.categories.length ? n.categories[0]?.name : null,
          category: Array.isArray(n?.categories) && n.categories.length ? n.categories[0]?.name : null,
          subcategory: null,
        });
      }
      const pi = j?.data?.products?.pageInfo || {};
      if (!pi?.hasNextPage) break;
      after = pi?.endCursor || null;
      await new Promise((r) => setTimeout(r, 200));
    } catch {
      break;
    }
  }
  if (!out.length) console.warn('  -> Dutchie: no items (may require auth headers)');
  if (!out.length) {
    const htmlItems = await fetchFromDutchieHtml(store, headers);
    if (htmlItems.length) return htmlItems;
  }
  return out;

// HTML fallback helpers inserted below
}

function extractApolloState(html) {
  try {
    const marker = '__APOLLO_STATE__';
    const idx = html.indexOf(marker);
    if (idx < 0) return null;
    const eq = html.indexOf('=', idx);
    if (eq < 0) return null;
    let i = html.indexOf('{', eq);
    if (i < 0) return null;
    let depth = 0;
    const start = i;
    for (; i < html.length; i++) {
      const ch = html[i];
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { const json = html.slice(start, i + 1); return JSON.parse(json); } }
    }
  } catch {}
  return null;
}

function mapFromApollo(state) {
  const items = [];
  if (!state || typeof state !== 'object') return items;
  for (const v of Object.values(state)) {
    if (!v || typeof v !== 'object') continue;
    const name = v.name || v.productName || null;
    let pricing = v.price || v.pricing || null;
    if (!name || !pricing) continue;
    // normalize pricing shapes seen across platforms
    let regular = Number(pricing.regular ?? pricing.original ?? pricing.compareAt ?? pricing.originalPrice ?? pricing.msrp ?? pricing.base ?? 0);
    let sale = Number(pricing.sale ?? pricing.final ?? pricing.price ?? pricing.value ?? 0);
    if (!regular && v?.priceRange) {
      // Some states expose priceRange { min, max }
      const pr = v.priceRange;
      regular = Number(pr.max ?? pr.min ?? 0);
      sale = Number(pr.min ?? pr.max ?? 0);
    }
    if (!sale && v?.variants && Array.isArray(v.variants) && v.variants.length) {
      const vv = v.variants[0];
      regular = Number(regular || vv?.originalPrice || vv?.compareAt || vv?.msrp || vv?.base || 0);
      sale = Number(sale || vv?.price || vv?.finalPrice || 0);
    }
    const pct = regular > 0 ? Math.round(((regular - sale) / regular) * 100) : 0;
    const category = v.category?.name || v.categoryName || (Array.isArray(v.categories) && v.categories[0]?.name) || null;
    const subcategory = v.subcategory?.name || v.subCategory?.name || null;
    items.push({
      product_name: name,
      brand_name: v.brand?.name || v.brandName || null,
      price_cents: Math.round((sale || regular) * 100),
      percent_off: pct,
      product_type: category || subcategory || null,
      category,
      subcategory,
    });
  }
  return items;
}

function textClean(s) {
  return String(s || '').replace(/\s+/g, ' ').trim();
}

function findMoneyInText(s) {
  const nums = [];
  String(s || '').replace(/\$\s*([0-9]+(?:\.[0-9]{1,2})?)/g, (_, n) => { nums.push(Number(n)); return ''; });
  if (nums.length) return Math.min(...nums.filter(n => Number.isFinite(n) && n > 0));
  // fallback: plain numbers that look like prices
  String(s || '').replace(/\b([0-9]+(?:\.[0-9]{1,2})?)\b/g, (_, n) => { const v = Number(n); if (v > 0 && v < 1000) nums.push(v); return ''; });
  if (nums.length) return Math.min(...nums);
  return null;
}

function scrapeProductsFromHtml(html) {
  const $ = loadHtml(html || '');
  // Try JSON-LD first
  try {
    const ld = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const txt = $(el).text();
        const obj = JSON.parse(txt);
        const arr = Array.isArray(obj) ? obj : [obj];
        ld.push(...arr);
      } catch {}
    });
    const out = [];
    for (const o of ld) {
      if (!o || typeof o !== 'object') continue;
      if (o['@type'] === 'Product' && (o.name || o.brand || o.offers)) {
        const name = textClean(o.name || '');
        const brand = typeof o.brand === 'string' ? o.brand : (o.brand && o.brand.name) || null;
        const price = Number((o.offers && (o.offers.price || o.offers.lowPrice)) || 0);
        if (name && Number.isFinite(price) && price > 0) {
          out.push({ product_name: name, brand_name: brand, price_cents: toCents(price), percent_off: 0, product_type: null, category: null, subcategory: null });
        }
      }
    }
    if (out.length) return out;
  } catch {}
  const candidates = [];
  const SELS = [
    '[data-testid*="product"]',
    '[class*="product-card"]',
    '[class*="ProductCard"]',
    'li[class*="product"], article[class*="product"], div[class*="product"]',
  ];
  const seen = new Set();
  for (const sel of SELS) {
    $(sel).each((_, el) => {
      const node = $(el);
      const text = textClean(node.text());
      if (!text || text.length < 10) return;
      const snippet = text.slice(0, 120);
      if (seen.has(snippet)) return; // crude de-dupe

      // Name heuristics
      const nameEl = node.find('[data-testid*="product-name"], [class*="product-name"], h3, h4, a').first();
      const brandEl = node.find('[data-testid*="brand"], [class*="brand"], small, label').first();
      const priceEl = node.find('[data-testid*="price"], [class*="price"], [class*="Price"], span:contains("$")').first();

      let product_name = textClean(nameEl.text()) || null;
      let brand_name = textClean(brandEl.text()) || null;
      const priceGuess = findMoneyInText(priceEl.text()) ?? findMoneyInText(text);
      let percent_off = 0;
      const m = text.match(/(\d{1,2})\s*%\s*off/i);
      if (m) percent_off = Math.max(0, Math.min(100, Number(m[1])));

      if (!product_name) {
        // Backstop: take first 6-10 word span
        const words = text.split(' ');
        product_name = words.slice(0, Math.min(10, words.length)).join(' ');
      }
      if (product_name) seen.add(snippet);
      if (product_name && priceGuess != null) {
        candidates.push({
          product_name,
          brand_name: brand_name || null,
          price_cents: toCents(priceGuess),
          percent_off,
          product_type: null,
          category: null,
          subcategory: null,
        });
      }
    });
    if (candidates.length >= 10) break; // found enough
  }
  return candidates;
}

async function fetchFromJaneHtml(store, headers) {
  try {
    // Try the given page plus common menu routes
    const url = store.website || '';
    const geo = (() => {
      const lat = Number(store?.lat);
      const lon = Number(store?.lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { latitude: lat, longitude: lon, accuracy: 500 };
      // NJ centroid fallback
      return { latitude: 40.0583, longitude: -74.4057, accuracy: 20000 };
    })();
    const candidates = [url];
    if (/iheartjane\.com\/dispensaries\//i.test(url) && !/\/menu(\/|$)/i.test(url)) {
      const base = url.replace(/\/$/, '') + '/menu';
      candidates.push(base);
      candidates.push(base + '/all');
      candidates.push(base + '/specials');
      candidates.push(url.replace(/\/$/, '') + '/menu/flower');
    }
    function unique(arr) { return Array.from(new Set(arr.filter(Boolean))); }
    function findJaneStoreMenuLinks(html) {
      const links = [];
      const re = /href=["']([^"']+)["']/gi;
      let m;
      while ((m = re.exec(html))) {
        const href = m[1];
        if (!/iheartjane\.com\/stores\//i.test(href)) continue;
        let u = href;
        try { const abs = new URL(href, url); u = abs.toString(); } catch {}
        // normalize to include /menu
        if (!/\/menu(\/|$)/i.test(u)) u = u.replace(/\/$/, '') + '/menu';
        links.push(u);
      }
      // Prefer NJ or matching postal/city if present
      const city = String(store.city || '').toLowerCase();
      const zip = String(store.postal_code || '').replace(/[^0-9]/g, '');
      const scored = links.map((u) => {
        let score = 0;
        if (/\bnew-?jersey\b|\bnj\b/i.test(u)) score += 2;
        if (city && u.toLowerCase().includes(city)) score += 2;
        if (zip && u.includes(zip)) score += 3;
        return { u, score };
      }).sort((a,b)=>b.score-a.score);
      return unique(scored.map(x=>x.u));
    }
    const rendered = await renderPage(candidates, { geo, headers: { 'user-agent': 'Mozilla/5.0', accept: 'text/html, */*;q=0.1', referer: url, ...(headers || {}) } });
    let items = [];
    if (rendered?.ok) {
      const state = rendered.apollo || rendered.apolloCache || (rendered.nextData?.props?.pageProps?.apolloState) || null;
      items = mapFromApollo(state);
      if (!items.length && rendered.html) {
        let html = rendered.html;
        let s = extractApolloState(html);
        items = mapFromApollo(s);
        if (!items.length) {
          const m = html.match(/<script[^>]*id=\"__NEXT_DATA__\"[^>]*>([\s\S]*?)<\/script>/i);
          if (m && m[1]) { try { const next = JSON.parse(m[1]); items = mapFromApollo(next?.props?.pageProps?.apolloState || next?.apolloState || {}); } catch {} }
          if (!items.length) {
            const domItems = scrapeProductsFromHtml(html);
            if (domItems.length) { console.log('  -> Jane DOM parsed items:', domItems.length); return domItems; }
            // As a last resort, if this is a brand/locator page, follow first few store menu links
            const storeMenus = findJaneStoreMenuLinks(html).flatMap(u => [u, u + '/all', u + '/specials']).slice(0, 6);
            if (storeMenus.length) console.log('  -> Jane deep-link candidates:', storeMenus.length, storeMenus[0]);
            if (storeMenus.length) {
              const deep = await renderPage(storeMenus, { geo, headers: { 'user-agent': 'Mozilla/5.0', accept: 'text/html, */*;q=0.1', referer: url, ...(headers || {}) } });
              if (deep?.ok) {
                const s2 = deep.apollo || deep.apolloCache || (deep.nextData?.props?.pageProps?.apolloState) || extractApolloState(deep.html || '');
                const it2 = mapFromApollo(s2);
                if (Array.isArray(it2) && it2.length) { console.log('  -> Jane deep-link parsed items:', it2.length); return it2; }
                if (deep.html) {
                  const dom2 = scrapeProductsFromHtml(deep.html);
                  if (dom2.length) { console.log('  -> Jane deep-link DOM items:', dom2.length); return dom2; }
                }
              }
            }
          }
        }
      }
      if (items.length) { console.log('  -> Jane HTML (headless) parsed items:', items.length); return items; }
    }
    // Fallback to static fetch
    const r = await fetch(store.website, { headers: { 'user-agent': 'Mozilla/5.0', accept: 'text/html, */*;q=0.1', referer: store.website, ...(headers || {}) } });
    if (!r.ok) return [];
    const html = await r.text();
    const state = extractApolloState(html);
    items = mapFromApollo(state);
    if (!items.length) {
      const domItems = scrapeProductsFromHtml(html);
      if (domItems.length) { console.log('  -> Jane DOM parsed items:', domItems.length); return domItems; }
      const storeMenus = findJaneStoreMenuLinks(html).flatMap(u => [u, u + '/all', u + '/specials']).slice(0, 6);
      if (storeMenus.length) console.log('  -> Jane deep static candidates:', storeMenus.length, storeMenus[0]);
      for (const u of storeMenus) {
        try {
          const r2 = await fetch(u, { headers: { 'user-agent': 'Mozilla/5.0', accept: 'text/html, */*;q=0.1', referer: store.website, ...(headers || {}) } });
          if (!r2.ok) continue;
          const h2 = await r2.text();
          const s2 = extractApolloState(h2);
          const it2 = mapFromApollo(s2);
          if (Array.isArray(it2) && it2.length) { console.log('  -> Jane deep static parsed items:', it2.length); return it2; }
          const d2 = scrapeProductsFromHtml(h2);
          if (d2.length) { console.log('  -> Jane deep static DOM items:', d2.length); return d2; }
        } catch {}
      }
    }
    if (items.length) console.log('  -> Jane HTML parsed items:', items.length);
    return items;
  } catch { return []; }
}

async function fetchFromDutchieHtml(store, headers) {
  try {
    const url = store.website || '';
    const candidates = [url];
    // Normalize specials -> menu if present
    if (/\b(specials|promotions)\b/i.test(url)) {
      candidates.push(url.replace(/specials|promotions/i, 'menu'));
    }
    if (!/\/menu(\/|$)/i.test(url)) candidates.push(url.replace(/\/$/, '') + '/menu');
    const rendered = await renderPage(candidates, { headers: { 'user-agent': 'Mozilla/5.0', accept: 'text/html, */*;q=0.1', referer: url, ...(headers || {}) } });
    let items = [];
    if (rendered?.ok) {
      const state = rendered.apollo || rendered.apolloCache || (rendered.nextData?.props?.pageProps?.apolloState) || null;
      items = mapFromApollo(state);
      if (!items.length && rendered.html) {
        const html = rendered.html;
        let s = extractApolloState(html);
        items = mapFromApollo(s);
        if (!items.length) {
          const m = html.match(/<script[^>]*id=\"__NEXT_DATA__\"[^>]*>([\s\S]*?)<\/script>/i);
          if (m && m[1]) { try { const next = JSON.parse(m[1]); items = mapFromApollo(next?.props?.pageProps?.apolloState || next?.apolloState || {}); } catch {} }
          if (!items.length) {
            const domItems = scrapeProductsFromHtml(html);
            if (domItems.length) { console.log('  -> Dutchie DOM parsed items:', domItems.length); return domItems; }
          }
        }
      }
      if (items.length) { console.log('  -> Dutchie HTML (headless) parsed items:', items.length); return items; }
    }
    // Fallback to static fetch
    const r = await fetch(store.website, { headers: { 'user-agent': 'Mozilla/5.0', accept: 'text/html, */*;q=0.1', referer: store.website, ...(headers || {}) } });
    if (!r.ok) return [];
    const html = await r.text();
    const state = extractApolloState(html);
    items = mapFromApollo(state);
    if (!items.length) {
      const domItems = scrapeProductsFromHtml(html);
      if (domItems.length) { console.log('  -> Dutchie DOM parsed items:', domItems.length); return domItems; }
    }
    if (items.length) console.log('  -> Dutchie HTML parsed items:', items.length);
    return items;
  } catch { return []; }
}

async function upsert(store, deals) {
  const dispensary_id = await getDispensaryId(SUPABASE, store);
  let inserted = 0, updated = 0;
  for (const d of deals) {
    const brand_id = await getBrandId(SUPABASE, d.brand_name);
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
        postal_code: store.postal_code,
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

const CONFIG_PATH = process.argv[2] || process.env.STORES_JSON || 'scripts/ingest/stores.nj.json';
function parseArgs(argv) {
  const out = { limit: null, offset: 0, concurrency: 1 };
  for (let i = 3; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') { out.limit = Number(argv[i + 1]); i++; }
    else if (a === '--offset') { out.offset = Number(argv[i + 1]); i++; }
    else if (a === '--concurrency') { out.concurrency = Math.max(1, Number(argv[i + 1])); i++; }
  }
  return out;
}

try {
  const cfg = readJson(CONFIG_PATH);
  if (!Array.isArray(cfg?.stores)) throw new Error('Invalid stores JSON. Expected { stores: [...] }');
  const args = parseArgs(process.argv);
  const all = cfg.stores;
  const start = Math.max(0, args.offset || 0);
  const end = args.limit ? Math.min(all.length, start + args.limit) : all.length;
  const queue = all.slice(start, end);
  console.log(`Processing ${queue.length} stores (offset=${start}, limit=${args.limit ?? 'all'}, concurrency=${args.concurrency})`);
  let total = 0;
  const report = { start, end, count: queue.length, processed: [], totals: { items: 0, skipped: 0 } };

  async function ingestOne(s) {
    const store = {
      name: s.name,
      city: s.city,
      postal_code: s.postal_code,
      website: s.website || null,
      lat: Number(s.lat),
      lon: Number(s.lon),
    };
    try {
      console.log(`Fetching: ${store.name} (${store.postal_code || ''})`);
      let source = s.source || null;
      // If a platform type is known (jane/dutchie), do not override with detection
      if (!source || (!source.type && !source.url)) {
        const detected = await detectEndpoint(store.website || '');
        if (detected) source = { ...detected };
      }
      if (!source) {
        console.warn('  -> No endpoint detected; skipping');
        report.processed.push({ name: store.name, website: store.website, reason: 'no-endpoint' });
        report.totals.skipped += 1;
        return 0;
      }
      const items = await fetchList(source, { ...store, store_id: s.store_id });
      const stats = await upsert(store, items);
      console.log(`  -> upserted`, stats, 'items:', items.length);
       report.processed.push({ name: store.name, website: store.website, platform: source.type || (source.url ? 'api' : 'unknown'), inserted: stats.inserted, updated: stats.updated, items: items.length });
      return items.length;
    } catch (err) {
      console.warn('  -> Skipped due to error:', err?.message || String(err));
      report.processed.push({ name: s.name, website: s.website, reason: String(err?.message || err) });
      report.totals.skipped += 1;
      return 0;
    }
  }

  // Run with limited concurrency
  let i = 0;
  const conc = Math.max(1, args.concurrency || 1);
  while (i < queue.length) {
    const slice = queue.slice(i, i + conc);
    const counts = await Promise.all(slice.map(ingestOne));
    total += counts.reduce((a,b)=>a+b,0);
    i += conc;
  }
  report.totals.items = total;
  console.log('All stores processed. Total items:', total);
  try {
    const path = process.env.INGEST_REPORT;
    if (path) {
      const fs = await import('node:fs');
      fs.writeFileSync(path, JSON.stringify(report, null, 2));
      console.log('Wrote report to', path);
    }
  } catch {}
  process.exit(0);
} catch (e) {
  console.error('MULTI-STORE INGEST ERROR:', e?.message || e);
  process.exit(1);
}
