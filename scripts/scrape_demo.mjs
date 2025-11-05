// scripts/scrape_demo.mjs
// Social Leaf (Discounts) → Supabase (pagination + rich fields)

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// ---------- 0) ENV / CLIENT ----------
const SUPABASE_URL  = process.env.SUPABASE_URL;
const SERVICE_ROLE  = process.env.SUPABASE_SERVICE_ROLE;

const STORE_NAME    = process.env.TARGET_STORE_NAME || 'The Social Leaf — Toms River';
const STORE_CITY    = process.env.TARGET_STORE_CITY || 'Toms River, NJ';
const STORE_WEBSITE = process.env.TARGET_STORE_URL  || 'https://shop.thesocialleaf.com/toms-river/menu/discounts';
const STORE_ID      = process.env.TARGET_STORE_ID   || '104';

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE in .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

// ---------- 1) DB HELPERS ----------
async function getOrCreateDispensary() {
  const { data, error } = await supabase
    .from('dispensaries')
    .upsert(
      { name: STORE_NAME, city: STORE_CITY, website: STORE_WEBSITE },
      { onConflict: 'website' }
    )
    .select('id')
    .single();

  if (error) throw error;
  return data.id;
}

// ---------- 2) FETCH LIVE DEAL PRODUCTS (with pagination) ----------
async function fetchDealsFromWeb(url) {
  console.log('Fetching PRODUCT JSON from GetProductList with pagination…');

  const target = 'https://shop.thesocialleaf.com/_api/Products/GetProductList';

  const PAGE_SIZE = 150;
  const MAX_PAGES = Number(process.env.TARGET_MAX_PAGES || 10);

  // Body based on your working capture (Deals quickFilter + promotion IDs)
  const baseBody = {
    filters: {
      quickFilter: [2],
      promotion: [
        58687, 58674, 58676, 143414, 151958, 58684, 151951, 241429, 58691, 164811,
        310213, 316803, 180996, 180990, 90063, 306235, 306236, 221917, 57390
      ]
    },
    page: 1,
    pageSize: PAGE_SIZE,
    sortingMethodId: 7,
    searchTerm: '',
    platformOs: 'web',
    sourcePage: 2
  };

  const headers = {
    accept: 'application/json, text/plain, */*',
    'content-type': 'application/json',
    origin: 'https://shop.thesocialleaf.com',
    referer: 'https://shop.thesocialleaf.com/toms-river/menu/discounts',
    'user-agent': 'Mozilla/5.0 DealFinder/1.0',
    storeid: STORE_ID,
    ssr: 'false',
  };

  const allProducts = [];
  let page = 1;

  while (page <= MAX_PAGES) {
    const body = { ...baseBody, page };
    const res = await fetch(target, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.warn(`Page ${page}: non-200 status`, res.status);
      break;
    }

    let json;
    try {
      json = await res.json();
    } catch {
      console.warn(`Page ${page}: response not JSON`);
      break;
    }

    const list = Array.isArray(json?.list) ? json.list : [];
    console.log(`Page ${page}: received ${list.length} items`);
    allProducts.push(...list);

    if (list.length < PAGE_SIZE) break;

    // polite pause
    await new Promise(r => setTimeout(r, 300));
    page += 1;
  }

  // ---- Field helpers ----
  const pickName = (p) =>
    p.name || p.title || p.product_name || p.display_name || p.product?.name || null;

  const pickPrice = (p) =>
    (typeof p.price === 'number' ? p.price : null) ??
    p.price?.final ?? p.price?.sale ?? p.price?.value ??
    p.salePrice ?? p.finalPrice ?? p.unitPrice ?? p.lowest_price ?? p.min_price ??
    p.product?.price ??
    (Array.isArray(p.variants) ? p.variants[0]?.price : null);

  const pickDiscount = (p) =>
    p.discount_percent ?? p.discountPercentage ?? p.discount ??
    p.promo?.percent ?? p.promotion?.percent ?? p.price?.discountPercent ?? null;

  const pickBrand = (p) =>
    p.brand?.name || p.brandName || p.brand || p.vendor?.name || null;

  const pickCategory = (p) =>
    p.category?.name || p.categoryName || p.category || p.productType || null;

  const pickSubcategory = (p) =>
    p.subcategory?.name || p.subCategory?.name || null;

  const pickImage = (p) =>
    (Array.isArray(p.images) && p.images.length > 0 ? p.images[0] : null);

  // THC/CBD may be numbers or strings; parse to numeric %
  const toPct = (v) => {
    if (v == null) return null;
    if (typeof v === 'number') return v;
    const m = String(v).match(/(\d+(\.\d+)?)/);
    return m ? Number(m[1]) : null;
  };
  const pickTHC = (p) =>
    toPct(p.thc) ?? toPct(p.thcPercent) ?? toPct(p.potencyThc) ?? toPct(p.analysis?.thc);
  const pickCBD = (p) =>
    toPct(p.cbd) ?? toPct(p.cbdPercent) ?? toPct(p.potencyCbd) ?? toPct(p.analysis?.cbd);

  const pickStrainName = (p) => p.strain?.name || null;
  const pickStrainType = (p) => p.strain?.prevalence?.name || null;

  const items = allProducts
    .map((p) => ({
      name: pickName(p),
      price: pickPrice(p),
      discount_percent: pickDiscount(p),
      brand: pickBrand(p),
      category: pickCategory(p),
      subcategory: pickSubcategory(p),
      image_url: pickImage(p),
      thc_percent: pickTHC(p),
      cbd_percent: pickCBD(p),
      strain_name: pickStrainName(p),
      strain_type: pickStrainType(p),
      source_url: url,
    }))
    .filter((x) => x.name && Number.isFinite(x.price));

  console.log(`Parsed ${items.length} products from JSON across ${Math.min(page, MAX_PAGES)} page(s).`);

  if (items.length > 0) {
    console.log('SAMPLE PRODUCT OBJECT (parsed view):', JSON.stringify(items[0], null, 2).slice(0, 1200));
  } else if (allProducts[0]) {
    console.warn('First raw product (unparsed):', JSON.stringify(allProducts[0], null, 2).slice(0, 1200));
  }

  return items;
}

