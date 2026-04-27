import { Redirect } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';
import { ActivityIndicator, View } from 'react-native';
import { Colors } from '../src/constants/theme';

export default function Index() {
  const { isAuthenticated, isGuest, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1a1a2e' }}>
        <ActivityIndicator color={Colors.primaryLight} size="large" />
      </View>
    );
  }

  if (isAuthenticated || isGuest) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(auth)/login" />;
}
