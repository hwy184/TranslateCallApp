import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../../src/constants/theme';
import { useAuthStore } from '../../src/store/authStore';
import { getSystemHealth, type SystemHealth } from '../../src/services/healthService';

export default function MainScreen() {
  const user = useAuthStore((s) => s.user);
  const [health, setHealth] = useState<SystemHealth | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoadingHealth(true);
      const data = await getSystemHealth();
      if (!active) return;
      setHealth(data);
      setLoadingHealth(false);
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <LinearGradient
      colors={['#274056', '#415f72', '#7f8f7a', '#c99573']}
      locations={[0, 0.34, 0.68, 1]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safeArea}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>LINGUA VOICE</Text>
              <Text style={styles.headerTitle}>Trang chủ</Text>
            </View>
            <TouchableOpacity style={styles.headerBtn} onPress={() => router.push('/settings')}>
              <Ionicons name="settings-outline" size={22} color={Colors.white} />
            </TouchableOpacity>
          </View>

          <View style={styles.heroCard}>
            <Text style={styles.heroEyebrow}>Cuộc gọi song ngữ</Text>
            <Text style={styles.heroTitle}>Nói một câu, bên kia nghe bản dịch bằng giọng AI.</Text>
            <Text style={styles.heroSubtitle}>
              Việt - Anh là luồng chính. Tạo phòng hoặc vào phòng bằng mã, rồi nói chuyện trực tiếp mà không phải qua nhiều bước rườm rà.
            </Text>

            <View style={styles.statRow}>
              <View style={styles.statPill}>
                <Text style={styles.statValue}>1-1</Text>
                <Text style={styles.statLabel}>Một chủ phòng, một khách</Text>
              </View>
              <View style={styles.statPill}>
                <Text style={styles.statValue}>vi/en</Text>
                <Text style={styles.statLabel}>Chỉ Việt và Anh</Text>
              </View>
              <View style={styles.statPill}>
                <Text style={styles.statValue}>live</Text>
                <Text style={styles.statLabel}>Dịch realtime</Text>
              </View>
            </View>
          </View>

          <View style={styles.healthBanner}>
            <View style={styles.healthDotRow}>
              {loadingHealth ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <View
                  style={[
                    styles.healthDot,
                    health?.status === 'ok' ? styles.healthDotOk : styles.healthDotWarn,
                  ]}
                />
              )}
              <Text style={styles.healthText}>
                {loadingHealth
                  ? 'Đang kiểm tra kết nối hệ thống...'
                  : health?.status === 'ok'
                    ? 'Hệ thống sẵn sàng cho cuộc gọi realtime.'
                    : 'Một số dịch vụ đang hạn chế, nhưng app vẫn cho thử lại.'}
              </Text>
            </View>
            {!loadingHealth && health && health.status !== 'ok' && (
              <Text style={styles.healthDetail}>
                {health.db === 'unreachable' ? 'Cơ sở dữ liệu chưa phản hồi. ' : ''}
                {health.worker === 'unreachable' ? 'Worker AI chưa sẵn sàng.' : ''}
              </Text>
            )}
          </View>

          <View style={styles.flowCard}>
            <View style={styles.flowRow}>
              <View style={styles.flowStep}>
                <View style={styles.flowDot}>
                  <Text style={styles.flowDotText}>1</Text>
                </View>
                <Text style={styles.flowText}>Tạo hoặc nhập mã phòng</Text>
              </View>
              <View style={styles.flowStep}>
                <View style={styles.flowDot}>
                  <Text style={styles.flowDotText}>2</Text>
                </View>
                <Text style={styles.flowText}>Đợi người kia vào phòng</Text>
              </View>
              <View style={styles.flowStep}>
                <View style={styles.flowDot}>
                  <Text style={styles.flowDotText}>3</Text>
                </View>
                <Text style={styles.flowText}>Nói và nghe giọng AI dịch</Text>
              </View>
            </View>
          </View>

          <View style={styles.actionGrid}>
            <TouchableOpacity
              style={styles.primaryAction}
              onPress={() => router.push('/create-room')}
              activeOpacity={0.85}
              >
              <View style={styles.actionIconBlue}>
                <Ionicons name="add" size={20} color={Colors.white} />
              </View>
              <View style={styles.actionTextBlock}>
                <Text style={styles.actionTitle}>Tạo phòng</Text>
                <Text style={styles.actionSubtitle}>Bắt đầu cuộc gọi mới ngay</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryAction}
              onPress={() => router.push('/join-room')}
              activeOpacity={0.85}
              >
              <View style={styles.actionIconLight}>
                <Ionicons name="enter-outline" size={20} color={Colors.white} />
              </View>
              <View style={styles.actionTextBlock}>
                <Text style={styles.actionTitle}>Nhập mã phòng</Text>
                <Text style={styles.actionSubtitle}>Tham gia phòng từ host</Text>
              </View>
            </TouchableOpacity>
          </View>

          <Text style={styles.footerNote}>
            Đăng nhập bởi {user?.displayName ?? 'Người dùng'}.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safeArea: { flex: 1, paddingBottom: 90 },
  content: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xl,
    gap: Spacing.base,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Spacing.sm,
  },
  eyebrow: {
    fontSize: 10,
    fontWeight: Typography.extrabold,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 0,
    marginBottom: 2,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.extrabold,
    color: Colors.white,
    letterSpacing: 0,
  },
  heroCard: {
    backgroundColor: 'rgba(0,0,0,0.16)',
    borderRadius: BorderRadius.xl,
    padding: Spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    gap: 8,
    ...Shadows.md,
  },
  heroEyebrow: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 10,
    fontWeight: Typography.bold,
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  heroTitle: {
    fontSize: Typography.xl,
    fontWeight: Typography.extrabold,
    color: Colors.white,
    lineHeight: 28,
  },
  heroSubtitle: {
    fontSize: Typography.sm,
    color: 'rgba(255,255,255,0.74)',
    lineHeight: 20,
  },
  statRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  statPill: {
    flex: 1,
    minHeight: 78,
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    paddingHorizontal: 10,
    paddingVertical: 10,
    justifyContent: 'center',
  },
  statValue: {
    color: Colors.white,
    fontSize: Typography.md,
    fontWeight: Typography.extrabold,
    marginBottom: 2,
  },
  statLabel: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 10,
    lineHeight: 14,
  },
  flowCard: {
    backgroundColor: 'rgba(255,255,255,0.10)',
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    padding: Spacing.md,
  },
  healthBanner: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    gap: 4,
  },
  healthDotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  healthDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
  },
  healthDotOk: {
    backgroundColor: '#00D084',
  },
  healthDotWarn: {
    backgroundColor: '#F3C148',
  },
  healthText: {
    flex: 1,
    color: Colors.white,
    fontSize: Typography.xs,
    lineHeight: 16,
  },
  healthDetail: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 10,
    lineHeight: 14,
    paddingLeft: 18,
  },
  flowRow: {
    flexDirection: 'row',
    gap: 10,
  },
  flowStep: {
    flex: 1,
    gap: 6,
    alignItems: 'flex-start',
  },
  flowDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  flowDotText: {
    color: Colors.white,
    fontSize: 12,
    fontWeight: Typography.extrabold,
  },
  flowText: {
    color: 'rgba(255,255,255,0.82)',
    fontSize: Typography.xs,
    lineHeight: 16,
  },
  actionGrid: {
    gap: Spacing.sm,
  },
  primaryAction: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: 'rgba(21,101,192,0.9)',
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    gap: Spacing.md,
    ...Shadows.sm,
  },
  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.xl,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    gap: Spacing.md,
  },
  actionIconBlue: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.14)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionIconLight: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.14)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionTextBlock: {
    flex: 1,
    justifyContent: 'center',
  },
  actionTitle: {
    color: Colors.white,
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    lineHeight: 20,
  },
  actionSubtitle: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: Typography.xs,
    marginTop: 2,
    lineHeight: 14,
  },
  footerNote: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: Typography.xs,
    textAlign: 'center',
    marginTop: Spacing.xs,
  },
});
