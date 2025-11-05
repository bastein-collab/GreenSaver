// components/ui/AppHeader.tsx
import React from "react";
import { Image, Platform, StatusBar, StyleSheet, Text, View } from "react-native";
import COLORS from "../../constants/colors";

const STATUS_H = Platform.OS === "android" ? (StatusBar.currentHeight ?? 0) : 0;
const LOGO_H = 92;   // keep logo size consistent
const LOGO_W = 132;

export default function AppHeader() {
  return (
    <View style={styles.container}>
      {/* Logo pinned to top-right, enlarged, tight to tray */}
      <Image
        source={require("../../assets/images/greensaver_logo.png")}
        style={styles.logo}
        resizeMode="contain"
        accessible
        accessibilityLabel="GreenSaver"
      />
      {/* Single-line title below logo, left aligned */}
      <Text
        style={styles.title}
        numberOfLines={1}
        ellipsizeMode="tail"
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        Daily Saver Summary
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: STATUS_H + 6,
    // Pull title further left; keep right spacing for logo
    paddingLeft: 0,
    paddingRight: 16,
    paddingBottom: 8,
    backgroundColor: COLORS.WHITE,
  },
  logo: {
    position: "absolute",
    right: -8, // increased overhang per request
    top: STATUS_H + 2,
    width: LOGO_W,
    height: LOGO_H,
  },
  title: {
    // place title clearly below the logo bottom regardless of status height
    marginTop: LOGO_H + 8,
    color: COLORS.ink,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: "900",
    flexShrink: 1,
  },
});
