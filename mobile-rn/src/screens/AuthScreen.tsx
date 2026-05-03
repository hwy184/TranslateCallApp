import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
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
import { t } from "../i18n";

type Props = NativeStackScreenProps<RootStackParamList, "Auth">;

export function AuthScreen({ navigation }: Props) {
  const [guestName, setGuestName] = useState("Guest Mobile");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [registerName, setRegisterName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState<"guest" | "login" | "register" | null>(null);

  const apiBaseUrl = useSessionStore((s) => s.apiBaseUrl);
  const livekitUrl = useSessionStore((s) => s.livekitUrl);
  const setApiBaseUrl = useSessionStore((s) => s.setApiBaseUrl);
  const setLivekitUrl = useSessionStore((s) => s.setLivekitUrl);
  const setAuth = useSessionStore((s) => s.setAuth);
  const appLanguage = useSessionStore((s) => s.appLanguage);

  const api = useMemo(() => new ApiClient(apiBaseUrl), [apiBaseUrl]);

  const runGuest = async () => {
    setError(null);
    setInfo(null);
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
    setInfo(null);
    setLoading("login");
    try {
      const result = await api.authLogin({
        email: email.trim(),
        password
      });
      setAuth(result);
      navigation.replace("Lobby");
    } catch (e) {
      setError(friendlyErrorMessage(e));
    } finally {
      setLoading(null);
    }
  };

  const runRegister = async () => {
    setError(null);
    setInfo(null);
    setLoading("register");
    try {
      const result = await api.authRegister({
        email: email.trim(),
        password,
        displayName: registerName.trim() || undefined
      });
      setAuth(result);
      setInfo("Register thanh cong, da dang nhap.");
      navigation.replace("Lobby");
    } catch (e) {
      setError(friendlyErrorMessage(e));
    } finally {
      setLoading(null);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.hero}>
          <Text style={styles.brand}>LINGUA</Text>
          <Text style={styles.tagline}>Ket noi moi ngon ngu</Text>
          <Text style={styles.sub}>
            Dang nhap nhanh de tao phong hoac tham gia voice room realtime.
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Cau hinh ket noi</Text>
          <TextInput
            style={styles.input}
            value={apiBaseUrl}
            onChangeText={setApiBaseUrl}
            autoCapitalize="none"
            placeholder="http://192.168.x.y:8080"
            placeholderTextColor={palette.muted}
          />
          <TextInput
            style={styles.input}
            value={livekitUrl}
            onChangeText={setLivekitUrl}
            autoCapitalize="none"
            placeholder="wss://xxxx.livekit.cloud"
            placeholderTextColor={palette.muted}
          />
          <Text style={styles.hint}>Dung IP LAN neu test tren 2 may that.</Text>
        </View>

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
              <Text style={styles.primaryText}>{t(appLanguage, "continue_guest")}</Text>
            )}
          </Pressable>
        </SectionCard>

        <SectionCard title="Registered Account">
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="email@example.com"
            placeholderTextColor={palette.muted}
          />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            secureTextEntry
            placeholder="password (min 8)"
            placeholderTextColor={palette.muted}
          />
          <TextInput
            style={styles.input}
            value={registerName}
            onChangeText={setRegisterName}
            placeholder="display name (optional)"
            placeholderTextColor={palette.muted}
          />
          <View style={styles.rowButtons}>
            <Pressable
              style={styles.secondaryBtn}
              onPress={runLogin}
              disabled={loading !== null || !email.trim() || !password.trim()}
            >
              {loading === "login" ? (
                <ActivityIndicator color={palette.text} />
              ) : (
                <Text style={styles.secondaryText}>{t(appLanguage, "login")}</Text>
              )}
            </Pressable>
            <Pressable
              style={styles.primaryBtn}
              onPress={runRegister}
              disabled={loading !== null || !email.trim() || password.trim().length < 8}
            >
              {loading === "register" ? (
                <ActivityIndicator color="#001015" />
              ) : (
                <Text style={styles.primaryText}>{t(appLanguage, "register")}</Text>
              )}
            </Pressable>
          </View>
        </SectionCard>

        {!!info && <Text style={styles.info}>{info}</Text>}
        {!!error && <Text style={styles.error}>{error}</Text>}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#21405E"
  },
  container: {
    padding: 16,
    gap: 14,
    backgroundColor: "transparent"
  },
  hero: {
    borderRadius: 18,
    padding: 18,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)"
  },
  brand: {
    color: "#FFFFFF",
    fontSize: 30,
    fontWeight: "900",
    letterSpacing: 1.5
  },
  tagline: {
    color: "rgba(255,255,255,0.95)",
    marginTop: 4,
    fontWeight: "700"
  },
  card: {
    backgroundColor: "rgba(7,20,34,0.85)",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: palette.border,
    padding: 14,
    gap: 10
  },
  cardTitle: {
    color: palette.text,
    fontWeight: "700"
  },
  sub: {
    color: "rgba(255,255,255,0.8)",
    marginTop: 6
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
  rowButtons: {
    flexDirection: "row",
    gap: 8
  },
  primaryBtn: {
    flex: 1,
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
    flex: 1,
    backgroundColor: palette.info,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center"
  },
  secondaryText: {
    color: "#06202A",
    fontWeight: "800"
  },
  info: {
    color: palette.accent,
    fontWeight: "700"
  },
  error: {
    color: "#FFE9E9",
    fontWeight: "700",
    backgroundColor: "rgba(155,34,34,0.9)",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10
  }
});
