import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../src/constants/theme';
import { LinguaLogo } from '../src/components/LinguaLogo';
import { LANGUAGES, ROOM_CODE_LENGTH } from '../src/constants';
import { useAuthStore } from '../src/store/authStore';
import {
  joinRoom,
  resolveRoomByShortCode,
  toRoomContextFromJoin
} from '../src/services/roomService';
import { friendlyErrorMessage } from '../src/services/errors';
import { useSettingsStore } from '../src/store/settingsStore';
import { useI18n } from '../src/i18n';

function createIdentity(prefix: 'host' | 'guest') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export default function JoinRoomScreen() {
  const { t } = useI18n();
  const { myLang } = useSettingsStore();
  const [roomId, setRoomId] = useState('');
  const [selectedLang, setSelectedLang] = useState(myLang);
  const [isJoining, setIsJoining] = useState(false);

  const { user, setRoomContext } = useAuthStore();

  const handleJoin = async () => {
    if (!user) {
      Alert.alert(t('join_need_login_title'), t('join_need_login_msg'));
      router.replace('/(auth)/login');
      return;
    }

    if (!roomId.trim()) {
      Alert.alert(t('join_invalid_code_title'), t('join_invalid_code_msg'));
      return;
    }

    setIsJoining(true);
    try {
      const sourceLanguage = selectedLang;
      const targetLanguage = selectedLang === 'vi' ? 'en' : 'vi';
      const guestDisplayName = user.displayName;

      const rawRoomInput = roomId.trim();
      const resolvedRoomId =
        rawRoomInput.startsWith('room_') || rawRoomInput.length > 10
          ? rawRoomInput
          : (await resolveRoomByShortCode(rawRoomInput)).room.roomId;

      const payload = await joinRoom({
        roomId: resolvedRoomId,
        guestUserId: user.userId,
        guestIdentity: createIdentity('guest'),
        guestDisplayName,
        sourceLanguage,
        targetLanguage,
        voiceProfile: 'guest-default',
      });

      const roomContext = toRoomContextFromJoin(payload, guestDisplayName);
      await setRoomContext(roomContext);
      router.push(`/call/${payload.room.roomId}`);
    } catch (err: unknown) {
      Alert.alert(t('join_failed_title'), friendlyErrorMessage(err));
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <LinearGradient
      colors={['#3a5068', '#4a7080', '#b8906a', '#d4957a']}
      locations={[0, 0.35, 0.7, 1]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
              <Ionicons name="chevron-back" size={24} color={Colors.white} />
            </TouchableOpacity>
            <LinguaLogo size="sm" textColor={Colors.white} />
            <View style={{ width: 40 }} />
          </View>

          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.section}>
              <View style={styles.iconCircle}>
                <Ionicons name="keypad" size={44} color={Colors.primaryLight} />
              </View>
              <Text style={styles.sectionTitle}>{t('join_enter_code')}</Text>
              <Text style={styles.sectionSubtitle}>{t('join_enter_code_sub')}</Text>
            </View>

            <View style={styles.inputCard}>
              <Text style={styles.inputLabel}>{t('join_room_code')}</Text>
              <TextInput
                style={styles.input}
                value={roomId}
                onChangeText={setRoomId}
                maxLength={ROOM_CODE_LENGTH}
                keyboardType="number-pad"
                placeholder="123456"
                placeholderTextColor="rgba(255,255,255,0.45)"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.langCard}>
              {LANGUAGES.slice(0, 2).map((lang) => (
                <TouchableOpacity
                  key={lang.code}
                  style={[
                    styles.langRow,
                    selectedLang === lang.code && styles.langRowSelected,
                  ]}
                  onPress={() => setSelectedLang(lang.code)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.langFlag}>{lang.flag}</Text>
                  <Text style={styles.langLabel}>{lang.label}</Text>
                  {selectedLang === lang.code && (
                    <Ionicons name="checkmark-circle" size={22} color={Colors.online} />
                  )}
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleJoin}
              disabled={isJoining}
              activeOpacity={0.85}
            >
              {isJoining ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <>
                  <Ionicons name="enter-outline" size={22} color={Colors.white} />
                  <Text style={styles.primaryButtonText}>{t('join_button')}</Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safeArea: { flex: 1, padding: Spacing.lg },
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
  scrollContent: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing['3xl'],
  },
  section: { alignItems: 'center', paddingVertical: Spacing.xl },
  iconCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(21,101,192,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(33,150,243,0.5)',
    marginBottom: Spacing.md,
    ...Shadows.md,
  },
  sectionTitle: {
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
    color: Colors.white,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  sectionSubtitle: {
    fontSize: Typography.sm,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    lineHeight: 20,
  },
  inputCard: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.xl,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    marginBottom: Spacing.md,
  },
  inputLabel: {
    fontSize: Typography.xs,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(0,0,0,0.2)',
    color: Colors.white,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
  },
  langCard: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    marginBottom: Spacing.xl,
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  langRowSelected: { backgroundColor: 'rgba(21,101,192,0.3)' },
  langFlag: { fontSize: 20 },
  langLabel: { flex: 1, fontSize: Typography.base, fontWeight: Typography.medium, color: Colors.white },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.xl,
    height: 52,
    gap: Spacing.sm,
  },
  primaryButtonText: {
    color: Colors.white,
    fontSize: Typography.md,
    fontWeight: Typography.bold,
  },
});
