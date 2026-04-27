import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, Typography, Spacing, BorderRadius } from '../src/constants/theme';
import Constants from 'expo-constants';

export default function VersionScreen() {
  return (
    <LinearGradient
      colors={['#c8a870', '#d4907a', '#e08068', '#c87060']}
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

        <Text style={styles.pageTitle}>Phiên bản</Text>

        <View style={styles.versionCard}>
          <View style={styles.versionRow}>
            <Text style={styles.versionLabel}>Phiên bản hiện tại</Text>
            <Text style={styles.versionValue}>
              {Constants.expoConfig?.version || '1.0.0'}
            </Text>
          </View>
          <View style={styles.cardSeparator} />
          <View style={styles.versionRow}>
            <Text style={styles.versionLabel}>Bản dựng</Text>
            <Text style={styles.versionValue}>2026.04</Text>
          </View>
          <View style={styles.cardSeparator} />
          <View style={styles.versionRow}>
            <Text style={styles.versionLabel}>Nền tảng</Text>
            <Text style={styles.versionValue}>Android</Text>
          </View>
        </View>

        <View style={styles.versionCard}>
          <View style={styles.versionRow}>
            <Text style={styles.versionLabel}>Công nghệ</Text>
            <Text style={styles.versionValue}>React Native / Expo</Text>
          </View>
          <View style={styles.cardSeparator} />
          <View style={styles.versionRow}>
            <Text style={styles.versionLabel}>Nhóm phát triển</Text>
            <Text style={styles.versionValue}>VLU Group 20</Text>
          </View>
          <View style={styles.cardSeparator} />
          <View style={styles.versionRow}>
            <Text style={styles.versionLabel}>Giảng viên hướng dẫn</Text>
            <Text style={styles.versionValue}>TS. Nguyễn Quốc Dũng</Text>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.base },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
    paddingTop: Spacing.sm,
  },
  backBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center', alignItems: 'center',
  },
  logoRow: { flexDirection: 'row', alignItems: 'center' },
  logoIconContainer: {
    width: 30, height: 30, borderRadius: 8,
    backgroundColor: 'rgba(21, 101, 192, 0.85)',
    justifyContent: 'center', alignItems: 'center', marginRight: 4,
  },
  logoText: {
    fontSize: Typography.lg, fontWeight: Typography.extrabold,
    color: Colors.primaryLight, letterSpacing: 1.5,
  },
  pageTitle: {
    fontSize: Typography.xl, fontWeight: Typography.bold,
    color: Colors.white, textAlign: 'center',
    marginBottom: Spacing.lg,
  },
  versionCard: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: BorderRadius.xl,
    padding: Spacing.base,
    marginBottom: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  versionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  versionLabel: { fontSize: Typography.sm, color: 'rgba(255,255,255,0.65)' },
  versionValue: { fontSize: Typography.sm, color: Colors.white, fontWeight: Typography.semibold },
  cardSeparator: { height: 1, backgroundColor: 'rgba(255,255,255,0.15)' },
});
