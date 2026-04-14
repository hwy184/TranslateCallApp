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
  defaultVoiceSettings,
  loadLocalVoiceSettings,
  saveLocalVoiceSettings,
  type VoiceGender
} from "../storage/voice-settings-storage";
import { palette } from "../theme";

export function VoiceSettingsScreen() {
  const user = useSessionStore((s) => s.user);
  const apiBaseUrl = useSessionStore((s) => s.apiBaseUrl);
  const authSession = useSessionStore((s) => s.authSession);
  const api = useMemo(
    () => new ApiClient(apiBaseUrl, () => authSession?.accessToken ?? null),
    [apiBaseUrl, authSession?.accessToken]
  );

  const [speed, setSpeed] = useState(String(defaultVoiceSettings.speed));
  const [profile, setProfile] = useState(defaultVoiceSettings.profile);
  const [gender, setGender] = useState<VoiceGender>(defaultVoiceSettings.gender);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    void (async () => {
      const local = await loadLocalVoiceSettings();
      setSpeed(String(local.speed));
      setProfile(local.profile);
      setGender(local.gender);
    })();
  }, []);

  const save = async () => {
    setLoading(true);
    setError(null);
    setMessage(null);
    const parsedSpeed = Number(speed);
    if (Number.isNaN(parsedSpeed) || parsedSpeed < 0.5 || parsedSpeed > 2) {
      setError("Speed phai trong khoang 0.5 -> 2.0");
      setLoading(false);
      return;
    }
    try {
      await saveLocalVoiceSettings({
        speed: parsedSpeed,
        gender,
        profile: profile.trim() || "default"
      });

      if (user?.type === "registered") {
        await api.upsertVoicePreference({
          userId: user.userId,
          speed: parsedSpeed,
          gender,
          profile: profile.trim() || "default"
        });
        setMessage("Saved local + cloud.");
      } else {
        setMessage("Saved local (guest mode).");
      }
    } catch (e) {
      setError(friendlyErrorMessage(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <SectionCard title="Voice Settings">
        <Text style={styles.label}>Speed (0.5 - 2.0)</Text>
        <TextInput
          style={styles.input}
          value={speed}
          onChangeText={setSpeed}
          keyboardType="decimal-pad"
          placeholder="1.0"
          placeholderTextColor={palette.muted}
        />

        <Text style={styles.label}>Profile</Text>
        <TextInput
          style={styles.input}
          value={profile}
          onChangeText={setProfile}
          placeholder="default"
          placeholderTextColor={palette.muted}
        />

        <Text style={styles.label}>Gender</Text>
        <View style={styles.row}>
          {(["male", "female", "neutral"] as const).map((item) => (
            <Pressable
              key={item}
              style={[styles.chip, gender === item && styles.chipActive]}
              onPress={() => setGender(item)}
            >
              <Text style={[styles.chipText, gender === item && styles.chipTextActive]}>
                {item}
              </Text>
            </Pressable>
          ))}
        </View>

        <Pressable style={styles.button} onPress={save} disabled={loading}>
          {loading ? (
            <ActivityIndicator color="#062117" />
          ) : (
            <Text style={styles.buttonText}>Save Settings</Text>
          )}
        </Pressable>
        <Text style={styles.note}>
          Registered: sync cloud. Guest: local only. Premium tam bo qua.
        </Text>
      </SectionCard>
      {!!message && <Text style={styles.ok}>{message}</Text>}
      {!!error && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12
  },
  label: {
    color: palette.text,
    fontWeight: "700",
    fontSize: 12
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
  row: {
    flexDirection: "row",
    gap: 8
  },
  chip: {
    borderWidth: 1,
    borderColor: palette.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999
  },
  chipActive: {
    borderColor: palette.accent,
    backgroundColor: "#113C31"
  },
  chipText: {
    color: palette.muted
  },
  chipTextActive: {
    color: palette.accent
  },
  button: {
    backgroundColor: palette.accent,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center"
  },
  buttonText: {
    color: "#072418",
    fontWeight: "800"
  },
  note: {
    color: palette.muted,
    fontSize: 12
  },
  ok: {
    color: palette.accent
  },
  error: {
    color: palette.danger
  }
});
