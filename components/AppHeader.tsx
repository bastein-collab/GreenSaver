// components/AppHeader.tsx
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import COLORS from "../constants/colors";

export default function AppHeader({ title = "Daily Saver Summary" }: { title?: string }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 4, marginBottom: 14, paddingHorizontal: 4 },
  title: {
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "900",
    color: COLORS.TEXT_MID,
  },
});
