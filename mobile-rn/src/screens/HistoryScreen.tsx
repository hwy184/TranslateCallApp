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
import { t } from "../i18n";
import { useSessionStore } from "../store/session-store";
import {
  getConversationMetaBySession,
  getTranscriptBySession,
  renameConversationLocal,
  type LocalTranscriptItem
} from "../storage/transcript-storage";
import { palette } from "../theme";
import type { HistoryItem } from "../types/api";

type TabKey = "local" | "cloud";

export function HistoryScreen() {
  const apiBaseUrl = useSessionStore((s) => s.apiBaseUrl);
  const user = useSessionStore((s) => s.user);
  const authSession = useSessionStore((s) => s.authSession);
  const lastSessionId = useSessionStore((s) => s.lastSessionId);
  const appLanguage = useSessionStore((s) => s.appLanguage);

  const api = useMemo(
    () => new ApiClient(apiBaseUrl, () => authSession?.accessToken ?? null),
    [apiBaseUrl, authSession?.accessToken]
  );

  const [sessionId, setSessionId] = useState(lastSessionId ?? "");
  const [activeTab, setActiveTab] = useState<TabKey>("local");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncInfo, setSyncInfo] = useState<string | null>(null);
  const [renameInput, setRenameInput] = useState("");
  const [localItems, setLocalItems] = useState<LocalTranscriptItem[]>([]);
  const [cloudItems, setCloudItems] = useState<HistoryItem[]>([]);
  const [conversationTitle, setConversationTitle] = useState<string>("");

  const load = async () => {
    setError(null);
    setSyncInfo(null);
    setLoading(true);
    try {
      const localDisplay = await getTranscriptBySession(sessionId.trim(), user?.type === "guest" ? 10 : undefined);
      setLocalItems(localDisplay);

      const meta = await getConversationMetaBySession(sessionId.trim());
      setConversationTitle(meta.title);
      setRenameInput(meta.title);

      if (user?.type === "registered") {
        const cloud = await api.historyBySession(sessionId.trim());
        setCloudItems(cloud.items);

        const cloudNewest = cloud.items
          .filter((item) => item.conversation_id === meta.conversation_id)
          .sort((a, b) => b.title_updated_at.localeCompare(a.title_updated_at))[0];
        if (cloudNewest && cloudNewest.title_updated_at > meta.title_updated_at) {
          const updatedMeta = await renameConversationLocal(sessionId.trim(), cloudNewest.title);
          setConversationTitle(updatedMeta.title);
          setRenameInput(updatedMeta.title);
        }
      } else {
        setCloudItems([]);
      }
    } catch (e) {
      setError(friendlyErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  const renameConversation = async () => {
    if (!sessionId.trim() || !renameInput.trim()) return;
    setError(null);
    setSyncInfo(null);
    setRenaming(true);
    try {
      const localMeta = await renameConversationLocal(sessionId.trim(), renameInput.trim());
      setConversationTitle(localMeta.title);
      const local = await getTranscriptBySession(sessionId.trim(), user?.type === "guest" ? 10 : undefined);
      setLocalItems(local);

      if (user?.type === "registered") {
        const renamed = await api.renameConversationTitle({
          conversationId: localMeta.conversation_id,
          title: localMeta.title,
          titleUpdatedAt: localMeta.title_updated_at
        });
        await renameConversationLocal(sessionId.trim(), renamed.conversation.title);
        setConversationTitle(renamed.conversation.title);
        setRenameInput(renamed.conversation.title);
      }

      setSyncInfo("Rename conversation applied.");
    } catch (e) {
      setError(friendlyErrorMessage(e));
    } finally {
      setRenaming(false);
    }
  };

  const syncCloud = async () => {
    if (user?.type !== "registered") {
      setError("Guest mode khong sync cloud duoc.");
      return;
    }
    setError(null);
    setSyncInfo(null);
    setSyncing(true);
    try {
      const meta = await getConversationMetaBySession(sessionId.trim());
      const payload = localItems
        .filter((item) => item.utterance_id && item.speaker_identity && item.source_lang && item.target_lang)
        .map((item) => ({
          room_id: item.room_id,
          session_id: item.session_id,
          conversation_id: item.conversation_id || meta.conversation_id,
          title: item.title || meta.title,
          title_updated_at: item.title_updated_at || meta.title_updated_at,
          utterance_id: item.utterance_id as string,
          speaker_identity: item.speaker_identity as string,
          source_lang: item.source_lang as "vi" | "en",
          target_lang: item.target_lang as "vi" | "en",
          source_text: item.text ?? null,
          translated_text: item.translated_text ?? null,
          event_type: item.type,
          created_at: item.timestamp
        }));

      if (payload.length === 0) {
        setSyncInfo("Khong co item hop le de sync.");
        return;
      }

      const result = await api.historySync({ items: payload });
      const cloud = await api.historyBySession(sessionId.trim());
      setCloudItems(cloud.items);
      setActiveTab("cloud");

      const cloudNewest = cloud.items
        .filter((item) => item.conversation_id === meta.conversation_id)
        .sort((a, b) => b.title_updated_at.localeCompare(a.title_updated_at))[0];
      if (cloudNewest && cloudNewest.title_updated_at > meta.title_updated_at) {
        const updatedMeta = await renameConversationLocal(sessionId.trim(), cloudNewest.title);
        setConversationTitle(updatedMeta.title);
        setRenameInput(updatedMeta.title);
      }

      setSyncInfo(`Da sync ${result.synced}/${result.received} item len cloud. Local van duoc giu nguyen.`);
    } catch (e) {
      setError(friendlyErrorMessage(e));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <SectionCard title="History Query">
        <TextInput
          style={styles.input}
          value={sessionId}
          onChangeText={setSessionId}
          placeholder="session_xxx"
          placeholderTextColor={palette.muted}
          autoCapitalize="none"
        />
        <View style={styles.rowButtons}>
          <Pressable
            style={styles.button}
            onPress={load}
            disabled={loading || sessionId.trim().length === 0}
          >
            {loading ? (
              <ActivityIndicator color="#04231A" />
            ) : (
              <Text style={styles.buttonText}>Load</Text>
            )}
          </Pressable>
          <Pressable
            style={styles.syncBtn}
            onPress={syncCloud}
            disabled={syncing || loading || sessionId.trim().length === 0 || user?.type !== "registered"}
          >
            {syncing ? (
              <ActivityIndicator color="#062029" />
            ) : (
              <Text style={styles.syncText}>{t(appLanguage, "sync_cloud")}</Text>
            )}
          </Pressable>
        </View>
      </SectionCard>

      <SectionCard title="Conversation Title">
        <Text style={styles.titleValue}>{conversationTitle || "-"}</Text>
        <TextInput
          style={styles.input}
          value={renameInput}
          onChangeText={setRenameInput}
          placeholder="New conversation title"
          placeholderTextColor={palette.muted}
        />
        <Pressable
          style={styles.button}
          onPress={renameConversation}
          disabled={renaming || !sessionId.trim() || !renameInput.trim()}
        >
          {renaming ? <ActivityIndicator color="#04231A" /> : <Text style={styles.buttonText}>{t(appLanguage, "rename")}</Text>}
        </Pressable>
      </SectionCard>

      <View style={styles.tabsRow}>
        <Pressable
          style={[styles.tabBtn, activeTab === "local" && styles.tabBtnActive]}
          onPress={() => setActiveTab("local")}
        >
          <Text style={[styles.tabText, activeTab === "local" && styles.tabTextActive]}>
            {t(appLanguage, "local_tab")} ({localItems.length})
          </Text>
        </Pressable>
        <Pressable
          style={[styles.tabBtn, activeTab === "cloud" && styles.tabBtnActive]}
          onPress={() => setActiveTab("cloud")}
        >
          <Text style={[styles.tabText, activeTab === "cloud" && styles.tabTextActive]}>
            {t(appLanguage, "cloud_tab")} ({cloudItems.length})
          </Text>
        </Pressable>
      </View>

      {!!syncInfo && <Text style={styles.syncInfo}>{syncInfo}</Text>}
      {!!error && <Text style={styles.error}>{error}</Text>}

      {activeTab === "local" ? (
        <SectionCard title="Local Transcript">
          {localItems.length === 0 ? (
            <Text style={styles.muted}>No local items.</Text>
          ) : (
            localItems.map((item) => (
              <View key={item.id} style={styles.row}>
                <Text style={styles.type}>{item.type}</Text>
                <Text style={styles.metaTitle}>{item.title}</Text>
                {!!item.text && <Text style={styles.source}>{item.text}</Text>}
                {!!item.translated_text && (
                  <Text style={styles.translated}>{item.translated_text}</Text>
                )}
                <Text style={styles.meta}>
                  {item.speaker_identity ?? "system"} {item.source_lang ?? ""}
                  {"->"}
                  {item.target_lang ?? ""} {item.timestamp}
                </Text>
              </View>
            ))
          )}
        </SectionCard>
      ) : (
        <SectionCard title="Cloud Transcript">
          {user?.type !== "registered" ? (
            <Text style={styles.muted}>Cloud history chi danh cho registered user.</Text>
          ) : cloudItems.length === 0 ? (
            <Text style={styles.muted}>No cloud items.</Text>
          ) : (
            cloudItems.map((item) => (
              <View key={item.id} style={styles.row}>
                <Text style={styles.type}>{item.event_type}</Text>
                <Text style={styles.metaTitle}>{item.title}</Text>
                {!!item.source_text && <Text style={styles.source}>{item.source_text}</Text>}
                {!!item.translated_text && (
                  <Text style={styles.translated}>{item.translated_text}</Text>
                )}
                <Text style={styles.meta}>
                  {item.speaker_identity} {item.source_lang}
                  {"->"}
                  {item.target_lang} {item.created_at}
                </Text>
              </View>
            ))
          )}
        </SectionCard>
      )}
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
  titleValue: {
    color: palette.text,
    fontWeight: "700"
  },
  rowButtons: {
    flexDirection: "row",
    gap: 8
  },
  button: {
    flex: 1,
    backgroundColor: palette.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center"
  },
  buttonText: {
    color: "#052118",
    fontWeight: "800"
  },
  syncBtn: {
    flex: 1,
    backgroundColor: palette.info,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center"
  },
  syncText: {
    color: "#07242F",
    fontWeight: "800"
  },
  tabsRow: {
    flexDirection: "row",
    gap: 8
  },
  tabBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.03)"
  },
  tabBtnActive: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderColor: palette.accent
  },
  tabText: {
    color: palette.muted,
    fontWeight: "700"
  },
  tabTextActive: {
    color: palette.text
  },
  muted: {
    color: palette.muted
  },
  syncInfo: {
    color: palette.accent,
    fontWeight: "700"
  },
  error: {
    color: palette.danger
  },
  row: {
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    paddingBottom: 10,
    marginBottom: 10,
    gap: 3
  },
  type: {
    color: palette.text,
    fontWeight: "800",
    fontSize: 12
  },
  metaTitle: {
    color: palette.text,
    fontSize: 13,
    fontWeight: "700"
  },
  source: {
    color: palette.info,
    fontSize: 13,
    lineHeight: 18
  },
  translated: {
    color: palette.accent,
    fontWeight: "700",
    fontSize: 14,
    lineHeight: 20
  },
  meta: {
    color: palette.muted,
    fontSize: 11
  }
});
