import { Audio } from "expo-av";
import * as Clipboard from "expo-clipboard";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  ListRenderItem,
  Pressable,
  StyleSheet,
  Text,
  View
} from "react-native";
import { AudioSession } from "@livekit/react-native";
import { Room, RoomEvent, Track } from "livekit-client";
import { ApiClient } from "../api/client";
import { friendlyErrorMessage } from "../api/errors";
import { parseDataChannelEvent, toTimelineEvent } from "../contracts/events";
import type { TimelineEvent } from "../contracts/events";
import type { RootStackParamList } from "../navigation/types";
import { useSessionStore } from "../store/session-store";
import { appendTranscriptEvent } from "../storage/transcript-storage";
import { palette } from "../theme";
import { t } from "../i18n";

type Props = NativeStackScreenProps<RootStackParamList, "Call">;

export function CallScreen({ navigation }: Props) {
  const apiBaseUrl = useSessionStore((s) => s.apiBaseUrl);
  const livekitUrl = useSessionStore((s) => s.livekitUrl);
  const roomContext = useSessionStore((s) => s.roomContext);
  const authSession = useSessionStore((s) => s.authSession);
  const appLanguage = useSessionStore((s) => s.appLanguage);
  const clearRoom = useSessionStore((s) => s.clearRoom);
  const api = useMemo(
    () => new ApiClient(apiBaseUrl, () => authSession?.accessToken ?? null),
    [apiBaseUrl, authSession?.accessToken]
  );

  const roomRef = useRef<Room | null>(null);
  const handlersRef = useRef<{
    onConnectionStateChanged?: (next: unknown) => void;
    onDataReceived?: (
      payload: Uint8Array,
      participant: unknown,
      kind: unknown,
      topic?: string
    ) => void;
    onTrackSubscribed?: (track: unknown, publication: unknown) => void;
    onTrackPublished?: (publication: unknown) => void;
  }>({});
  const [status, setStatus] = useState("Idle");
  const [connection, setConnection] = useState("disconnected");
  const [micOn, setMicOn] = useState(false);
  const [busy, setBusy] = useState<"connect" | "leave" | null>("connect");
  const [error, setError] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);

  const decodePayload = useCallback((payload: Uint8Array): string => {
    if (typeof TextDecoder !== "undefined") {
      return new TextDecoder().decode(payload);
    }

    // Fallback without spreading the whole array in one call.
    let output = "";
    const chunkSize = 4096;
    for (let i = 0; i < payload.length; i += chunkSize) {
      const chunk = payload.subarray(i, i + chunkSize);
      output += String.fromCharCode(...Array.from(chunk));
    }
    return output;
  }, []);

  const renderTimelineItem = useCallback<ListRenderItem<TimelineEvent>>(
    ({ item }) => (
      <View style={styles.itemRow}>
        <View style={[styles.itemDot, { backgroundColor: eventColor(item.type) }]} />
        <View style={styles.itemContent}>
          <View style={styles.itemHeaderRow}>
            <Text style={styles.itemType}>{item.type}</Text>
            <Text style={styles.itemSpeaker}>{item.speakerIdentity ?? "system"}</Text>
          </View>
          {!!item.text && <Text style={styles.itemSource}>{item.text}</Text>}
          {!!item.translatedText && (
            <Text style={styles.itemTranslated}>{item.translatedText}</Text>
          )}
          <Text style={styles.itemMeta}>
            {item.sourceLang ?? ""}
            {"->"}
            {item.targetLang ?? ""} | {item.timestamp}
          </Text>
        </View>
      </View>
    ),
    []
  );

  const timelineKeyExtractor = useCallback((item: TimelineEvent) => item.id, []);

  useEffect(() => {
    if (!roomContext) {
      navigation.replace("Lobby");
      return;
    }

    let canceled = false;

    const connect = async () => {
      setError(null);

      if (!roomContext.livekitToken) {
        setError(`LiveKit token missing: ${roomContext.livekitTokenStatus}`);
        setBusy(null);
        return;
      }
      if (!livekitUrl) {
        setError("LiveKit URL is empty. Set it in Auth screen.");
        setBusy(null);
        return;
      }

      try {
        setStatus("Requesting microphone permission...");
        const permission = await Audio.requestPermissionsAsync();
        if (!permission.granted) {
          throw new Error("Microphone permission denied");
        }

        await AudioSession.startAudioSession();
        const room = new Room();
        roomRef.current = room;

        const onConnectionStateChanged = (next: unknown) => {
          setConnection(String(next));
        };

        const onDataReceived = async (
          payload: Uint8Array,
          _participant: unknown,
          _kind: unknown,
          topic?: string
        ) => {
          if (topic && topic !== "translation.events") return;
          const text = decodePayload(payload);
          const parsed = parseDataChannelEvent(text);
          if (!parsed) return;

          const timelineItem = toTimelineEvent(parsed);
          setTimeline((current) => [timelineItem, ...current].slice(0, 250));
          await appendTranscriptEvent(parsed);
        };

        const onTrackSubscribed = (_track: unknown, publication: any) => {
          const trackName =
            (publication as { trackName?: string }).trackName ??
            (publication as { name?: string }).name ??
            "";

          if (
            trackName.startsWith("translated_to_") &&
            trackName !== `translated_to_${roomContext.participantIdentity}`
          ) {
            if (typeof publication.setSubscribed === "function") {
              publication.setSubscribed(false);
            }
          }
        };

        const onTrackPublished = (publication: any) => {
          const trackName =
            (publication as { trackName?: string }).trackName ??
            (publication as { name?: string }).name ??
            "";
          if (
            publication.kind === Track.Kind.Audio &&
            trackName.startsWith("translated_to_") &&
            trackName !== `translated_to_${roomContext.participantIdentity}`
          ) {
            if (typeof publication.setSubscribed === "function") {
              publication.setSubscribed(false);
            }
          }
        };

        room.on(RoomEvent.ConnectionStateChanged, onConnectionStateChanged);
        room.on(RoomEvent.DataReceived, onDataReceived);
        room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
        room.on(RoomEvent.TrackPublished, onTrackPublished);
        handlersRef.current = {
          onConnectionStateChanged,
          onDataReceived,
          onTrackSubscribed,
          onTrackPublished
        };

        setStatus("Connecting LiveKit...");
        await room.connect(livekitUrl, roomContext.livekitToken);
        if (canceled) return;
        setMicOn(false);
        setStatus("Connected (mic off)");
      } catch (e) {
        setError(friendlyErrorMessage(e));
        setStatus("Connection failed");
      } finally {
        if (!canceled) {
          setBusy(null);
        }
      }
    };

    void connect();

    return () => {
      canceled = true;
      const room = roomRef.current;
      roomRef.current = null;
      if (room) {
        if (handlersRef.current.onConnectionStateChanged) {
          (room as any).off(
            RoomEvent.ConnectionStateChanged,
            handlersRef.current.onConnectionStateChanged
          );
        }
        if (handlersRef.current.onDataReceived) {
          (room as any).off(RoomEvent.DataReceived, handlersRef.current.onDataReceived);
        }
        if (handlersRef.current.onTrackSubscribed) {
          (room as any).off(RoomEvent.TrackSubscribed, handlersRef.current.onTrackSubscribed);
        }
        if (handlersRef.current.onTrackPublished) {
          (room as any).off(RoomEvent.TrackPublished, handlersRef.current.onTrackPublished);
        }
        void room.disconnect();
      }
      handlersRef.current = {};
      void AudioSession.stopAudioSession();
    };
  }, [decodePayload, livekitUrl, navigation, roomContext]);

  const toggleMic = async () => {
    const room = roomRef.current;
    if (!room) return;
    const next = !micOn;
    await room.localParticipant.setMicrophoneEnabled(next);
    setMicOn(next);
  };

  const copyRoomCode = async () => {
    if (!roomContext) return;
    await Clipboard.setStringAsync(roomContext.roomId);
    setStatus("Room ID copied");
  };

  const leave = async () => {
    if (!roomContext) return;
    setBusy("leave");
    setError(null);
    try {
      if (roomContext.role === "host") {
        await api.endRoom(roomContext.roomId);
      }
    } catch (e) {
      setError(friendlyErrorMessage(e));
    } finally {
      try {
        await roomRef.current?.disconnect();
      } catch {
        // ignore
      }
      roomRef.current = null;
      clearRoom();
      setBusy(null);
      navigation.replace("Lobby");
    }
  };

  if (!roomContext) {
    return null;
  }

  return (
    <FlatList
      data={timeline}
      keyExtractor={timelineKeyExtractor}
      renderItem={renderTimelineItem}
      contentContainerStyle={styles.container}
      ListHeaderComponent={
        <View style={styles.headerBlock}>
          <View style={styles.titleCard}>
            <Text style={styles.title}>{t(appLanguage, "call_title")}</Text>
            <Text style={styles.metaLine}>Room: {roomContext.roomId}</Text>
            <Text style={styles.metaLine}>Session: {roomContext.sessionId}</Text>
            <Text style={styles.metaLine}>
              Role: {roomContext.role} | Identity: {roomContext.participantIdentity}
            </Text>
          </View>
          <View style={styles.statusCard}>
            <Text style={styles.statusLabel}>Connection</Text>
            <Text style={styles.meta}>
              Status: {status} ({connection})
            </Text>
          </View>

          <View style={styles.controls}>
            <Pressable style={styles.copyBtn} onPress={copyRoomCode}>
              <Text style={styles.copyText}>Copy Room ID</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={toggleMic} disabled={busy !== null}>
              <Text style={styles.secondaryText}>{micOn ? "Mute Mic" : "Unmute Mic"}</Text>
            </Pressable>
            <Pressable style={styles.dangerBtn} onPress={leave} disabled={busy !== null}>
              {busy === "leave" ? (
                <ActivityIndicator color="#2B0303" />
              ) : (
                <Text style={styles.dangerText}>{roomContext.role === "host" ? "End Room" : "Leave Room"}</Text>
              )}
            </Pressable>
          </View>

          {!!busy && busy === "connect" && (
            <View style={styles.busy}>
              <ActivityIndicator color={palette.info} />
              <Text style={styles.meta}>Connecting call...</Text>
            </View>
          )}

          {!!error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.timelineTitleRow}>
            <Text style={styles.subtitle}>Realtime Timeline (newest first)</Text>
          </View>
        </View>
      }
      ListEmptyComponent={<Text style={styles.empty}>Chua co event realtime.</Text>}
    />
  );
}

