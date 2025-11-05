// components/ui/PercentBadge.tsx
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import COLORS from "../../constants/colors";

type Props = { text: string };

export default function PercentBadge({ text }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.txt}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: COLORS.badgeBg,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    alignSelf: "flex-end",
    minWidth: 96,
    alignItems: "center",
  },
  txt: {
    color: COLORS.badgeText,
    fontWeight: "800",
    fontSize: 18,
    letterSpacing: 0.2,
  },
});
