import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, Typography, Spacing, BorderRadius } from '../src/constants/theme';
import { LinguaLogo } from '../src/components/LinguaLogo';
import { useAuthStore } from '../src/store/authStore';
import { logout as logoutApi } from '../src/services/authService';

export default function SettingsScreen() {
  const session = useAuthStore((s) => s.session);
  const clearSession = useAuthStore((s) => s.logout);

  const MenuItem = ({
    label,
    onPress,
  }: {
    label: string;
    onPress: () => void;
  }) => (
    <TouchableOpacity style={styles.menuItem} onPress={onPress} activeOpacity={0.7}>
      <Text style={styles.menuLabel}>{label}</Text>
      <Ionicons name='chevron-forward' size={18} color='rgba(255,255,255,0.5)' />
    </TouchableOpacity>
  );

  const handleLogout = async () => {
    try {
      if (session?.accessToken) {
        await logoutApi(session.accessToken);
      }
    } catch {
      // Ignore API logout errors, still clear local state.
    } finally {
      await clearSession();
      router.replace('/(auth)/login');
    }
  };

  return (
    <LinearGradient
      colors={['#b8c8a0', '#c8b090', '#d4987a', '#e08070']}
      locations={[0, 0.35, 0.7, 1]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name='chevron-back' size={24} color={Colors.white} />
          </TouchableOpacity>
          <LinguaLogo size='sm' textColor={Colors.white} />
          <View style={{ width: 40 }} />
        </View>

        <TouchableOpacity style={styles.profileCard} onPress={() => router.push('/info')} activeOpacity={0.8}>
          <View style={styles.profileAvatar}>
            <Ionicons name='person-circle' size={48} color='rgba(255,255,255,0.8)' />
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.profileName}>Thông tin tài khoản</Text>
            <Text style={styles.profileSub}>Xem hồ sơ và phiên đăng nhập</Text>
          </View>
          <Ionicons name='chevron-forward' size={20} color='rgba(255,255,255,0.5)' />
        </TouchableOpacity>

        <View style={styles.menuCard}>
          <MenuItem label='Ngôn ngữ & Dịch thuật' onPress={() => router.push('/language-settings')} />
          <View style={styles.menuDivider} />
          <MenuItem label='Phiên bản' onPress={() => router.push('/version')} />
        </View>

        <View style={styles.menuCard}>
          <MenuItem
            label='Đăng xuất'
            onPress={() => {
              Alert.alert('Đăng xuất', 'Bạn có chắc muốn đăng xuất?', [
                { text: 'Hủy', style: 'cancel' },
                { text: 'Đăng xuất', style: 'destructive', onPress: () => void handleLogout() },
              ]);
            }}
          />
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.base, paddingTop: Spacing.md },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: Spacing.xl,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1a3a7a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: BorderRadius.xl,
    padding: Spacing.base,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  profileAvatar: { marginRight: Spacing.md },
  profileInfo: { flex: 1 },
  profileName: { fontSize: Typography.lg, fontWeight: Typography.bold, color: Colors.white },
  profileSub: { fontSize: Typography.xs, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  menuCard: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: BorderRadius.xl,
    padding: Spacing.xs,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  menuLabel: { fontSize: Typography.base, color: Colors.white, fontWeight: Typography.medium },
  menuDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginHorizontal: Spacing.base },
});
