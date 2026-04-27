import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuthStore } from '../src/store/authStore';
import { Colors, Typography, Spacing, BorderRadius } from '../src/constants/theme';

export default function InfoScreen() {
  const { user } = useAuthStore();

  const InfoField = ({ label, value }: { label: string; value?: string }) => (
    <View style={styles.infoField}>
      <Text style={styles.infoLabel}>{label}</Text>
      {value ? <Text style={styles.infoValue}>{value}</Text> : null}
    </View>
  );

  return (
    <LinearGradient
      colors={['#b8c8a0', '#c8b090', '#d4987a', '#e08070']}
      locations={[0, 0.35, 0.7, 1]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={22} color={Colors.white} />
          </TouchableOpacity>
          <View style={styles.logoRow}>
            <View style={styles.logoIconContainer}>
              <Ionicons name="globe-outline" size={18} color={Colors.primaryLight} />
            </View>
            <Text style={styles.logoText}>LINGUA</Text>
          </View>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.avatarContainer}>
          <View style={styles.avatarCircle}>
            <Ionicons name="person" size={48} color="rgba(255,255,255,0.6)" />
          </View>
          <Text style={styles.userName}>{user?.displayName || 'Khách'}</Text>
        </View>

        <View style={styles.infoCard}>
          <InfoField label="User ID" value={user?.userId || ''} />
          <View style={styles.infoSeparator} />
          <InfoField label="Loại tài khoản" value={user?.type || 'Khách'} />
        </View>

        <View style={styles.infoCard}>
          <InfoField label="Ngôn ngữ mặc định" value="Tiếng Việt" />
          <View style={styles.infoSeparator} />
          <InfoField label="Ngôn ngữ dịch" value="English" />
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.base, paddingBottom: Spacing.lg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoRow: { flexDirection: 'row', alignItems: 'center' },
  logoIconContainer: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: 'rgba(21, 101, 192, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
  },
  logoText: {
    fontSize: Typography.lg,
    fontWeight: Typography.extrabold,
    color: Colors.primaryLight,
    letterSpacing: 1.5,
  },
  avatarContainer: { alignItems: 'center', marginBottom: Spacing.lg },
  avatarCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    marginBottom: Spacing.sm,
  },
  userName: { fontSize: Typography.xl, fontWeight: Typography.bold, color: Colors.white },
  infoCard: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: BorderRadius.xl,
    padding: Spacing.base,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  infoField: { paddingVertical: Spacing.sm },
  infoLabel: { fontSize: Typography.xs, color: 'rgba(255,255,255,0.6)', marginBottom: 2 },
  infoValue: { fontSize: Typography.base, color: Colors.white, fontWeight: Typography.medium },
  infoSeparator: { height: 1, backgroundColor: 'rgba(255,255,255,0.15)' },
});
