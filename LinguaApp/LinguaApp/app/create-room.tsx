import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, Typography, Spacing, BorderRadius, Shadows } from '../src/constants/theme';
import { LinguaLogo } from '../src/components/LinguaLogo';
import { LANGUAGES } from '../src/constants';
import { useAuthStore } from '../src/store/authStore';
import { createRoom, toRoomContextFromCreate } from '../src/services/roomService';
import { friendlyErrorMessage } from '../src/services/errors';
import { useSettingsStore } from '../src/store/settingsStore';
import { useI18n } from '../src/i18n';

function createIdentity(prefix: 'host' | 'guest') {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export default function CreateRoomScreen() {
  const { t } = useI18n();
  const { myLang } = useSettingsStore();
  const [selectedLang, setSelectedLang] = useState(myLang);
  const [isCreating, setIsCreating] = useState(false);

  const { user, setRoomContext } = useAuthStore();

  const handleCreate = async () => {
    if (!user) {
      Alert.alert(t('create_need_login_title'), t('create_need_login_msg'));
      router.replace('/(auth)/login');
      return;
    }

    setIsCreating(true);
    try {
      const sourceLanguage = selectedLang;
      const targetLanguage = selectedLang === 'vi' ? 'en' : 'vi';
      const hostDisplayName = user.displayName;

      const payload = await createRoom({
        hostUserId: user.userId,
        hostIdentity: createIdentity('host'),
        hostDisplayName,
        sourceLanguage,
        targetLanguage,
        voiceProfile: 'host-default',
      });

      const roomContext = toRoomContextFromCreate(payload, hostDisplayName);
      await setRoomContext(roomContext);
      await Clipboard.setStringAsync(payload.room.roomCode);
      router.replace(`/call/${payload.room.roomId}`);
    } catch (err: unknown) {
      Alert.alert(t('create_failed_title'), friendlyErrorMessage(err));
    } finally {
      setIsCreating(false);
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
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={Colors.white} />
          </TouchableOpacity>
          <LinguaLogo size="sm" textColor={Colors.white} />
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.iconContainer}>
            <View style={styles.iconCircle}>
              <Ionicons name="mic" size={48} color={Colors.primaryLight} />
            </View>
            <Text style={styles.iconTitle}>{t('create_title')}</Text>
            <Text style={styles.iconSubtitle}>{t('create_subtitle')}</Text>
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
            onPress={handleCreate}
            disabled={isCreating}
            activeOpacity={0.85}
          >
            {isCreating ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <>
                <Ionicons name="add-circle-outline" size={22} color={Colors.white} />
                <Text style={styles.primaryButtonText} numberOfLines={1}>{t('create_button')}</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
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
  iconContainer: {
    alignItems: 'center',
    paddingVertical: Spacing['2xl'],
  },
  iconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(21,101,192,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(33,150,243,0.5)',
    marginBottom: Spacing.lg,
    ...Shadows.md,
  },
  iconTitle: {
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
    color: Colors.white,
    marginBottom: Spacing.xs,
    textAlign: 'center',
  },
  iconSubtitle: {
    fontSize: Typography.sm,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    lineHeight: 20,
  },
  langCard: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    marginBottom: Spacing.md,
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
  langRowSelected: {
    backgroundColor: 'rgba(21,101,192,0.3)',
  },
  langFlag: { fontSize: 20 },
  langLabel: {
    flex: 1,
    fontSize: Typography.base,
    fontWeight: Typography.medium,
    color: Colors.white,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: BorderRadius.xl,
    height: 52,
    gap: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  primaryButtonText: {
    color: Colors.white,
    fontSize: Typography.md,
    fontWeight: Typography.bold,
    flexShrink: 1,
  },
});
