import type { NativeStackScreenProps } from "@react-navigation/native-stack";
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
import { palette } from "../theme";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Auth">;

export function AuthScreen({ navigation }: Props) {
  const [guestName, setGuestName] = useState("Guest Mobile");
  const [username, setUsername] = useState("mobile_user");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<"guest" | "login" | null>(null);

  const apiBaseUrl = useSessionStore((s) => s.apiBaseUrl);
  const livekitUrl = useSessionStore((s) => s.livekitUrl);
  const setApiBaseUrl = useSessionStore((s) => s.setApiBaseUrl);
  const setLivekitUrl = useSessionStore((s) => s.setLivekitUrl);
  const setAuth = useSessionStore((s) => s.setAuth);

  const api = useMemo(() => new ApiClient(apiBaseUrl), [apiBaseUrl]);

  const runGuest = async () => {
    setError(null);
    setLoading("guest");
    try {
      const result = await api.authGuest(guestName.trim() || "Guest Mobile");
      setAuth(result);
      navigation.replace("Lobby");
    } catch (e) {
      setError(friendlyErrorMessage(e));
    } finally {
      setLoading(null);
    }
  };

  const runLogin = async () => {
    setError(null);
    setLoading("login");
    try {
      const result = await api.authLogin(username.trim() || "mobile_user");
      setAuth(result);
      navigation.replace("Lobby");
    } catch (e) {
      setError(friendlyErrorMessage(e));
    } finally {
      setLoading(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Voice Translation V1</Text>
      <Text style={styles.sub}>
        Mot app cho 2 may. Host tao room, Guest join room, AI worker dich realtime.
      </Text>

      <SectionCard title="Backend Endpoint">
        <TextInput
          style={styles.input}
          value={apiBaseUrl}
          onChangeText={setApiBaseUrl}
          autoCapitalize="none"
          placeholder="http://192.168.x.y:8080"
          placeholderTextColor={palette.muted}
        />
        <Text style={styles.hint}>Can dung IP LAN neu test tren 2 may that.</Text>
      </SectionCard>

      <SectionCard title="LiveKit URL">
        <TextInput
          style={styles.input}
          value={livekitUrl}
          onChangeText={setLivekitUrl}
          autoCapitalize="none"
          placeholder="wss://xxxx.livekit.cloud"
          placeholderTextColor={palette.muted}
        />
      </SectionCard>

      <SectionCard title="Guest Quick Start">
        <TextInput
          style={styles.input}
          value={guestName}
          onChangeText={setGuestName}
          placeholder="Guest display name"
          placeholderTextColor={palette.muted}
        />
        <Pressable style={styles.primaryBtn} onPress={runGuest} disabled={loading !== null}>
          {loading === "guest" ? (
            <ActivityIndicator color="#001015" />
          ) : (
            <Text style={styles.primaryText}>Continue as Guest</Text>
          )}
        </Pressable>
      </SectionCard>

      <SectionCard title="Registered Login (username)">
        <TextInput
          style={styles.input}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          placeholder="username"
          placeholderTextColor={palette.muted}
        />
        <Pressable style={styles.secondaryBtn} onPress={runLogin} disabled={loading !== null}>
          {loading === "login" ? (
            <ActivityIndicator color={palette.text} />
          ) : (
            <Text style={styles.secondaryText}>Login Registered</Text>
          )}
        </Pressable>
      </SectionCard>

      {!!error && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 14
  },
  heading: {
    color: palette.text,
    fontSize: 26,
    fontWeight: "800"
  },
  sub: {
    color: palette.muted
  },
  hint: {
    color: palette.muted,
    fontSize: 12
  },
  input: {
    borderWidth: 1,
    borderColor: palette.border,
    backgroundColor: palette.surface,
    color: palette.text,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10
  },
  primaryBtn: {
    backgroundColor: palette.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center"
  },
  primaryText: {
    color: "#04251D",
    fontWeight: "800"
  },
  secondaryBtn: {
    backgroundColor: palette.info,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center"
  },
  secondaryText: {
    color: "#06202A",
    fontWeight: "800"
  },
  error: {
    color: palette.danger,
    fontWeight: "600"
  }
});
