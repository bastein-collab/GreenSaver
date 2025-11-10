// services/deals.ts

// ---------- Types ----------
export type DealRow = {
  id: string;
  product_name: string;
  brand_name: string;
  dispensary_name: string;
  percent_off: number;
  price_cents: number; // store in cents; UI will divide by 100
  product_type?: string | null;
  category?: string | null;
  subcategory?: string | null;
};

export type DealFilters = {
  radiusMiles?: number;
  limit?: number;
  types?: string[];
  minOff?: number | null;
  maxPriceCents?: number | null;
  brands?: string[]; // brand names
  q?: string | null; // free text search
};

// ---------- Demo fallback (works without Supabase) ----------
const DEMO_DATA: DealRow[] = [
  {
    id: "demo-1",
    product_name: "Elite 1g Cart",
    brand_name: "Select",
    dispensary_name: "The Social Leaf",
    percent_off: 40,
    price_cents: 5499,
  },
  {
    id: "demo-2",
    product_name: "Live Resin 0.5g",
    brand_name: "Cheetah",
    dispensary_name: "The Social Leaf",
    percent_off: 25,
    price_cents: 3299,
  },
];

// ---------- Main API used by your screens ----------
/**
 * Returns deals near a ZIP (if provided). If Supabase env vars are missing or the
 * request fails, we return a safe demo list so the app continues to work.
 *
 * Expected env vars (set in .env.local):
 *  - EXPO_PUBLIC_SUPABASE_URL
 *  - EXPO_PUBLIC_SUPABASE_ANON_KEY
 *
 * If you already have a view/table for deals, update the `DEALS_RESOURCE` below.
 */
export async function getDealsForZip(
  zip?: string,
  filters: DealFilters = {}
): Promise<{ data: DealRow[]; error: any }> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  // If env is missing, use demo data (navigation still works)
  if (!url || !anon) {
    return { data: DEMO_DATA, error: null };
  }

  // TODO: Change to your actual PostgREST resource if different.
  // Common choices you might already have:
  //   deals_view, deals_norm, deals, public_deals
  const DEALS_RESOURCE = "deals_view";

  try {
    const params = new URLSearchParams();
    // Select only the columns we render
    params.set(
      "select",
      "id,product_name,brand_name,dispensary_name,percent_off,price_cents,product_type,category,subcategory"
    );
    const limit = Math.max(1, Math.min(Number(filters.limit ?? 50), 200));
    params.set("limit", String(limit));

    // If your resource has a postal_code column, this filter will work.
    // If you use a different column name, update "postal_code".
    if (zip && zip.length >= 3) params.set("postal_code", `eq.${zip}`);

    if (filters.minOff != null) params.set("percent_off", `gte.${filters.minOff}`);
    if (filters.maxPriceCents != null) params.set("price_cents", `lte.${filters.maxPriceCents}`);

    if (filters.brands && filters.brands.length) {
      // PostgREST: brand_name=in.("A","B") - need to quote and URL-encode
      const list = filters.brands.map((b) => `"${b.replace(/"/g, '"')}"`).join(",");
      params.set("brand_name", `in.(${list})`);
    }

    const orClauses: string[] = [];
    if (filters.types && filters.types.length) {
      for (const t of filters.types) {
        const enc = encodeURIComponent(t);
        orClauses.push(
          `product_type.ilike.*${enc}*`,
          `category.ilike.*${enc}*`,
          `subcategory.ilike.*${enc}*`,
          `product_name.ilike.*${enc}*`
        );
      }
    }
    if (filters.q && filters.q.trim()) {
      const q = encodeURIComponent(filters.q.trim());
      orClauses.push(
        `product_name.ilike.*${q}*`,
        `brand_name.ilike.*${q}*`,
        `product_type.ilike.*${q}*`,
        `category.ilike.*${q}*`,
        `subcategory.ilike.*${q}*`
      );
    }
    if (orClauses.length) params.set("or", `(${orClauses.join(",")})`);

    const resp = await fetch(`${url}/rest/v1/${DEALS_RESOURCE}?${params.toString()}`, {
      headers: {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
        Accept: "application/json",
      },
    });

    if (!resp.ok) {
      // On any Supabase error, fall back to demo so the UI still works
      const text = await resp.text();
      return {
        data: DEMO_DATA,
        error: new Error(`Supabase HTTP ${resp.status}: ${text}`),
      };
    }

    const rows = (await resp.json()) as any[];

    const data: DealRow[] = rows.map((r, i) => ({
      id: String(r.id ?? `row-${i}`),
      product_name: r.product_name ?? "Unknown product",
      brand_name: r.brand_name ?? "Unknown brand",
      dispensary_name: r.dispensary_name ?? "Unknown dispensary",
      percent_off: Number(r.percent_off ?? 0),
      price_cents: Number(r.price_cents ?? 0),
      product_type: (r as any).product_type ?? (r as any).category ?? (r as any).subcategory ?? null,
      category: (r as any).category ?? null,
      subcategory: (r as any).subcategory ?? null,
    }));

    return { data, error: null };
  } catch (e: any) {
    // Network or parsing issue → fall back to demo list
    return { data: DEMO_DATA, error: e };
  }
}

