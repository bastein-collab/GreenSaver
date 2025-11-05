// components/TopControls.tsx
import React from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import COLORS from "../constants/colors";

type Props = {
  zip: string;
  onZipChange: (z: string) => void;
  onUseLocation: () => void;
  onGo: () => void;
};

export default function TopControls({ zip, onZipChange, onUseLocation, onGo }: Props) {
  return (
    <View style={styles.row}>
      <Pressable onPress={onUseLocation} style={[styles.btn, styles.btnGreen]}>
        <Text style={[styles.btnText, styles.btnTextLight]}>Use my location</Text>
</Pressable>

      <TextInput
        value={zip}
        onChangeText={onZipChange}
        keyboardType="number-pad"
        maxLength={5}
        placeholder="ZIP"
        placeholderTextColor={COLORS.TEXT_SUBTLE}
        style={styles.zip}
      />

      <Pressable onPress={onGo} style={[styles.btn, styles.btnGreen]}>
        <Text style={[styles.btnText, styles.btnTextLight]}>Go</Text>
      </Pressable>
    </View>
  );
}

const RADIUS = 16;

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 18 },
  btn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: RADIUS },
  btnGreen: { backgroundColor: COLORS.GREEN },
  btnText: { fontSize: 15, fontWeight: "800" },
  btnTextLight: { color: COLORS.WHITE },
  zip: {
    height: 46,
    width: 110,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: RADIUS,
    paddingHorizontal: 14,
    fontWeight: "800",
    color: COLORS.TEXT_MID,
    backgroundColor: COLORS.WHITE,
  },
});
