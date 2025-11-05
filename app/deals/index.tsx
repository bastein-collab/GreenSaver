// app/deals/index.tsx
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import DealCard from "../../components/DealCard"; // make sure this exists
import COLORS from "../../constants/colors";
import { getDealsForZip } from "../../services/deals"; // your data fn

type Row = {
  id: string;
  dispensary_name: string;
  brand_name: string;
  product_name: string;
  percent_off: number;
  price_cents: number;
};

export default function DealsIndex() {
  const { zip } = useLocalSearchParams<{ zip?: string }>();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        const res = await getDealsForZip(zip || "");
        if ((res as any).error) throw (res as any).error;
        setRows(((res as any).data ?? []) as Row[]);
      } catch (e: any) {
        setError(e?.message ?? String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [zip]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.WHITE }}>
      <View style={{ padding: 16, flex: 1 }}>
        <Text style={styles.h1}>Deals</Text>
        <Text style={styles.sub}>{zip ? `Showing deals near ZIP ${zip}` : "Top deals"}</Text>

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