// ---------- Geo-aware helpers ----------
export async function getDealsNearZip(
  zip: string,
  options: DealFilters = {}
): Promise<{ data: DealRow[]; error: any }> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { data: DEMO_DATA, error: null };

  const radiusMiles = options.radiusMiles ?? 25;
  const limit = Math.max(1, Math.min(Number(options.limit ?? 100), 200));
  const radiusKm = radiusMiles * 1.60934;
  try {
    const resp = await fetch(`${url}/rest/v1/rpc/get_deals_near_zip`, {
      method: "POST",
      headers: {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_zip: zip,
        p_radius_km: radiusKm,
        p_limit: limit,
        p_types: options.types && options.types.length ? options.types.map((t)=>t.toLowerCase()) : null,
        p_min_off: options.minOff ?? null,
        p_max_price_cents: options.maxPriceCents ?? null,
        p_brand_names: options.brands && options.brands.length ? options.brands : null,
        p_query: options.q ?? null,
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      return { data: DEMO_DATA, error: new Error(`Supabase RPC ${resp.status}: ${text}`) };
    }
    const rows = (await resp.json()) as any[];
    const data: DealRow[] = rows.map((r, i) => ({
      id: String(r.id ?? `row-${i}`),
      product_name: r.product_name ?? "Unknown product",
      brand_name: r.brand_name ?? "Unknown brand",
      dispensary_name: r.dispensary_name ?? "Unknown dispensary",
      percent_off: Number(r.percent_off ?? 0),
      price_cents: Number(r.price_cents ?? 0),
      product_type: (r as any).product_type ?? (r as any).category ?? (r as any).subcategory ?? null,
      category: (r as any).category ?? null,
      subcategory: (r as any).subcategory ?? null,
    }));
    return { data, error: null };
  } catch (e: any) {
    return { data: DEMO_DATA, error: e };
  }
}

export async function getDealsNearLatLon(
  lat: number,
  lon: number,
  options: DealFilters = {}
): Promise<{ data: DealRow[]; error: any }> {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const anon = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { data: DEMO_DATA, error: null };
  const radiusMiles = options.radiusMiles ?? 25;
  const limit = Math.max(1, Math.min(Number(options.limit ?? 100), 200));
  const radiusKm = radiusMiles * 1.60934;
  try {
    const resp = await fetch(`${url}/rest/v1/rpc/get_deals_near`, {
      method: "POST",
      headers: {
        apikey: anon,
        Authorization: `Bearer ${anon}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        p_lat: lat,
        p_lon: lon,
        p_radius_km: radiusKm,
        p_limit: limit,
        p_types: options.types && options.types.length ? options.types.map((t)=>t.toLowerCase()) : null,
        p_min_off: options.minOff ?? null,
        p_max_price_cents: options.maxPriceCents ?? null,
        p_brand_names: options.brands && options.brands.length ? options.brands : null,
        p_query: options.q ?? null,
      }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      return { data: DEMO_DATA, error: new Error(`Supabase RPC ${resp.status}: ${text}`) };
    }
    const rows = (await resp.json()) as any[];
    const data: DealRow[] = rows.map((r, i) => ({
      id: String(r.id ?? `row-${i}`),
      product_name: r.product_name ?? "Unknown product",
      brand_name: r.brand_name ?? "Unknown brand",
      dispensary_name: r.dispensary_name ?? "Unknown dispensary",
      percent_off: Number(r.percent_off ?? 0),
      price_cents: Number(r.price_cents ?? 0),
      product_type: (r as any).product_type ?? (r as any).category ?? (r as any).subcategory ?? null,
      category: (r as any).category ?? null,
      subcategory: (r as any).subcategory ?? null,
    }));
    return { data, error: null };
  } catch (e: any) {
    return { data: DEMO_DATA, error: e };
  }
}
