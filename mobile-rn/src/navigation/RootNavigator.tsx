import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import React from "react";
import { palette } from "../theme";
import { AuthScreen } from "../screens/AuthScreen";
import { RoomLobbyScreen } from "../screens/RoomLobbyScreen";
import { CallScreen } from "../screens/CallScreen";
import { HistoryScreen } from "../screens/HistoryScreen";
import { VoiceSettingsScreen } from "../screens/VoiceSettingsScreen";
import type { RootStackParamList } from "./types";
import { useSessionStore } from "../store/session-store";
import { t } from "../i18n";

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: palette.bg,
    card: palette.surface,
    text: palette.text,
    border: palette.border
  }
};

export function RootNavigator() {
  const user = useSessionStore((s) => s.user);
  const appLanguage = useSessionStore((s) => s.appLanguage);

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        initialRouteName={user ? "Lobby" : "Auth"}
        screenOptions={{
          headerStyle: { backgroundColor: palette.surface },
          headerTintColor: palette.text,
          contentStyle: { backgroundColor: palette.bg }
        }}
      >
        <Stack.Screen name="Auth" component={AuthScreen} options={{ title: t(appLanguage, "auth_title") }} />
        <Stack.Screen
          name="Lobby"
          component={RoomLobbyScreen}
          options={{ title: t(appLanguage, "lobby_title") }}
        />
        <Stack.Screen name="Call" component={CallScreen} options={{ title: t(appLanguage, "call_title") }} />
        <Stack.Screen name="History" component={HistoryScreen} options={{ title: t(appLanguage, "history_title") }} />
        <Stack.Screen
          name="VoiceSettings"
          component={VoiceSettingsScreen}
          options={{ title: "Voice Settings" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
