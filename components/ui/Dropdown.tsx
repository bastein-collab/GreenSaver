// components/ui/Dropdown.tsx
import React, { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import COLORS from "../../constants/colors";

type Option<T extends string | number> = { label: string; value: T };

interface Props<T extends string | number> {
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  align?: "left" | "center" | "right";
  pillLabel?: string; // optional small label above value
  style?: any;
}

export default function Dropdown<T extends string | number>({
  value,
  options,
  onChange,
  align = "center",
  pillLabel,
  style,
}: Props<T>) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value) || options[0];

  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={[styles.pill, style, { width: "100%", alignSelf: "stretch" }]}
      >
        {pillLabel ? (
          <Text
            style={styles.pillHint}
            numberOfLines={1}
            ellipsizeMode="tail"
            allowFontScaling={false}
          >
            {pillLabel}
          </Text>
        ) : null}
        <Text
          style={styles.pillText}
          numberOfLines={1}
          ellipsizeMode="tail"
          allowFontScaling={false}
        >
          {current?.label}
        </Text>
      </Pressable>

      <Modal transparent animationType="fade" visible={open} onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            {options.map((opt) => (
              <Pressable
                key={String(opt.value)}
                onPress={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                style={styles.opt}
              >
                <Text style={[styles.optText, opt.value === value && styles.optTextActive]}>{opt.label}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    backgroundColor: COLORS.chip,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E5EAF0",
    paddingHorizontal: 12,
    paddingVertical: 4,
    height: 44,
    justifyContent: "center",
    alignItems: "flex-start",
  },
  pillHint: {
    fontSize: 10,
    lineHeight: 12,
    color: COLORS.text,
    opacity: 0.8,
  },
  pillText: {
    color: COLORS.ink,
    fontWeight: "800",
    fontSize: 14,
    lineHeight: 16,
    flexShrink: 1,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    justifyContent: "center",
    padding: 24,
  },
  sheet: {
    backgroundColor: COLORS.WHITE,
    borderRadius: 14,
    paddingVertical: 8,
  },
  opt: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5EAF0",
  },
  optText: {
    color: COLORS.ink,
    fontSize: 16,
    fontWeight: "700",
  },
  optTextActive: {
    color: COLORS.GREEN,
  },
});
