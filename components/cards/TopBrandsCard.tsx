// components/cards/TopBrandsCard.tsx
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import COLORS from "../../constants/colors";
import PercentBadge from "../ui/PercentBadge";

type BrandRow = { id: string; name: string; percentOff: number; deals: number };

type Props = { rows: BrandRow[] };

export default function TopBrandsCard({ rows }: Props) {
  const router = useRouter();

  return (
    <View style={styles.card}>
      <Text style={styles.heading}>Top Brands Today</Text>

      {rows.map((r, i) => (
        <React.Fragment key={r.id}>
          <Pressable
            onPress={() => router.push(`/brand/${encodeURIComponent(r.name)}`)}
            accessibilityRole="button"
            style={styles.row}
            hitSlop={6}
          >
            <Text style={styles.name} numberOfLines={1}>
              {r.name}
            </Text>

            <View style={styles.trailing}>
              <PercentBadge text={`${r.percentOff}% off`} />
              <Text style={styles.deals}>{r.deals} deals</Text>
            </View>
          </Pressable>
          {i !== rows.length - 1 && <View style={styles.divider} />}
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.peach,
    borderRadius: 22,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: COLORS.cardBorder,
  },
  heading: {
    color: COLORS.ink,
    fontSize: 22, // match Top Dispensaries Today label
    fontWeight: "900",
    paddingHorizontal: 20,
    marginBottom: 6,
  },
  row: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  divider: {
    // Darker and a little bolder
    height: 2,
    backgroundColor: COLORS.peachDark,
    marginHorizontal: 20, // inset to align with row content
  },
  name: {
    color: COLORS.ink,
    fontSize: 20,
    fontWeight: "900",
    flex: 1,
    paddingRight: 8,
  },
  trailing: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minWidth: 160, // keeps alignment but adapts to narrow screens
  },
  deals: {
    color: COLORS.text,
    fontSize: 16,
    width: 84,
    textAlign: "right",
  },
});
