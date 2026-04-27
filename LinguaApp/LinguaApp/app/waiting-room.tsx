import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { Colors, Typography, Spacing, BorderRadius } from '../src/constants/theme';
import { useAuthStore } from '../src/store/authStore';
import { getRoomStatus, toShortCode } from '../src/services/roomService';

export default function WaitingRoomScreen() {
  const params = useLocalSearchParams<{ roomId?: string }>();
  const roomContext = useAuthStore((s) => s.roomContext);
  const [shortCode, setShortCode] = React.useState('');

  const roomId = params.roomId ?? roomContext?.roomId ?? '';

  const copyRoomId = async () => {
    const value = shortCode || roomId;
    if (!value) return;
    await Clipboard.setStringAsync(value);
  };

  useEffect(() => {
    if (!roomId) {
      router.replace('/create-room');
    }
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    setShortCode(toShortCode(roomId));

    let active = true;
    const poll = async () => {
      try {
        const data = await getRoomStatus(roomId);
        if (!active) return;
        setShortCode(data.room_short_code ?? toShortCode(roomId));
        if (data.room.status === 'active') {
          router.replace(`/call/${roomId}`);
        }
      } catch {
        // ignore transient errors while waiting
      }
    };

    void poll();
    const timer = setInterval(() => {
      void poll();
    }, 2000);

    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [roomId]);

  return (
    <LinearGradient
      colors={['#3a5068', '#4a7080', '#b8906a', '#d4957a']}
      locations={[0, 0.35, 0.7, 1]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Ionicons name="close" size={22} color="rgba(255,255,255,0.7)" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Phòng chờ</Text>
          <View style={{ width: 36 }} />
        </View>

        <View style={styles.body}>
          <View style={styles.avatarCircle}>
            <Ionicons name="person" size={52} color="rgba(255,255,255,0.7)" />
          </View>

          <Text style={styles.title}>Đang chờ khách</Text>
          <Text style={styles.subtitle}>Gửi mã phòng cho người kia để họ vào phòng hoặc quay lại khi mất kết nối.</Text>

          <View style={styles.codeCard}>
            <Text style={styles.codeCardLabel}>Mã phòng ngắn</Text>
            <Text style={[styles.roomIdText, { fontSize: Typography.xl, letterSpacing: 2 }]}>
              {shortCode || 'N/A'}
            </Text>
            <Text style={[styles.codeCardLabel, { marginTop: 8 }]}>Mã phòng đầy đủ</Text>
            <Text style={styles.roomIdText}>{roomId || 'N/A'}</Text>
            <TouchableOpacity style={styles.copyBtn} onPress={copyRoomId} activeOpacity={0.85}>
              <Ionicons name="copy-outline" size={16} color={Colors.white} />
              <Text style={styles.copyBtnText}>Sao chép mã phòng</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => router.replace(`/call/${roomId}`)}
            activeOpacity={0.85}
          >
            <Ionicons name="enter-outline" size={22} color={Colors.white} />
            <Text style={styles.primaryButtonText}>Vào phòng ngay</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => router.replace('/(tabs)')}
            activeOpacity={0.8}
          >
            <Text style={styles.cancelButtonText}>Hủy</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    color: Colors.white,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.lg,
  },
  avatarCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  title: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.bold,
    color: Colors.white,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: Typography.sm,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    lineHeight: 20,
    marginTop: -Spacing.sm,
  },
  codeCard: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.xl,
    padding: Spacing.base,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    width: '100%',
    gap: Spacing.sm,
  },
  codeCardLabel: {
    fontSize: Typography.xs,
    color: 'rgba(255,255,255,0.55)',
  },
  roomIdText: {
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    color: Colors.white,
    textAlign: 'center',
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.xs,
    backgroundColor: 'rgba(21,101,192,0.85)',
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.base,
    paddingVertical: 10,
  },
  copyBtnText: {
    color: Colors.white,
    fontSize: Typography.sm,
    fontWeight: Typography.bold,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.xl,
    height: 52,
    width: '100%',
    gap: Spacing.sm,
  },
  primaryButtonText: {
    color: Colors.white,
    fontSize: Typography.md,
    fontWeight: Typography.bold,
  },
  cancelButton: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: BorderRadius.full,
    paddingVertical: 12,
    paddingHorizontal: Spacing['2xl'],
  },
  cancelButtonText: { color: 'rgba(255,255,255,0.7)', fontSize: Typography.base },
});
