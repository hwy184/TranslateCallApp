import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants';

interface SettingsState {
  myLang: string;
  autoTranslate: boolean;
  showSubtitle: boolean;
  setSettings: (settings: Partial<SettingsState>) => Promise<void>;
  loadSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  myLang: 'vi',
  autoTranslate: true,
  showSubtitle: true,

  setSettings: async (settings) => {
    const next = { ...get(), ...settings };
    await AsyncStorage.setItem(
      STORAGE_KEYS.SETTINGS,
      JSON.stringify({
        myLang: next.myLang,
        autoTranslate: next.autoTranslate,
        showSubtitle: next.showSubtitle,
      })
    );
    set(settings);
  },

  loadSettings: async () => {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (stored) {
        const parsed = JSON.parse(stored);
        set({
          myLang: parsed.myLang ?? 'vi',
          autoTranslate: parsed.autoTranslate ?? true,
          showSubtitle: parsed.showSubtitle ?? true,
        });
      }
    } catch {
      // ignore
    }
  },
}));
