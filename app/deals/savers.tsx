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
import * as Location from "expo-location";
import TopBrandsCard from "../../components/cards/TopBrandsCard";
import TopDispensariesCard from "../../components/cards/TopDispensariesCard";
import COLORS from "../../constants/colors";
import AppHeader from "../../components/ui/AppHeader";
import { supabase } from "../../lib/supabase";
import Dropdown from "../../components/ui/Dropdown";
import MultiSelectDropdown from "../../components/ui/MultiSelectDropdown";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useStoreSummaries } from "../../hooks/useStoreSummaries";
import { getTopBrandsToday } from "../../services/brands";

// Toggle the title layout:
//  - "underLogo": Title sits under the logo and is pushed right (your spec)
//  - "fullWidth": Title spans full width starting from left (alt look)
const TITLE_LAYOUT: "underLogo" | "fullWidth" = "underLogo";

export default function SaversScreen() {
  const router = useRouter();
  const [zip, setZip] = useState("");
  const [activeZip, setActiveZip] = useState("");
  const [geoSummaries, setGeoSummaries] = useState<any[]>([]);
  const RADII_MI = [5, 15, 25, 60] as const;
  const [radiusMi, setRadiusMi] = useState<number>(25);
  const DEFAULT_RADIUS_MI = 25; // retained for reference
  const miToKm = (mi: number) => mi * 1.60934;

  // How many dispensaries to show in the Top Dispensaries card
  const COUNT_OPTIONS = [5, 10, -1] as const; // -1 means All
  const [maxStores, setMaxStores] = useState<number>(5);
  const [lastGeo, setLastGeo] = useState<{ lat: number; lon: number } | null>(null);
  // Layout metrics to align the second row pills
  const [controlsWidth, setControlsWidth] = useState<number>(0);
  const [btnLeft, setBtnLeft] = useState<number>(0);
  const [zipRight, setZipRight] = useState<number>(0);
  const [productTypes, setProductTypes] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [minOff, setMinOff] = useState<number | -1>(-1); // -1 = Any
  const [maxPriceDollars, setMaxPriceDollars] = useState<number | -1>(-1); // -1 = Any
  const PRODUCT_OPTIONS = [
    { label: "Flower", value: "flower" },
    { label: "Vape", value: "vape" },
    { label: "Edible", value: "edible" },
    { label: "Concentrate", value: "concentrate" },
    { label: "Pre-roll", value: "pre-roll" },
    { label: "Tincture", value: "tincture" },
    { label: "Topical", value: "topical" },
  ];
  // Live data hooks/services (with safe fallbacks inside)
  const { data: storeSummaries } = useStoreSummaries();
  const [zipSummaries, setZipSummaries] = useState<any[]>([]);

  // When the user confirms a ZIP (presses Go), fetch summaries near that ZIP via RPC
  React.useEffect(() => {
    // Load persisted selections on first mount
    (async () => {
      try {
        const [rMi, mStores, types, bsel, minSel, maxSel] = await Promise.all([
          AsyncStorage.getItem("gf_radiusMi"),
          AsyncStorage.getItem("gf_maxStores"),
          AsyncStorage.getItem("gf_types"),
          AsyncStorage.getItem("gf_brands"),
          AsyncStorage.getItem("gf_minOff"),
          AsyncStorage.getItem("gf_maxPriceDollars"),
        ]);
        if (rMi) setRadiusMi(Number(rMi));
        if (mStores) setMaxStores(Number(mStores));
        if (types) setProductTypes(JSON.parse(types));
        if (bsel) setBrands(JSON.parse(bsel));
        if (minSel) setMinOff(Number(minSel));
        if (maxSel) setMaxPriceDollars(Number(maxSel));
      } catch {}
    })();
  }, []);

  React.useEffect(() => {
    // Persist selections whenever they change
    AsyncStorage.setItem("gf_radiusMi", String(radiusMi)).catch(() => {});
  }, [radiusMi]);
  React.useEffect(() => {
    AsyncStorage.setItem("gf_maxStores", String(maxStores)).catch(() => {});
  }, [maxStores]);
  React.useEffect(() => {
    AsyncStorage.setItem("gf_types", JSON.stringify(productTypes)).catch(() => {});
  }, [productTypes]);
  React.useEffect(() => {
    AsyncStorage.setItem("gf_brands", JSON.stringify(brands)).catch(() => {});
  }, [brands]);
  React.useEffect(() => {
    AsyncStorage.setItem("gf_minOff", String(minOff)).catch(() => {});
  }, [minOff]);
  React.useEffect(() => {
    AsyncStorage.setItem("gf_maxPriceDollars", String(maxPriceDollars)).catch(() => {});
  }, [maxPriceDollars]);

  React.useEffect(() => {
    const z = (activeZip || "").trim();
    if (z.length !== 5) {
      setZipSummaries([]);
      return;
    }
    if (!(supabase as any)?.rpc) {
      setZipSummaries([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await (supabase as any).rpc(
          "get_store_summaries_near_zip",
          { p_zip: z, p_radius_km: miToKm(radiusMi) }
        );
        if (!cancelled) setZipSummaries((data as any[]) || []);
      } catch {
        if (!cancelled) setZipSummaries([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeZip, radiusMi]);

  // If user changes radius and we have a last GPS fix, refresh geo results
  React.useEffect(() => {
    (async () => {
      if (!lastGeo || !(supabase as any)?.rpc) return;
      const { lat, lon } = lastGeo;
      const { data } = await (supabase as any).rpc("get_store_summaries_near", {
        p_lat: lat,
        p_lon: lon,
        p_radius_km: miToKm(radiusMi),
      });
      setGeoSummaries((data as any[]) || []);
    })();
  }, [radiusMi]);

  // Handler: Use my location → query RPC by lat/lon
  async function handleUseMyLocation() {
    try {
      // Request permission politely
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        // Permission denied: clear geo results and keep fallback
        setGeoSummaries([]);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      const { latitude, longitude } = pos.coords;
      if (!(supabase as any)?.rpc) return;
      const { data } = await (supabase as any).rpc("get_store_summaries_near", {
        p_lat: latitude,
        p_lon: longitude,
        p_radius_km: miToKm(radiusMi),
      });
      setActiveZip(""); // prioritize geo over last ZIP
      setGeoSummaries((data as any[]) || []);
      setLastGeo({ lat: latitude, lon: longitude });
      // Also open the deals screen with location + radius
      const typesParam = productTypes.length ? `&types=${encodeURIComponent(productTypes.join(','))}` : '';
      const brandsParam = brands.length ? `&brands=${brands.map(encodeURIComponent).join(',')}` : '';
      const minParam = minOff >= 0 ? `&min=${minOff}` : '';
      const maxParam = maxPriceDollars >= 0 ? `&max=${Math.round(maxPriceDollars * 100)}` : '';
      router.push(`/deals?lat=${latitude.toFixed(5)}&lon=${longitude.toFixed(5)}&r=${radiusMi}${typesParam}${brandsParam}${minParam}${maxParam}`);
    } catch (_) {
      setGeoSummaries([]);
    }
  }
  const [topBrands, setTopBrands] = useState(
    [] as { id: string; name: string; percentOff: number; deals: number }[]
  );
  React.useEffect(() => {
    (async () => {
      const res = await getTopBrandsToday(4);
      setTopBrands((res as any).data ?? []);
    })();
  }, []);

  const currentList = (
    geoSummaries.length > 0
      ? geoSummaries
      : activeZip.trim().length === 5
      ? zipSummaries
      : storeSummaries
  ) as any[];
  const limited = currentList?.slice(0, maxStores === -1 ? undefined : maxStores) ?? [];
  const featured = limited[0] as any;

  // Compute last updated time from the current list (Supabase view/RPC exposes last_scraped)
  const lastUpdated: string | null = (() => {
    try {
      const all = (currentList || []) as any[];
      const ts = all
        .map((r) => (r?.last_scraped ? new Date(r.last_scraped).getTime() : 0))
        .filter((n) => Number.isFinite(n) && n > 0);
      if (!ts.length) return null;
      const maxTs = Math.max(...ts);
      const d = new Date(maxTs);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return null;
    }
  })();

  const Header = (
    <View style={styles.headerWrap}>
      {/* App header (handles logo + title layout safely) */}
      <AppHeader />

      {/* Controls row under the title */}
      <View
        style={styles.controls}
        onLayout={(e) => setControlsWidth(e.nativeEvent.layout.width)}
      >
        <Pressable
          onPress={handleUseMyLocation}
          accessibilityRole="button"
          style={styles.btnPrimary}
          onLayout={(e) => setBtnLeft(e.nativeEvent.layout.x)}
        >
          <Text style={styles.btnPrimaryText}>Use my location</Text>
        </Pressable>

        <View
          style={styles.zipPill}
          onLayout={(e) => setZipRight(e.nativeEvent.layout.x + e.nativeEvent.layout.width)}
        >
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
          onPress={() => {
            const z = zip.trim();
            if (z.length === 5) setActiveZip(z);
            const typesParam = productTypes.length ? `&types=${encodeURIComponent(productTypes.join(','))}` : '';
            const brandsParam = brands.length ? `&brands=${brands.map(encodeURIComponent).join(',')}` : '';
            const minParam = minOff >= 0 ? `&min=${minOff}` : '';
            const maxParam = maxPriceDollars >= 0 ? `&max=${Math.round(maxPriceDollars * 100)}` : '';
            router.push(z ? `/deals?zip=${z}&r=${radiusMi}${typesParam}${brandsParam}${minParam}${maxParam}` : `/deals?r=${radiusMi}${typesParam}${brandsParam}${minParam}${maxParam}`);
          }}
          accessibilityRole="button"
          style={styles.btnGo}
        >
          <Text style={styles.btnGoText}>Go</Text>
        </Pressable>
      </View>

      {lastUpdated && (
        <Text style={styles.lastUpdated}>Savers Last Updated: {lastUpdated}</Text>
      )}

      {/* Aligned secondary controls row */}
      <View
        style={[
          styles.subControls,
          { paddingLeft: btnLeft, paddingRight: Math.max(0, controlsWidth - zipRight) },
        ]}
      >
        <View style={styles.subCell}>
          <Dropdown
            value={maxStores}
            onChange={(v) => setMaxStores(v)}
            options={[
              { label: "5", value: 5 },
              { label: "10", value: 10 },
              { label: "All", value: -1 },
            ]}
            pillLabel="Stores"
            align="left"
            style={{ width: "100%" }}
          />
        </View>
        <View style={styles.subCell}>
          <Dropdown
            value={radiusMi}
            onChange={(v) => setRadiusMi(v)}
            options={RADII_MI.map((m) => ({ label: `${m} mi`, value: m }))}
            pillLabel="Radius"
            align="right"
            style={{ width: "100%" }}
          />
        </View>
        <View style={styles.subCell}>
          <MultiSelectDropdown
            values={productTypes}
            onChange={setProductTypes}
            options={PRODUCT_OPTIONS}
            pillLabel="Types"
            align="right"
            style={{ width: "100%" }}
          />
        </View>
      </View>

      {/* More filters row */}
      <View
        style={[
          styles.subControls,
          { paddingLeft: btnLeft, paddingRight: Math.max(0, controlsWidth - zipRight) },
        ]}
      >
        <View style={styles.subCell}>
          <Dropdown
            value={minOff}
            onChange={(v) => setMinOff(v)}
            options={[
              { label: "Any Off", value: -1 },
              { label: "10%+", value: 10 },
              { label: "20%+", value: 20 },
              { label: "30%+", value: 30 },
              { label: "40%+", value: 40 },
              { label: "50%+", value: 50 },
            ]}
            pillLabel="Min Off"
            align="left"
            style={{ width: "100%" }}
          />
        </View>
        <View style={styles.subCell}>
          <Dropdown
            value={maxPriceDollars}
            onChange={(v) => setMaxPriceDollars(v)}
            options={[
              { label: "Any Price", value: -1 },
              { label: "Under $25", value: 25 },
              { label: "Under $50", value: 50 },
              { label: "Under $75", value: 75 },
              { label: "Under $100", value: 100 },
            ]}
            pillLabel="Max Price"
            align="right"
            style={{ width: "100%" }}
          />
        </View>
        <View style={styles.subCell}>
          <MultiSelectDropdown
            values={brands}
            onChange={setBrands}
            options={(topBrands || []).map((b) => ({ label: b.name, value: b.name }))}
            pillLabel="Brands"
            align="right"
            style={{ width: "100%" }}
          />
        </View>
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
          {limited && limited.length > 1 ? (
            <TopDispensariesCard
              rows={limited.map((r: any, i: number) => ({
                id: String(r.dispensary_id ?? i),
                name: r.dispensary_name ?? "Unknown",
                deals: r.deals_count ?? 0,
                maxOff: r.max_off ?? 0,
                avgPrice: r.avg_price ?? 0,
              }))}
              onViewAll={() => {
                const typesParam = productTypes.length ? `&types=${encodeURIComponent(productTypes.join(','))}` : '';
                const brandsParam = brands.length ? `&brands=${brands.map(encodeURIComponent).join(',')}` : '';
                const minParam = minOff >= 0 ? `&min=${minOff}` : '';
                const maxParam = maxPriceDollars >= 0 ? `&max=${Math.round(maxPriceDollars * 100)}` : '';
                if (lastGeo) {
                  const { lat, lon } = lastGeo;
                  router.push(`/deals?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}&r=${radiusMi}${typesParam}${brandsParam}${minParam}${maxParam}`);
                } else if (activeZip.trim().length === 5 || zip.trim().length === 5) {
                  const z = (activeZip.trim().length === 5 ? activeZip : zip).trim();
                  router.push(`/deals?zip=${z}&r=${radiusMi}${typesParam}${brandsParam}${minParam}${maxParam}`);
                } else {
                  router.push(`/deals?r=${radiusMi}${typesParam}${brandsParam}${minParam}${maxParam}`);
                }
              }}
            />
          ) : (
            <TopDispensariesCard
              name={(featured?.dispensary_name as any) || "The Social Leaf"}
              deals={(featured?.deals_count as any) || 0}
              maxOff={(featured?.max_off as any) || 0}
              avgPrice={(featured?.avg_price as any) || 0}
              onViewAll={() => {
                const typesParam = productTypes.length ? `&types=${encodeURIComponent(productTypes.join(','))}` : '';
                const brandsParam = brands.length ? `&brands=${brands.map(encodeURIComponent).join(',')}` : '';
                const minParam = minOff >= 0 ? `&min=${minOff}` : '';
                const maxParam = maxPriceDollars >= 0 ? `&max=${Math.round(maxPriceDollars * 100)}` : '';
                if (lastGeo) {
                  const { lat, lon } = lastGeo;
                  router.push(`/deals?lat=${lat.toFixed(5)}&lon=${lon.toFixed(5)}&r=${radiusMi}${typesParam}${brandsParam}${minParam}${maxParam}`);
                } else if (activeZip.trim().length === 5 || zip.trim().length === 5) {
                  const z = (activeZip.trim().length === 5 ? activeZip : zip).trim();
                  router.push(`/deals?zip=${z}&r=${radiusMi}${typesParam}${brandsParam}${minParam}${maxParam}`);
                } else {
                  router.push(`/deals?r=${radiusMi}${typesParam}${brandsParam}${minParam}${maxParam}`);
                }
              }}
            />
          )}

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
  lastUpdated: {
    marginTop: 6,
    fontSize: 12,
    color: COLORS.TEXT_SUBTLE,
  },

  controls: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 10,
  },
  subControls: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 6,
    marginBottom: 2,
    gap: 12,
  },
  subCell: {
    flex: 1,
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
    fontSize: 16,
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
    fontSize: 16,
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
    fontSize: 16,
  },

  content: {
    paddingHorizontal: 20,
    paddingTop: 14,
  },
});
