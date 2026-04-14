import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "voice-rn-local-voice-settings-v1";

export type VoiceGender = "male" | "female" | "neutral";

export interface LocalVoiceSettings {
  speed: number;
  gender: VoiceGender;
  profile: string;
}

export const defaultVoiceSettings: LocalVoiceSettings = {
  speed: 1,
  gender: "neutral",
  profile: "default"
};

export async function loadLocalVoiceSettings(): Promise<LocalVoiceSettings> {
  const raw = await AsyncStorage.getItem(KEY);
  if (!raw) return defaultVoiceSettings;
  try {
    const parsed = JSON.parse(raw) as Partial<LocalVoiceSettings>;
    return {
      speed:
        typeof parsed.speed === "number" && parsed.speed >= 0.5 && parsed.speed <= 2
          ? parsed.speed
          : defaultVoiceSettings.speed,
      gender:
        parsed.gender === "male" || parsed.gender === "female" || parsed.gender === "neutral"
          ? parsed.gender
          : defaultVoiceSettings.gender,
      profile:
        typeof parsed.profile === "string" && parsed.profile.length > 0
          ? parsed.profile
          : defaultVoiceSettings.profile
    };
  } catch {
    return defaultVoiceSettings;
  }
}

export async function saveLocalVoiceSettings(
  settings: LocalVoiceSettings
): Promise<void> {
  await AsyncStorage.setItem(KEY, JSON.stringify(settings));
}
