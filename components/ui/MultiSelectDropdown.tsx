// components/ui/MultiSelectDropdown.tsx
import React, { useMemo, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import COLORS from "../../constants/colors";

type Option = { label: string; value: string };

interface Props {
  values: string[];
  options: Option[];
  onChange: (vals: string[]) => void;
  pillLabel?: string;
  align?: "left" | "center" | "right";
  style?: any;
}

export default function MultiSelectDropdown({ values, options, onChange, pillLabel, align = "center", style }: Props) {
  const [open, setOpen] = useState(false);
  const selectedLabels = useMemo(
    () => options.filter((o) => values.includes(o.value)).map((o) => o.label),
    [values, options]
  );
  const display = selectedLabels.length === 0 ? "All types" : selectedLabels.join(", ");

  function toggle(val: string) {
    const set = new Set(values);
    if (set.has(val)) set.delete(val);
    else set.add(val);
    onChange(Array.from(set));
  }

  return (
    <>
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpen(true)}
        style={[styles.pill, style, { width: "100%", alignSelf: "stretch" }]}
      >
        {pillLabel ? (
          <Text style={styles.pillHint} numberOfLines={1} ellipsizeMode="tail" allowFontScaling={false}>
            {pillLabel}
          </Text>
        ) : null}
        <Text style={styles.pillText} numberOfLines={1} ellipsizeMode="tail" allowFontScaling={false}>
          {display}
        </Text>
      </Pressable>

      <Modal transparent animationType="fade" visible={open} onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={styles.sheet}>
            {options.map((opt) => {
              const checked = values.includes(opt.value);
              return (
                <Pressable key={opt.value} style={styles.opt} onPress={() => toggle(opt.value)}>
                  <View style={[styles.checkbox, checked && styles.checkboxOn]} />
                  <Text style={styles.optText}>{opt.label}</Text>
                </Pressable>
              );
            })}
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
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.GREEN,
    backgroundColor: "transparent",
  },
  checkboxOn: {
    backgroundColor: COLORS.GREEN,
  },
  optText: {
    color: COLORS.ink,
    fontSize: 16,
    fontWeight: "700",
  },
});
