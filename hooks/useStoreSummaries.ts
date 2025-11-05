// hooks/useStoreSummaries.ts
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export interface StoreSummary {
  dispensary_id: string;
  dispensary_name: string;
  city: string | null;
  distance_km: number | null;
  deals_count: number;
  max_off: number;
  avg_price: number | null;
  median_price: number | null;
  last_scraped: string | null;
}

/**
 * Tries the RPC (geo filtered). If it returns no rows or fails,
 * falls back to the statewide view (v_deals_by_store).
 */
export function useStoreSummaries(
  // Center near Toms River, NJ
  lat = 39.9536,
  lon = -74.1979,
  // Wide default to guarantee results
  radiusKm = 300
) {
  const [data, setData] = useState<StoreSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"rpc" | "view" | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchViaRpc() {
      const { data, error } = await supabase.rpc("get_store_summaries_near", {
        p_lat: lat,
        p_lon: lon,
        p_radius_km: radiusKm,
      });
      if (error) throw error;
      return (data || []) as StoreSummary[];
    }

    async function fetchViaView() {
      // Statewide summary, no geo filter
      const { data, error } = await supabase
        .from("v_deals_by_store")
        .select(
          "dispensary_id, dispensary_name, city, deals_count, max_off, avg_price, median_price, last_scraped"
        )
        .order("max_off", { ascending: false })
        .limit(10);
      if (error) throw error;
      // distance_km is null for the view fallback
      return (data || []).map((d: any) => ({ ...d, distance_km: null })) as StoreSummary[];
    }

    async function load() {
      setLoading(true);
      setError(null);
      try {
        let rows: StoreSummary[] = [];
        try {
          rows = await fetchViaRpc();
          if (rows.length > 0) {
            if (!cancelled) {
              setData(rows);
              setSource("rpc");
            }
            return;
          }
        } catch (_) {
          // ignore and try view
        }

        // Fallback to view (statewide)
        rows = await fetchViaView();
        if (!cancelled) {
          setData(rows);
          setSource("view");
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err?.message ?? "Unknown error");
          setData([]);
          setSource(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [lat, lon, radiusKm]);

  return { data, loading, error, source };
}
