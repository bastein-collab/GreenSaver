// services/brands.ts
import { supabase } from "../lib/supabase";

export type BrandToday = {
  id: string;
  name: string;
  deals: number;
  percentOff: number; // max or representative discount for the day
};

const DEMO: BrandToday[] = [
  { id: "1", name: "Select", percentOff: 40, deals: 29 },
  { id: "2", name: "Cheetah", percentOff: 25, deals: 20 },
  { id: "3", name: "Kind Tree", percentOff: 18, deals: 18 },
  { id: "4", name: "Legend", percentOff: 15, deals: 18 },
];

/**
 * Loads top brands for today from a view like `top_brands_today`.
 * Falls back to a small demo list if Supabase is not configured.
 *
 * Expected columns (any of these aliases will be mapped):
 *  - brand_name | name
 *  - deals_count | deals
 *  - max_off | percent_off | pct_off
 */
export async function getTopBrandsToday(limit = 10): Promise<{ data: BrandToday[]; error: any }> {
  // If supabase client isn't configured, return demo
  if (!supabase || !(supabase as any).from) {
    return { data: DEMO, error: null };
  }

  try {
    const { data, error } = await (supabase as any)
      .from("top_brands_today")
      .select("id, brand_name, name, deals_count, deals, max_off, percent_off, pct_off")
      .order("max_off", { ascending: false })
      .limit(limit);

    if (error) throw error;

    const rows = (data || []) as any[];
    const mapped: BrandToday[] = rows.map((r, i) => ({
      id: String(r.id ?? `row-${i}`),
      name: r.brand_name ?? r.name ?? "Unknown",
      deals: Number(r.deals_count ?? r.deals ?? 0),
      percentOff: Number(r.max_off ?? r.percent_off ?? r.pct_off ?? 0),
    }));

    return { data: mapped, error: null };
  } catch (e: any) {
    return { data: DEMO, error: e };
  }
}

