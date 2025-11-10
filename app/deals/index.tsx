// app/deals/index.tsx
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import DealCard from "../../components/DealCard"; // make sure this exists
import COLORS from "../../constants/colors";
import { getDealsForZip, getDealsNearZip, getDealsNearLatLon } from "../../services/deals"; // data fns

type Row = {
  id: string;
  dispensary_name: string;
  brand_name: string;
  product_name: string;
  percent_off: number;
  price_cents: number;
};

export default function DealsIndex() {
  const { zip, r, lat, lon, types, min, max, brands, q } = useLocalSearchParams<{
    zip?: string;
    r?: string;
    lat?: string;
    lon?: string;
    types?: string;
    min?: string; // min discount
    max?: string; // max price cents
    brands?: string; // csv of brand names
    q?: string; // query
  }>();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const radiusMi = Number(r || "");
        const rMi = Number.isFinite(radiusMi) && radiusMi > 0 ? radiusMi : 25;

        const selectedTypes = (types || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
        const selectedBrands = (brands || "").split(",").map((s) => decodeURIComponent(s).trim()).filter(Boolean);
        const minOff = Number(min);
        const maxPriceCents = Number(max);
        const options = {
          radiusMiles: rMi,
          limit: 100,
          types: selectedTypes,
          brands: selectedBrands,
          minOff: Number.isFinite(minOff) ? minOff : undefined,
          maxPriceCents: Number.isFinite(maxPriceCents) ? maxPriceCents : undefined,
          q: (q || "").trim() || undefined,
        } as const;

        let res: any;
        if (lat && lon) {
          const la = Number(lat);
          const lo = Number(lon);
          if (Number.isFinite(la) && Number.isFinite(lo)) {
            res = await getDealsNearLatLon(la, lo, options as any);
          } else if (zip) {
            res = await getDealsNearZip(zip, options as any);
          } else {
            res = await getDealsForZip("", options as any);
          }
        } else if (zip) {
          // Prefer geo-aware RPC for zip when radius provided
          res = await getDealsNearZip(zip, options as any);
        } else {
          res = await getDealsForZip("", options as any);
        }
        if ((res as any).error) throw (res as any).error;
        setRows((((res as any).data ?? []) as Row[]));
      } catch (e: any) {
        setError(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [zip, r, lat, lon, types]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.WHITE }}>
      <View style={{ padding: 16, flex: 1 }}>
        <Text style={styles.h1}>Deals</Text>
        <Text style={styles.sub}>
          {lat && lon
            ? `Within ${r || 25} mi of your location`
            : zip
            ? `Within ${r || 25} mi of ZIP ${zip}`
            : "Top deals"}
        </Text>

        {loading && <ActivityIndicator size="large" color={COLORS.GREEN} style={{ marginTop: 20 }} />}
        {error && <Text style={styles.error}>⚠️ {error}</Text>}
        {!loading && rows.length === 0 && <Text style={styles.empty}>No deals found yet.</Text>}

        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <DealCard
              dispensary={item.dispensary_name}
              brand={item.brand_name}
              product={item.product_name}
              percentOff={item.percent_off}
              priceCents={item.price_cents}
            />
          )}
          contentContainerStyle={{ paddingBottom: 24 }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  h1: { fontWeight: "800", fontSize: 22, marginBottom: 6, color: COLORS.TEXT_DARK },
  sub: { opacity: 0.7, marginBottom: 12, color: COLORS.TEXT_SUBTLE },
  error: { color: "crimson", marginTop: 8 },
  empty: { opacity: 0.7, marginTop: 14, color: COLORS.TEXT_SUBTLE },
});
