// app/deals/savers.tsx
import { useRouter } from "expo-router";
import React, { useState } from "react";
import {
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import TopBrandsCard from "../../components/cards/TopBrandsCard";
import TopDispensariesCard from "../../components/cards/TopDispensariesCard";
import COLORS from "../../constants/colors";
import AppHeader from "../../components/ui/AppHeader";
import { useStoreSummaries } from "../../hooks/useStoreSummaries";
import { getTopBrandsToday } from "../../services/brands";

// Toggle the title layout:
//  - "underLogo": Title sits under the logo and is pushed right (your spec)
//  - "fullWidth": Title spans full width starting from left (alt look)
const TITLE_LAYOUT: "underLogo" | "fullWidth" = "underLogo";

export default function SaversScreen() {
  const router = useRouter();
  const [zip, setZip] = useState("");
  // Live data hooks/services (with safe fallbacks inside)
  const { data: storeSummaries } = useStoreSummaries();
  const [topBrands, setTopBrands] = useState(
    [] as { id: string; name: string; percentOff: number; deals: number }[]
  );
  React.useEffect(() => {
    (async () => {
      const res = await getTopBrandsToday(4);
      setTopBrands((res as any).data ?? []);
    })();
  }, []);

  const Header = (
    <View style={styles.headerWrap}>
      {/* App header (handles logo + title layout safely) */}
      <AppHeader />

      {/* Controls row under the title */}
      <View style={styles.controls}>
        <Pressable
          onPress={() => router.push("/deals")}
          accessibilityRole="button"
          style={styles.btnPrimary}
        >
          <Text style={styles.btnPrimaryText}>Use my location</Text>
        </Pressable>

        <View style={styles.zipPill}>
          <TextInput
            value={zip}
            onChangeText={(t) => setZip(t.replace(/[^0-9]/g, "").slice(0, 5))}
            placeholder="ZIP"
            placeholderTextColor="#6B7280"
            keyboardType="number-pad"
            maxLength={5}
            style={styles.zipInput}
          />
        </View>

        <Pressable
          onPress={() => router.push(zip ? `/deals?zip=${zip}` : "/deals")}
          accessibilityRole="button"
          style={styles.btnGo}
        >
          <Text style={styles.btnGoText}>Go</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <FlatList
      data={[{ key: "content" }]}
      keyExtractor={(it) => it.key}
      ListHeaderComponent={Header}
      renderItem={() => (
        <View style={styles.content}>
          <TopDispensariesCard
            name={(storeSummaries?.[0]?.dispensary_name as any) || "The Social Leaf"}
            deals={(storeSummaries?.[0]?.deals_count as any) || 0}
            maxOff={(storeSummaries?.[0]?.max_off as any) || 0}
            avgPrice={(storeSummaries?.[0]?.avg_price as any) || 0}
          />

          <View style={{ height: 14 }} />

          <TopBrandsCard rows={topBrands} />

          <View style={{ height: 40 }} />
        </View>
      )}
      contentContainerStyle={{
        paddingBottom: 16 + (Platform.OS === "ios" ? 8 : 0),
      }}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  headerWrap: {
    paddingHorizontal: 20,
    paddingBottom: 6,
  },

  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 10,
  },
  btnPrimary: {
    backgroundColor: COLORS.green,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 26,
  },
  btnPrimaryText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 18,
  },
  zipPill: {
    flex: 1,
    backgroundColor: COLORS.chip,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#E5EAF0",
    paddingHorizontal: 16,
    paddingVertical: Platform.select({ ios: 10, android: 6 }),
  },
  zipInput: {
    fontSize: 18,
    color: COLORS.ink,
    fontWeight: "800",
    letterSpacing: 1,
  },
  btnGo: {
    backgroundColor: COLORS.green,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 26,
  },
  btnGoText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 18,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 14,
  },
});
