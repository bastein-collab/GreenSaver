// app/brand/[name].tsx
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import COLORS from "../../constants/colors";

export default function BrandScreen() {
  const { name } = useLocalSearchParams<{ name?: string }>();
  const router = useRouter();

  return (
    <View style={styles.container}>
      <Text style={styles.h1}>{decodeURIComponent(name || "Brand")}</Text>
      <Text style={styles.sub}>Brand page coming soon.</Text>

      <Pressable onPress={() => router.back()} style={styles.btn} accessibilityRole="button">
        <Text style={styles.btnTxt}>Back</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.WHITE, padding: 20 },
  h1: { fontSize: 28, fontWeight: "900", color: COLORS.TEXT_DARK, marginBottom: 6 },
  sub: { color: COLORS.TEXT_SUBTLE, marginBottom: 16 },
  btn: { backgroundColor: COLORS.GREEN, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, alignSelf: "flex-start" },
  btnTxt: { color: COLORS.WHITE, fontWeight: "800" },
});

