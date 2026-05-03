import React from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import type { TimelineEvent } from "../contracts/events";
import { palette } from "../theme";

interface Props {
  items: TimelineEvent[];
}

function eventColor(type: TimelineEvent["type"]) {
  if (type === "translation.final") return palette.accent;
  if (type === "subtitle.final") return palette.info;
  if (type === "warning") return palette.warning;
  if (type === "error") return palette.danger;
  return palette.muted;
}

export function EventTimeline({ items }: Props) {
  if (items.length === 0) {
    return <Text style={styles.empty}>Chua co event realtime.</Text>;
  }

  return (
    <FlatList
      data={items}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.list}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={[styles.dot, { backgroundColor: eventColor(item.type) }]} />
          <View style={styles.content}>
            <Text style={styles.type}>{item.type}</Text>
            {!!item.text && <Text style={styles.source}>{item.text}</Text>}
            {!!item.translatedText && (
              <Text style={styles.translated}>{item.translatedText}</Text>
            )}
            <Text style={styles.meta}>
              {item.speakerIdentity ?? "system"} {item.sourceLang ?? ""}
              {"->"}
              {item.targetLang ?? ""}{" "}
              {item.timestamp}
            </Text>
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 10,
    paddingBottom: 20
  },
  empty: {
    color: palette.muted
  },
  row: {
    flexDirection: "row",
    gap: 10
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    marginTop: 6
  },
  content: {
    flex: 1,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    paddingBottom: 8,
    gap: 2
  },
  type: {
    color: palette.text,
    fontSize: 12,
    fontWeight: "700"
  },
  source: {
    color: palette.info,
    fontSize: 13
  },
  translated: {
    color: palette.accent,
    fontSize: 14,
    fontWeight: "600"
  },
  meta: {
    color: palette.muted,
    fontSize: 11
  }
});
