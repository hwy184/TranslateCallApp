import React, { PropsWithChildren } from "react";
import { StyleSheet, Text, View } from "react-native";
import { palette } from "../theme";

interface Props extends PropsWithChildren {
  title: string;
}

export function SectionCard({ title, children }: Props) {
  return (
    <View style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.card,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 14,
    padding: 14,
    gap: 10
  },
  title: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "700"
  }
});
