// services/deals.ts

// ---------- Types ----------
export type DealRow = {
  id: string;
  product_name: string;
  brand_name: string;
  dispensary_name: string;
  percent_off: number;
  price_cents: number; // store in cents; UI will divide by 100
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
  zip?: string
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
      "id,product_name,brand_name,dispensary_name,percent_off,price_cents"
    );
    params.set("limit", "50");

    // If your resource has a postal_code column, this filter will work.
    // If you use a different column name, update "postal_code".
    if (zip && zip.length >= 3) {
      params.set("postal_code", `eq.${zip}`);
    }

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
    }));

    return { data, error: null };
  } catch (e: any) {
    // Network or parsing issue → fall back to demo list
    return { data: DEMO_DATA, error: e };
  }
}
