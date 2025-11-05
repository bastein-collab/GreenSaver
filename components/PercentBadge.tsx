// components/PercentBadge.tsx
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export function PercentBadge({ pct }: { pct: number }) {
  const tier =
    pct >= 40 ? 'high' : pct >= 25 ? 'mid' : pct > 0 ? 'low' : 'none';
  if (tier === 'none') return null;

  return (
    <View style={[styles.badge, styles[tier]]}>
      <Text style={styles.text}>{Math.round(pct)}% off</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999 },
  text: { fontWeight: '700' },
  high: { backgroundColor: '#E6F7EA' },   // green-ish
  mid:  { backgroundColor: '#FFF4E0' },   // orange-ish
  low:  { backgroundColor: '#EFEFEF' }    // gray
});
