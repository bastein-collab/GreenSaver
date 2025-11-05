// components/DealCard.tsx
import React from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import COLORS from "../constants/colors";

type Props = {
  dispensary: string;
  brand: string;
  product: string;
  percentOff: number;      // e.g., 25 for 25%
  priceCents: number;      // e.g., 5499 for $54.99
  onPress?: () => void;    // optional - tap to open details (future)
};

const toMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default function DealCard({
  dispensary,
  brand,
  product,
  percentOff,
  priceCents,
  onPress,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        pressed && { opacity: 0.96, transform: [{ scale: 0.997 }] },
      ]}
    >
      {/* Top row: product (bold) */}
      <Text style={styles.product} numberOfLines={1}>
        {product}
      </Text>

      {/* Second row: brand · dispensary */}
      <Text style={styles.sub} numberOfLines={1}>
        <Text style={styles.brand}>{brand}</Text>
        <Text style={styles.dot}> · </Text>
        <Text style={styles.dispensary}>{dispensary}</Text>
      </Text>

      {/* Bottom row: discount badge + price */}
      <View style={styles.bottomRow}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{percentOff}% off</Text>
        </View>
        <Text style={styles.price}>{toMoney(priceCents)}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.WHITE,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E8ECE9",
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 12,
    // light, natural shadow
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.06,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
      },
      android: { elevation: 1.5 },
    }),
  },

  product: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "800",
    color: COLORS.TEXT_DARK,
    marginBottom: 4,
  },

  sub: {
    fontSize: 14,
    lineHeight: 18,
    color: COLORS.TEXT_SUBTLE,
    marginBottom: 10,
  },
  brand: { fontWeight: "700", color: COLORS.TEXT_MID },
  dispensary: { color: COLORS.TEXT_SUBTLE },
  dot: { color: "#9AA6A0" },

  bottomRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },

  badge: {
    backgroundColor: COLORS.BADGE,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  badgeText: {
    color: COLORS.GREEN,
    fontWeight: "900",
    fontSize: 14,
  },

  price: {
    fontSize: 16,
    fontWeight: "800",
    color: COLORS.TEXT_MID,
  },
});
