// app/_layout.tsx
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform, StatusBar as RNStatusBar, View } from "react-native";
import COLORS from "../constants/colors";

export default function RootLayout() {
  const STATUS_H = Platform.OS === "android" ? (RNStatusBar.currentHeight ?? 0) : 0;
  return (
    <>
      {/* Fixed green strip behind the Android system tray (pinned, full width) */}
      {Platform.OS === "android" && (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: STATUS_H,
            backgroundColor: COLORS.green,
            zIndex: 1000,
          }}
        />
      )}
      {/* Solid dark status bar tray on Android, light content on iOS too */}
      <StatusBar style="light" backgroundColor={COLORS.green} translucent={false} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: "#FFFFFF",
          },
          animation: Platform.select({ ios: "default", android: "fade" }),
        }}
      />
    </>
  );
}
