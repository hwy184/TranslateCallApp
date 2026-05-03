import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { ApiClient } from "../api/client";
import { friendlyErrorMessage } from "../api/errors";
import { SectionCard } from "../components/SectionCard";
import { t } from "../i18n";
import type { RootStackParamList } from "../navigation/types";
import { useSessionStore } from "../store/session-store";
import { palette } from "../theme";
import { generateIdentity } from "../utils/identity";

type Props = NativeStackScreenProps<RootStackParamList, "Lobby">;

export function RoomLobbyScreen({ navigation }: Props) {
  const user = useSessionStore((s) => s.user);
  const authSession = useSessionStore((s) => s.authSession);
  const apiBaseUrl = useSessionStore((s) => s.apiBaseUrl);
  const setRoomFromCreate = useSessionStore((s) => s.setRoomFromCreate);
  const setRoomFromJoin = useSessionStore((s) => s.setRoomFromJoin);
  const clearAuth = useSessionStore((s) => s.clearAuth);
  const lastSessionId = useSessionStore((s) => s.lastSessionId);
  const appLanguage = useSessionStore((s) => s.appLanguage);
  const setAppLanguage = useSessionStore((s) => s.setAppLanguage);

  const api = useMemo(
    () => new ApiClient(apiBaseUrl, () => authSession?.accessToken ?? null),
    [apiBaseUrl, authSession?.accessToken]
  );

  const [hostDisplayName, setHostDisplayName] = useState("Host Android");
  const [guestDisplayName, setGuestDisplayName] = useState("Guest Android");
  const [roomCodeInput, setRoomCodeInput] = useState("");
  const [hostSourceLanguage, setHostSourceLanguage] = useState<"vi" | "en">("vi");
  const [hostTargetLanguage, setHostTargetLanguage] = useState<"vi" | "en">("en");
  const [guestSourceLanguage, setGuestSourceLanguage] = useState<"vi" | "en">("en");
  const [guestTargetLanguage, setGuestTargetLanguage] = useState<"vi" | "en">("vi");
  const [loading, setLoading] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      navigation.replace("Auth");
    }
  }, [navigation, user]);

  if (!user) return null;

  const onCreate = async () => {
    setError(null);
    setInfo(null);
    setLoading("create");
    const hostIdentity = generateIdentity("host");

    try {
      const result = await api.createRoom({
        hostUserId: user.userId,
        hostIdentity,
        hostDisplayName: hostDisplayName.trim() || "Host Android",
        sourceLanguage: hostSourceLanguage,
        targetLanguage: hostTargetLanguage,
        voiceProfile: "host-default"
      });

      setRoomFromCreate({
        role: "host",
        displayName: hostDisplayName.trim() || "Host Android",
        payload: result
      });
      const roomCode = result.room_short_code ?? result.room.roomId;
      setInfo(`Room created. Code: ${roomCode}`);
      await Clipboard.setStringAsync(roomCode);
      navigation.navigate("Call");
    } catch (e) {
      setError(friendlyErrorMessage(e));
    } finally {
      setLoading(null);
    }
  };

  const onJoin = async () => {
    setError(null);
    setInfo(null);
    setLoading("join");
    const guestIdentity = generateIdentity("guest");

    try {
      const resolved = await api.resolveRoomByCode(roomCodeInput.trim());
      const result = await api.joinRoom({
        roomId: resolved.room.roomId,
        guestUserId: user.userId,
        guestIdentity,
        guestDisplayName: guestDisplayName.trim() || "Guest Android",
        sourceLanguage: guestSourceLanguage,
        targetLanguage: guestTargetLanguage,
        voiceProfile: "guest-default"
      });

      setRoomFromJoin({
        role: "guest",
        displayName: guestDisplayName.trim() || "Guest Android",
        payload: result
      });
      navigation.navigate("Call");
    } catch (e) {
      setError(friendlyErrorMessage(e));
    } finally {
      setLoading(null);
    }
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      <View style={styles.headerCard}>
        <Text style={styles.headerTitle}>{t(appLanguage, "lobby_title")}</Text>
        <Text style={styles.text}>
          {user.displayName} ({user.type})
        </Text>
        {!!lastSessionId && <Text style={styles.muted}>Last session: {lastSessionId}</Text>}
        <View style={styles.row}>
          <Pressable style={styles.ghostBtn} onPress={() => navigation.navigate("History")}>
            <Text style={styles.ghostText}>{t(appLanguage, "history_title")}</Text>
          </Pressable>
          <Pressable style={styles.ghostBtn} onPress={() => navigation.navigate("VoiceSettings")}>
            <Text style={styles.ghostText}>Voice Settings</Text>
          </Pressable>
          <Pressable style={styles.ghostBtn} onPress={() => setAppLanguage(appLanguage === "vi" ? "en" : "vi")}>
            <Text style={styles.ghostText}>
              {t(appLanguage, "app_language")}: {appLanguage.toUpperCase()}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.ghostBtn, { borderColor: palette.danger }]}
            onPress={() => {
              clearAuth();
              navigation.replace("Auth");
            }}
          >
            <Text style={[styles.ghostText, { color: palette.danger }]}>Logout</Text>
          </Pressable>
        </View>
      </View>

      <SectionCard title="Host Flow (Create Room)">
        <TextInput
          style={styles.input}
          value={hostDisplayName}
          onChangeText={setHostDisplayName}
          placeholder="Host display name"
          placeholderTextColor={palette.muted}
        />
        <View style={styles.row}>
          <Pressable style={styles.langBtn} onPress={() => setHostSourceLanguage(hostSourceLanguage === "vi" ? "en" : "vi")}>
            <Text style={styles.ghostText}>Source: {hostSourceLanguage.toUpperCase()}</Text>
          </Pressable>
          <Pressable style={styles.langBtn} onPress={() => setHostTargetLanguage(hostTargetLanguage === "vi" ? "en" : "vi")}>
            <Text style={styles.ghostText}>Target: {hostTargetLanguage.toUpperCase()}</Text>
          </Pressable>
        </View>
        <Pressable style={styles.primaryBtn} onPress={onCreate} disabled={loading !== null || hostSourceLanguage === hostTargetLanguage}>
          {loading === "create" ? (
            <ActivityIndicator color="#041C14" />
          ) : (
            <Text style={styles.primaryText}>{t(appLanguage, "create_room")}</Text>
          )}
        </Pressable>
      </SectionCard>

      <SectionCard title="Guest Flow (Join Room)">
        <TextInput
          style={styles.input}
          value={guestDisplayName}
          onChangeText={setGuestDisplayName}
          placeholder="Guest display name"
          placeholderTextColor={palette.muted}
        />
        <TextInput
          style={styles.input}
          value={roomCodeInput}
          onChangeText={(value) => setRoomCodeInput(value.replace(/\D/g, "").slice(0, 6))}
          autoCapitalize="none"
          keyboardType="number-pad"
          placeholder="6-digit room code"
          placeholderTextColor={palette.muted}
        />
        <View style={styles.row}>
          <Pressable style={styles.langBtn} onPress={() => setGuestSourceLanguage(guestSourceLanguage === "vi" ? "en" : "vi")}>
            <Text style={styles.ghostText}>Source: {guestSourceLanguage.toUpperCase()}</Text>
          </Pressable>
          <Pressable style={styles.langBtn} onPress={() => setGuestTargetLanguage(guestTargetLanguage === "vi" ? "en" : "vi")}>
            <Text style={styles.ghostText}>Target: {guestTargetLanguage.toUpperCase()}</Text>
          </Pressable>
        </View>
        <Pressable
          style={styles.secondaryBtn}
          onPress={onJoin}
          disabled={loading !== null || roomCodeInput.trim().length !== 6 || guestSourceLanguage === guestTargetLanguage}
        >
          {loading === "join" ? (
            <ActivityIndicator color="#061A22" />
          ) : (
            <Text style={styles.secondaryText}>{t(appLanguage, "join_guest")}</Text>
          )}
        </Pressable>
      </SectionCard>

      {!!info && <Text style={styles.info}>{info} (copied to clipboard)</Text>}
      {!!error && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#1E3A57"
  },
  container: {
    padding: 16,
    gap: 12
  },
  headerCard: {
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
    padding: 14,
    gap: 6
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 20,
    fontWeight: "800"
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8
  },
  text: {
    color: palette.text,
    fontWeight: "700"
  },
  muted: {
    color: palette.muted
  },
  input: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 10,
    backgroundColor: palette.surface,
    color: palette.text,
    paddingVertical: 10,
    paddingHorizontal: 12
  },
  langBtn: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 9,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "rgba(255,255,255,0.04)"
  },
  primaryBtn: {
    backgroundColor: palette.accent,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center"
  },
  secondaryBtn: {
    backgroundColor: palette.info,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center"
  },
  primaryText: {
    color: "#082118",
    fontWeight: "800"
  },
  secondaryText: {
    color: "#062029",
    fontWeight: "800"
  },
  ghostBtn: {
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: 9,
    paddingVertical: 8,
    paddingHorizontal: 12
  },
  ghostText: {
    color: palette.text,
    fontWeight: "600"
  },
  info: {
    color: palette.accent
  },
  error: {
    color: palette.danger
  }
});