function eventColor(type: TimelineEvent["type"]) {
  if (type === "translation.final") return palette.accent;
  if (type === "subtitle.final") return palette.info;
  if (type === "warning") return palette.warning;
  if (type === "error") return palette.danger;
  return palette.muted;
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12
  },
  headerBlock: {
    gap: 12
  },
  titleCard: {
    backgroundColor: palette.card,
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 4
  },
  title: {
    color: palette.text,
    fontSize: 18,
    fontWeight: "800"
  },
  metaLine: {
    color: palette.muted,
    fontSize: 12
  },
  statusCard: {
    backgroundColor: "rgba(255,255,255,0.05)",
    borderColor: palette.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    gap: 2
  },
  statusLabel: {
    color: palette.text,
    fontWeight: "700",
    fontSize: 13
  },
  meta: {
    color: palette.info,
    fontSize: 13,
    fontWeight: "600"
  },
  copyBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  copyText: {
    color: palette.text,
    fontSize: 12,
    fontWeight: "700"
  },
  controls: {
    flexDirection: "row",
    gap: 8
  },
  secondaryBtn: {
    flex: 1,
    backgroundColor: palette.info,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center"
  },
  secondaryText: {
    color: "#07242F",
    fontWeight: "700"
  },
  dangerBtn: {
    flex: 1,
    backgroundColor: palette.danger,
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center"
  },
  dangerText: {
    color: "#2A0404",
    fontWeight: "700"
  },
  busy: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8
  },
  error: {
    color: palette.danger
  },
  timelineTitleRow: {
    marginTop: 4
  },
  subtitle: {
    color: palette.text,
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 8
  },
  empty: {
    color: palette.muted
  },
  itemRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 8
  },
  itemDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    marginTop: 6
  },
  itemContent: {
    flex: 1,
    backgroundColor: "rgba(255,255,255,0.03)",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingTop: 8,
    borderBottomWidth: 1,
    borderBottomColor: palette.border,
    paddingBottom: 8
  },
  itemHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center"
  },
  itemType: {
    color: palette.text,
    fontSize: 12,
    fontWeight: "700"
  },
  itemSpeaker: {
    color: palette.muted,
    fontSize: 11
  },
  itemSource: {
    color: palette.info,
    fontSize: 13,
    lineHeight: 18
  },
  itemTranslated: {
    color: palette.accent,
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 21
  },
  itemMeta: {
    color: palette.muted,
    fontSize: 11
  }
});
