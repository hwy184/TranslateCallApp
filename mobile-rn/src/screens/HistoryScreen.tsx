import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import { ApiClient } from "../api/client";
import { friendlyErrorMessage } from "../api/errors";
import { SectionCard } from "../components/SectionCard";
import { useSessionStore } from "../store/session-store";
import {
  getTranscriptBySession,
  type LocalTranscriptItem
} from "../storage/transcript-storage";
import { palette } from "../theme";
import type { HistoryItem } from "../types/api";

export function HistoryScreen() {
  const apiBaseUrl = useSessionStore((s) => s.apiBaseUrl);
  const user = useSessionStore((s) => s.user);
  const authSession = useSessionStore((s) => s.authSession);
  const lastSessionId = useSessionStore((s) => s.lastSessionId);

  const api = useMemo(
    () => new ApiClient(apiBaseUrl, () => authSession?.accessToken ?? null),
    [apiBaseUrl, authSession?.accessToken]
  );

  const [sessionId, setSessionId] = useState(lastSessionId ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [localItems, setLocalItems] = useState<LocalTranscriptItem[]>([]);
  const [cloudItems, setCloudItems] = useState<HistoryItem[]>([]);

  const load = async () => {
    setError(null);
    setLoading(true);
    try {
      const local = await getTranscriptBySession(sessionId.trim());
      setLocalItems(local);

      if (user?.type === "registered") {
        const cloud = await api.historyBySession(sessionId.trim());
        setCloudItems(cloud.items);
      } else {
        setCloudItems([]);
      }
    } catch (e) {
      setError(friendlyErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <SectionCard title="Query Session">
        <TextInput
          style={styles.input}
          value={sessionId}
          onChangeText={setSessionId}
          placeholder="session_xxx"
          placeholderTextColor={palette.muted}
          autoCapitalize="none"
        />
        <Pressable
          style={styles.button}
          onPress={load}
          disabled={loading || sessionId.trim().length === 0}
        >
          {loading ? (
            <ActivityIndicator color="#04231A" />
          ) : (
            <Text style={styles.buttonText}>Load History</Text>
          )}
        </Pressable>
        <Text style={styles.muted}>
          Guest: local only. Registered: local + cloud.
        </Text>
      </SectionCard>

      {!!error && <Text style={styles.error}>{error}</Text>}

      <SectionCard title={`Local Transcript (${localItems.length})`}>
        {localItems.length === 0 ? (
          <Text style={styles.muted}>No local items.</Text>
        ) : (
          localItems.map((item) => (
            <View key={item.id} style={styles.row}>
              <Text style={styles.type}>{item.type}</Text>
              {!!item.text && <Text style={styles.source}>{item.text}</Text>}
              {!!item.translated_text && (
                <Text style={styles.translated}>{item.translated_text}</Text>
              )}
              <Text style={styles.meta}>
                {item.speaker_identity ?? "system"} {item.source_lang ?? ""}->{item.target_lang ?? ""}{" "}
                {item.timestamp}
              </Text>
            </View>
          ))
        )}
      </SectionCard>

      <SectionCard title={`Cloud Transcript (${cloudItems.length})`}>
        {user?.type !== "registered" ? (
          <Text style={styles.muted}>Cloud history chi danh cho registered user.</Text>
        ) : cloudItems.length === 0 ? (
          <Text style={styles.muted}>No cloud items.</Text>
        ) : (
          cloudItems.map((item) => (
            <View key={item.id} style={styles.row}>
              <Text style={styles.type}>{item.event_type}</Text>
              {!!item.source_text && <Text style={styles.source}>{item.source_text}</Text>}
              {!!item.translated_text && (
                <Text style={styles.translated}>{item.translated_text}</Text>
              )}
              <Text style={styles.meta}>
                {item.speaker_identity} {item.source_lang}->{item.target_lang} {item.created_at}
              </Text>
            </View>
          ))
        )}
      </SectionCard>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12
  },
  input: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    backgroundColor: palette.surface,
    color: palette.text,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  button: {
    backgroundColor: palette.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center"
  },
  buttonText: {
    color: "#052118",
    fontWeight: "800"
  },
  muted: {
    color: palette.muted
  },
  error: {
    color: palette.danger
  },
  row: {
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    paddingBottom: 8,
    marginBottom: 8
  },
  type: {
    color: palette.text,
    fontWeight: "700",
    fontSize: 12
  },
  source: {
    color: palette.info,
    fontSize: 13
  },
  translated: {
    color: palette.accent,
    fontWeight: "700"
  },
  meta: {
    color: palette.muted,
    fontSize: 11
  }
});