// ---------- 3) UPSERT + HISTORY ----------
async function upsertDeals(dispensaryId, deals) {
  const { data: run, error: runErr } = await supabase
    .from('scrape_runs')
    .insert({ source: STORE_NAME, status: 'success', notes: `Fetched ${deals.length} items` })
    .select('id')
    .single();
  if (runErr) throw runErr;

  const runId = run.id;

  let inserted = 0, updated = 0, unchanged = 0, history = 0;

  for (const d of deals) {
    const { data: existing, error: findErr } = await supabase
      .from('products')
      .select('id, price')
      .eq('dispensary_id', dispensaryId)
      .eq('name', d.name)
      .maybeSingle();
    if (findErr) throw findErr;

    if (!existing) {
      const { error } = await supabase.from('products').upsert(
        {
          dispensary_id: dispensaryId,
          name: d.name,
          category: d.category ?? null,
          subcategory: d.subcategory ?? null,
          brand: d.brand ?? null,
          thc_percent: d.thc_percent ?? null,
          cbd_percent: d.cbd_percent ?? null,
          strain_name: d.strain_name ?? null,
          strain_type: d.strain_type ?? null,
          image_url: d.image_url ?? null,
          price: d.price,
          discount_percent: d.discount_percent,
          source_url: d.source_url,
          scraped_at: new Date().toISOString(),
        },
        { onConflict: 'dispensary_id,name' }
      );
      if (error) throw error;
      inserted++;
      continue;
    }

    const oldPrice = existing.price;
    const newPrice = d.price;

    if (newPrice != null && oldPrice !== newPrice) {
      const { error: updErr } = await supabase
        .from('products')
        .update({
          price: newPrice,
          discount_percent: d.discount_percent,
          category: d.category ?? null,
          subcategory: d.subcategory ?? null,
          brand: d.brand ?? null,
          thc_percent: d.thc_percent ?? null,
          cbd_percent: d.cbd_percent ?? null,
          strain_name: d.strain_name ?? null,
          strain_type: d.strain_type ?? null,
          image_url: d.image_url ?? null,
          source_url: d.source_url,
          scraped_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      if (updErr) throw updErr;
      updated++;

      const { error: histErr } = await supabase.from('price_history').insert({
        product_id: existing.id,
        old_price: oldPrice,
        new_price: newPrice,
        scrape_run_id: runId,
      });
      if (histErr) throw histErr;
      history++;
    } else {
      await supabase
        .from('products')
        .update({
          discount_percent: d.discount_percent,
          category: d.category ?? null,
          subcategory: d.subcategory ?? null,
          brand: d.brand ?? null,
          thc_percent: d.thc_percent ?? null,
          cbd_percent: d.cbd_percent ?? null,
          strain_name: d.strain_name ?? null,
          strain_type: d.strain_type ?? null,
          image_url: d.image_url ?? null,
          source_url: d.source_url,
          scraped_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      unchanged++;
    }
  }

  console.log(`Inserted: ${inserted}, Updated: ${updated}, Unchanged: ${unchanged}, History rows: ${history}`);
}

// ---------- 4) MAIN ----------
try {
  const dispensaryId = await getOrCreateDispensary();
  const deals = await fetchDealsFromWeb(STORE_WEBSITE);
  await upsertDeals(dispensaryId, deals);
  console.log('Done.');
  process.exit(0);
} catch (e) {
  console.error('SCRAPER ERROR:', e?.message || e);
  try {
    await supabase.from('scrape_runs').insert({
      source: STORE_NAME,
      status: 'error',
      notes: String(e?.message || e),
    });
  } catch {}
  process.exit(1);
}
