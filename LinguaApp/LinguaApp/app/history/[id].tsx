import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/constants/theme';
import { useAuthStore } from '../../src/store/authStore';
import {
  deleteConversation,
  deleteHistoryLocal,
  getHistoryDetail,
  getHistoryLocal,
  type ConversationHistory,
} from '../../src/services/historyService';
import { friendlyErrorMessage } from '../../src/services/errors';

function speakerRole(identity: string): 'host' | 'guest' | null {
  if (identity.startsWith('host_')) return 'host';
  if (identity.startsWith('guest_')) return 'guest';
  return null;
}

export default function HistoryDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [detail, setDetail] = useState<ConversationHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [playingLineId, setPlayingLineId] = useState<string | null>(null);

  const user = useAuthStore((s) => s.user);
  const historySourceLabel = user?.type === 'registered' ? 'Lịch sử đám mây' : 'Lịch sử cục bộ';
  const historySourceHint =
    user?.type === 'registered'
      ? 'Cuộc trò chuyện này được lưu trên máy chủ và đồng bộ vào tài khoản của bạn.'
      : 'Cuộc trò chuyện này chỉ được lưu trên thiết bị hiện tại.';
  const detectedRoles = new Set(
    (detail?.items ?? [])
      .map((it) => speakerRole(it.speaker_identity))
      .filter(Boolean) as Array<'host' | 'guest'>
  );
  const viewerRoleHint: 'host' | 'guest' | null =
    detectedRoles.has('host') && detectedRoles.has('guest')
      ? user?.type === 'guest'
        ? 'guest'
        : 'host'
      : detectedRoles.has('host')
        ? 'host'
        : detectedRoles.has('guest')
          ? 'guest'
          : null;

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!id) return;

      setLoading(true);
      try {
        if (user?.type === 'registered') {
          const data = await getHistoryDetail(id);
          if (!active) return;
          setDetail(data);
          setTitle(data.title);
        } else {
          const items = await getHistoryLocal();
          const data = items.find((it) => it.id === id) ?? null;
          if (!active) return;
          setDetail(data);
          setTitle(data?.title ?? 'Chi tiết lịch sử');
        }
        setError(null);
      } catch (err: unknown) {
        if (!active) return;
        setError(friendlyErrorMessage(err));
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [id, user?.type]);

  useEffect(() => {
    return () => {
      Speech.stop();
    };
  }, []);

  const handleDelete = () => {
    if (!id) return;
    Alert.alert('Xóa lịch sử', 'Bạn có chắc muốn xóa cuộc hội thoại này?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          try {
            if (user?.type === 'registered') {
              await deleteConversation(id);
            } else {
              await deleteHistoryLocal(id);
            }
            router.back();
          } catch (err: unknown) {
            Alert.alert('Xóa thất bại', friendlyErrorMessage(err));
          }
        },
      },
    ]);
  };

  const playLine = (lineId: string, text: string, language: string) => {
    if (playingLineId === lineId) {
      Speech.stop();
      setPlayingLineId(null);
      return;
    }

    Speech.stop();
    setPlayingLineId(lineId);
    Speech.speak(text, {
      language: language || undefined,
      onDone: () => setPlayingLineId(null),
      onStopped: () => setPlayingLineId(null),
      onError: () => setPlayingLineId(null),
    });
  };

  if (loading) {
    return (
      <LinearGradient
        colors={['#3a5068', '#4a7080', '#b8906a', '#d4957a']}
        locations={[0, 0.35, 0.7, 1]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={styles.gradient}
      >
        <SafeAreaView style={styles.safeArea}>
          <View style={styles.centerBox}>
            <ActivityIndicator color={Colors.white} />
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

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
            <Ionicons name="chevron-back" size={22} color={Colors.white} />
          </TouchableOpacity>
          <View style={styles.titleContainer}>
            {isEditing ? (
              <TextInput
                style={styles.titleInput}
                value={title}
                onChangeText={setTitle}
                onBlur={() => setIsEditing(false)}
                autoFocus
              />
            ) : (
              <TouchableOpacity onPress={() => setIsEditing(true)} style={styles.titleRow}>
                <Text style={styles.headerTitle} numberOfLines={1}>{title || 'Chi tiết lịch sử'}</Text>
                <Ionicons name="pencil" size={14} color="rgba(255,255,255,0.5)" />
              </TouchableOpacity>
            )}
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={handleDelete} style={styles.actionBtn}>
              <Ionicons name="trash-outline" size={20} color={Colors.accent} />
            </TouchableOpacity>
          </View>
        </View>

        {!!detail && (
          <View style={styles.metaBar}>
            <View style={styles.sourceBadge}>
              <Text style={styles.sourceBadgeText}>{historySourceLabel}</Text>
            </View>
            <Text style={styles.metaText}>{detail.date}</Text>
            <View style={styles.metaDot} />
            <Text style={styles.metaText}>{detail.lineCount} lượt</Text>
            <View style={styles.metaDot} />
            <Text style={styles.metaText}>Phiên {detail.sessionId.slice(0, 8)}</Text>
          </View>
        )}

        <ScrollView
          style={styles.transcriptScroll}
          contentContainerStyle={styles.transcriptContent}
          showsVerticalScrollIndicator={false}
        >
          {!!error && <Text style={styles.errorText}>{error}</Text>}
          {!!detail && <Text style={styles.sourceHint}>{historySourceHint}</Text>}

          {!detail?.items?.length ? (
            <Text style={styles.emptyText}>Không có dữ liệu transcript.</Text>
          ) : (
            detail.items.map((line) => {
              const isMine = viewerRoleHint
                ? speakerRole(line.speaker_identity) === viewerRoleHint
                : false;
              const playbackText = line.translated_text || line.source_text || '';
              const playbackLang = line.translated_text ? line.target_lang : line.source_lang;
              const playId = `${line.id}:play`;
              return (
                <View
                  key={`${line.id}`}
                  style={[styles.lineWrapper, isMine ? styles.lineRight : styles.lineLeft]}
                >
                  <Text style={[styles.speakerLabel, isMine ? { textAlign: 'right' } : {}]}>
                    {line.speaker_identity} · {new Date(line.created_at).toLocaleTimeString()}
                  </Text>

                  <View style={[styles.bubble, isMine ? styles.bubbleMe : styles.bubbleOther]}>
                    <Text style={styles.originalText}>{line.source_text || '(empty source)'}</Text>
                  </View>

                  {!!line.translated_text && (
                    <View style={[styles.translatedBubble, isMine ? styles.tRight : styles.tLeft]}>
                      <Ionicons name="language" size={11} color={Colors.primaryLight} />
                      <Text style={styles.translatedText}>{line.translated_text}</Text>
                    </View>
                  )}

                  {!!playbackText && (
                    <TouchableOpacity
                      style={[styles.playBtn, isMine ? styles.playRight : styles.playLeft]}
                      onPress={() => playLine(playId, playbackText, playbackLang)}
                      activeOpacity={0.75}
                    >
                      <Ionicons
                        name={playingLineId === playId ? 'stop' : 'volume-high-outline'}
                        size={14}
                        color={Colors.white}
                      />
                      <Text style={styles.playText}>
                        {playingLineId === playId ? 'Dừng phát' : 'Nghe lại'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safeArea: { flex: 1 },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.sm,
    gap: Spacing.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainer: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.bold,
    color: Colors.white,
    flex: 1,
  },
  titleInput: {
    fontSize: Typography.base,
    color: Colors.white,
    borderBottomWidth: 1,
    borderBottomColor: Colors.primaryLight,
    paddingVertical: 2,
  },
  headerActions: { flexDirection: 'row', gap: 4 },
  actionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  metaBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.sm,
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  sourceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  sourceBadgeText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: Typography.semibold,
  },
  metaText: { fontSize: Typography.xs, color: 'rgba(255,255,255,0.55)' },
  metaDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  transcriptScroll: { flex: 1 },
  transcriptContent: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing['3xl'],
  },
  lineWrapper: {
    marginBottom: Spacing.lg,
    maxWidth: '90%',
  },
  lineLeft: { alignSelf: 'flex-start' },
  lineRight: { alignSelf: 'flex-end' },
  speakerLabel: {
    fontSize: Typography.xs,
    color: 'rgba(255,255,255,0.45)',
    marginBottom: 4,
  },
  bubble: {
    borderRadius: BorderRadius.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    marginBottom: 4,
  },
  bubbleMe: {
    backgroundColor: 'rgba(21,101,192,0.65)',
    borderBottomRightRadius: 4,
  },
  bubbleOther: {
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderBottomLeftRadius: 4,
  },
  originalText: {
    fontSize: Typography.sm,
    color: Colors.white,
    fontWeight: Typography.medium,
    lineHeight: 20,
  },
  translatedBubble: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 4,
  },
  tRight: { justifyContent: 'flex-end' },
  tLeft: { justifyContent: 'flex-start' },
  translatedText: {
    fontSize: Typography.xs,
    color: 'rgba(255,255,255,0.55)',
    fontStyle: 'italic',
    lineHeight: 17,
    flex: 1,
  },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  playRight: { alignSelf: 'flex-end' },
  playLeft: { alignSelf: 'flex-start' },
  playText: {
    color: Colors.white,
    fontSize: Typography.xs,
    fontWeight: Typography.semibold,
  },
  emptyText: {
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    paddingTop: Spacing.lg,
  },
  errorText: {
    color: '#ffd0d0',
    marginBottom: Spacing.base,
  },
  sourceHint: {
    color: 'rgba(255,255,255,0.72)',
    marginBottom: Spacing.base,
    lineHeight: 20,
  },
});
