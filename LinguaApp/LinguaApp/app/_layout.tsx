import { useEffect } from 'react';
import { AppState } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold } from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
import { useAuthStore } from '../src/store/authStore';
import { useSettingsStore } from '../src/store/settingsStore';
import apiClient from '../src/services/apiClient';
import { ApiClientError } from '../src/services/errors';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Inter_800ExtraBold,
  });

  const loadSession = useAuthStore((s) => s.loadSession);
  const user = useAuthStore((s) => s.user);
  const session = useAuthStore((s) => s.session);

  useEffect(() => {
    Promise.all([
      loadSession(),
      useSettingsStore.getState().loadSettings()
    ]).then(() => {
      if (fontsLoaded) SplashScreen.hideAsync();
    });
  }, [fontsLoaded]);

  useEffect(() => {
    if (user?.type !== 'registered' || !session?.accessToken) return;

    let stopped = false;
    const heartbeat = async () => {
      if (stopped) return;
      try {
        await apiClient.get('/auth/session');
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 404) {
          // Fallback for older backend versions without /auth/session.
          await apiClient.get('/history?limit=1').catch(() => undefined);
        }
      }
    };

    void heartbeat();
    const timer = setInterval(() => {
      void heartbeat();
    }, 15000);

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void heartbeat();
      }
    });

    return () => {
      stopped = true;
      clearInterval(timer);
      appStateSub.remove();
    };
  }, [session?.accessToken, user?.type]);

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="(auth)" />
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="settings" options={{ presentation: 'modal' }} />
          <Stack.Screen name="info" />
          <Stack.Screen name="version" />
          <Stack.Screen name="language-settings" />
          <Stack.Screen name="create-room" />
          <Stack.Screen name="join-room" />
          <Stack.Screen name="waiting-room" />
          <Stack.Screen name="call/[id]" options={{ presentation: 'fullScreenModal' }} />
          <Stack.Screen name="history/[id]" />
        </Stack>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
