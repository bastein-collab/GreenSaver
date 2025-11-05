// components/DealCard.tsx
import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import COLORS from "../constants/colors";

type Props = {
  product: string;
  brand: string;
  dispensary: string;
  percentOff: number;
  priceCents: number;
  onPress?: () => void;
};

export default function DealCard({
  product,
  brand,
  dispensary,
  percentOff,
  priceCents,
  onPress,
}: Props) {
  const price = (priceCents ?? 0) / 100;

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress}>
      <View style={styles.card}>
        <Text style={styles.title}>{product}</Text>
        <Text style={styles.meta}>
          {brand} · {dispensary}
        </Text>

        <View style={styles.row}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{percentOff}% off</Text>
          </View>
          <Text style={styles.price}>${price.toFixed(2)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.WHITE,
    borderWidth: 1,
    borderColor: "#EAEAEA",
    borderRadius: 14,
    padding: 14,
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.TEXT_DARK,
    marginBottom: 6,
  },
  meta: {
    color: COLORS.TEXT_SUBTLE,
    marginBottom: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  badge: {
    backgroundColor: COLORS.BADGE,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  badgeText: {
    color: COLORS.GREEN,
    fontWeight: "800",
  },
  price: {
    fontWeight: "700",
    color: COLORS.TEXT_MID,
  },
});

