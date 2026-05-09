import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Switch,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, Typography, Spacing, BorderRadius } from '../src/constants/theme';
import { LinguaLogo } from '../src/components/LinguaLogo';
import { useSettingsStore } from '../src/store/settingsStore';
import { useI18n } from '../src/i18n';

export default function LanguageSettingsScreen() {
  const { t, locale } = useI18n();
  const { myLang, autoTranslate, showSubtitle, setSettings } = useSettingsStore();
  const [pickingFor, setPickingFor] = useState<null | 'my'>(null);
  const LANGUAGES = [
    { code: 'vi', label: t('language_vi_label'), flag: '🇻🇳', region: t('language_vi_region') },
    { code: 'en', label: t('language_en_label'), flag: '🇺🇸', region: t('language_en_region') },
  ] as const;

  const myLangInfo = LANGUAGES.find((l) => l.code === myLang) ?? LANGUAGES[locale === 'en' ? 1 : 0];

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
            <Ionicons name="chevron-back" size={24} color={Colors.white} />
          </TouchableOpacity>
          <LinguaLogo size="sm" textColor={Colors.white} />
          <View style={{ width: 40 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.pageTitle}>{t('language_title')}</Text>

          <Text style={styles.sectionLabel}>{t('language_my_language')}</Text>
          <View style={styles.card}>
            <TouchableOpacity
              style={styles.langRow}
              onPress={() => setPickingFor(pickingFor === 'my' ? null : 'my')}
              activeOpacity={0.7}
            >
              <Text style={styles.langFlag}>{myLangInfo?.flag}</Text>
              <View style={styles.langInfo}>
                <Text style={styles.langLabel}>{myLangInfo?.label}</Text>
                <Text style={styles.langRegion}>{myLangInfo?.region}</Text>
              </View>
              <Ionicons
                name={pickingFor === 'my' ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={Colors.white}
              />
            </TouchableOpacity>

            {pickingFor === 'my' && (
              <View style={styles.dropdown}>
                {LANGUAGES.map((lang, i) => (
                  <TouchableOpacity
                    key={lang.code}
                    style={[
                      styles.dropdownRow,
                      i < LANGUAGES.length - 1 && styles.dropdownDivider,
                      lang.code === myLang && styles.dropdownRowSelected,
                    ]}
                    onPress={() => {
                      setSettings({ myLang: lang.code });
                      setPickingFor(null);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.dropFlag}>{lang.flag}</Text>
                    <Text style={styles.dropLabel}>{lang.label}</Text>
                    {lang.code === myLang && (
                      <Ionicons name="checkmark-circle" size={18} color={Colors.online} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          <Text style={styles.sectionLabel}>{t('language_translation_settings')}</Text>
          <View style={styles.card}>
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleTitle}>{t('language_auto_translate')}</Text>
                <Text style={styles.toggleSub}>{t('language_auto_translate_sub')}</Text>
              </View>
              <Switch
                value={autoTranslate}
                onValueChange={(val) => setSettings({ autoTranslate: val })}
                trackColor={{ false: 'rgba(255,255,255,0.2)', true: Colors.primary }}
                thumbColor={Colors.white}
              />
            </View>

            <View style={styles.cardDivider} />

            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={styles.toggleTitle}>{t('language_show_subtitle')}</Text>
                <Text style={styles.toggleSub}>{t('language_show_subtitle_sub')}</Text>
              </View>
              <Switch
                value={showSubtitle}
                onValueChange={(val) => setSettings({ showSubtitle: val })}
                trackColor={{ false: 'rgba(255,255,255,0.2)', true: Colors.primary }}
                thumbColor={Colors.white}
              />
            </View>
          </View>

          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={16} color="rgba(255,255,255,0.6)" />
            <Text style={styles.infoText}>{t('language_info')}</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safeArea: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#1a3a7a',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  scrollContent: {
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing['3xl'],
  },
  pageTitle: {
    fontSize: Typography['2xl'],
    fontWeight: Typography.bold,
    color: Colors.white,
    marginBottom: Spacing.lg,
  },
  sectionLabel: {
    fontSize: Typography.xs,
    fontWeight: Typography.bold,
    color: 'rgba(255,255,255,0.55)',
    letterSpacing: 1.5,
    marginBottom: Spacing.sm,
    marginLeft: 4,
  },
  card: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: BorderRadius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    marginBottom: Spacing.lg,
  },
  cardDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginHorizontal: Spacing.base,
  },
  langRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  langFlag: { fontSize: 28 },
  langInfo: { flex: 1 },
  langLabel: {
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    color: Colors.white,
  },
  langRegion: {
    fontSize: Typography.xs,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 2,
  },
  dropdown: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.15)',
  },
  dropdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  dropdownDivider: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  dropdownRowSelected: {
    backgroundColor: 'rgba(21,101,192,0.3)',
  },
  dropFlag: { fontSize: 22 },
  dropLabel: {
    flex: 1,
    fontSize: Typography.base,
    color: Colors.white,
    fontWeight: Typography.medium,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    gap: Spacing.md,
  },
  toggleInfo: { flex: 1 },
  toggleTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.medium,
    color: Colors.white,
  },
  toggleSub: {
    fontSize: Typography.xs,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 2,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: BorderRadius.lg,
    padding: Spacing.md,
    gap: Spacing.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    marginBottom: Spacing.md,
  },
  infoText: {
    flex: 1,
    fontSize: Typography.xs,
    color: 'rgba(255,255,255,0.55)',
    lineHeight: 18,
  },
});
