// components/cards/TopDispensariesCard.tsx
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import COLORS from "../../constants/colors";

type DispensaryRow = {
  id: string;
  name: string;
  deals: number;
  maxOff: number;
  avgPrice: number;
};

type Props =
  | {
      // Back-compat: current single featured layout
      name: string;
      deals: number;
      maxOff: number;
      avgPrice: number;
      rows?: undefined;
      onViewAll?: () => void;
    }
  | {
      // Future-ready: list layout with green dividers
      rows: DispensaryRow[];
      name?: undefined;
      deals?: undefined;
      maxOff?: undefined;
      avgPrice?: undefined;
      onViewAll?: () => void;
    };

export default function TopDispensariesCard(props: Props) {
  const router = useRouter();

  return (
    <View style={styles.card}>
      <Text style={styles.label}>Top Dispensaries Today</Text>

      {"rows" in props && props.rows && props.rows.length > 0 ? (
        <>
          {props.rows.map((r, i) => (
            <React.Fragment key={r.id}>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push(`/dispensary/${encodeURIComponent(r.name)}`)}
                style={styles.row}
                hitSlop={8}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowName} numberOfLines={1}>
                    {r.name}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {r.deals} deals - max {r.maxOff}% off - Avg ${r.avgPrice.toFixed(2)}
                  </Text>
                </View>
              </Pressable>
              {i !== props.rows.length - 1 && <View style={styles.greenDivider} />}
            </React.Fragment>
          ))}

          <Pressable
            accessibilityRole="button"
            onPress={() => (props as any).onViewAll ? (props as any).onViewAll() : router.push("/deals")}
            hitSlop={8}
            style={{ marginTop: 12 }}
          >
            <Text style={styles.cta}>View all deals ></Text>
          </Pressable>
        </>
      ) : (
        // Single featured dispensary layout (unchanged visually)
        <>
          <Text style={styles.title}>{(props as any).name}</Text>
          <Text style={styles.meta}>
            {(props as any).deals} deals - max {(props as any).maxOff}% off - Avg ${
              (props as any).avgPrice.toFixed(2)
            }
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => (props as any).onViewAll ? (props as any).onViewAll() : router.push("/deals")}
            hitSlop={8}
          >
            <Text style={styles.cta}>View all deals ></Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.mint,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  label: {
    color: COLORS.ink,
    fontSize: 22,
    fontWeight: "800",
    marginBottom: 6,
  },
  title: {
    color: COLORS.ink,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: "900",
    marginBottom: 10,
  },
  meta: {
    color: COLORS.text,
    fontSize: 18,
    marginBottom: 14,
  },
  row: {
    paddingVertical: 12,
  },
  rowName: {
    color: COLORS.ink,
    fontSize: 22,
    fontWeight: "900",
  },
  rowMeta: {
    color: COLORS.text,
    fontSize: 16,
    marginTop: 2,
  },
  greenDivider: {
    height: 2,
    backgroundColor: "rgba(20, 90, 50, 0.28)", // subtle green line
    marginVertical: 4,
  },
  cta: {
    color: COLORS.green,
    fontSize: 22,
    fontWeight: "900",
  },
});
