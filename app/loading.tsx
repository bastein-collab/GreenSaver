// app/loading.tsx
import { useRouter } from "expo-router";
import React, { useEffect } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import logo from "../assets/images/greensaver_logo.png";
import COLORS from "../constants/colors";

export default function LoadingScreen() {
  const router = useRouter();

  useEffect(() => {
    // short delay to show "Loading your savings..."
    const timer = setTimeout(() => router.replace("/deals/savers"), 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <Image source={logo} style={styles.logo} resizeMode="contain" />
      <Text style={styles.text}>Loading your savings...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.greenDark,
    justifyContent: "center",
    alignItems: "center",
  },
  logo: {
    width: 150,
    height: 150,
    marginBottom: 20,
  },
  text: {
    color: "white",
    fontSize: 18,
    fontWeight: "600",
  },
});
