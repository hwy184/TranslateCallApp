import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, Typography, Spacing, BorderRadius } from '../../src/constants/theme';
import { useAuthStore } from '../../src/store/authStore';
import {
  deleteAllHistoryCloud,
  deleteAllHistoryLocal,
  deleteConversation,
  deleteHistoryLocal,
  getHistory,
  getHistoryLocal,
  type ConversationHistory,
} from '../../src/services/historyService';
import { friendlyErrorMessage } from '../../src/services/errors';

export default function HistoryScreen() {
  const [history, setHistory] = useState<ConversationHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const user = useAuthStore((s) => s.user);
  const historySourceLabel = user?.type === 'registered' ? 'Đám mây' : 'Cục bộ';

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const items = user?.type === 'registered' ? await getHistory() : await getHistoryLocal();
      setHistory(items);
      setError(null);
    } catch (err: unknown) {
      setError(friendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [user?.type]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  const handleDelete = (id: string) => {
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
            await loadHistory();
          } catch (err: unknown) {
            Alert.alert('Xóa thất bại', friendlyErrorMessage(err));
          }
        },
      },
    ]);
  };

  const handleDeleteAll = () => {
    if (!history.length) return;
    Alert.alert('Xóa tất cả lịch sử', 'Bạn có chắc muốn xóa tất cả cuộc hội thoại đã lưu?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa tất cả',
        style: 'destructive',
        onPress: async () => {
          try {
            if (user?.type === 'registered') {
              await deleteAllHistoryCloud();
            } else {
              await deleteAllHistoryLocal();
            }
            await loadHistory();
          } catch (err: unknown) {
            Alert.alert('Xóa thất bại', friendlyErrorMessage(err));
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: ConversationHistory }) => (
    <TouchableOpacity
      style={styles.historyCard}
      onPress={() => router.push(`/history/${item.id}`)}
      activeOpacity={0.8}
    >
      <View style={styles.historyIcon}>
        <Ionicons name="chatbubbles-outline" size={24} color={Colors.primaryLight} />
      </View>

      <View style={styles.historyInfo}>
        <Text style={styles.historyTitle} numberOfLines={1}>{item.title}</Text>
        <Text style={styles.historyMeta}>{item.date}</Text>
          <View style={styles.historyTagsRow}>
            <View style={styles.tag}>
              <Text style={styles.tagText}>Session: {item.sessionId.slice(0, 8)}</Text>
            </View>
            <View style={styles.tag}>
              <Text style={styles.tagText}>{item.lineCount} lượt</Text>
            </View>
            <View style={styles.tag}>
              <Text style={styles.tagText}>{historySourceLabel}</Text>
            </View>
          </View>
        </View>

      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={() => handleDelete(item.id)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="trash-outline" size={18} color="rgba(229,57,53,0.7)" />
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <LinearGradient
      colors={['#8fbc8f', '#b8a882', '#c4957a', '#d4856a']}
      locations={[0, 0.3, 0.65, 1]}
      start={{ x: 0.1, y: 0 }}
      end={{ x: 0.9, y: 1 }}
      style={styles.gradient}
    >
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Lịch sử dịch</Text>
          <View style={styles.headerActions}>
            <View style={styles.sourceBadge}>
              <Text style={styles.sourceBadgeText}>{historySourceLabel}</Text>
            </View>
            {!!history.length && (
              <TouchableOpacity style={styles.syncBtn} onPress={handleDeleteAll}>
                <Ionicons name="trash-outline" size={20} color={Colors.white} />
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.syncBtn} onPress={() => void loadHistory()}>
              <Ionicons name="refresh" size={20} color={Colors.white} />
            </TouchableOpacity>
          </View>
        </View>

        {loading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator color={Colors.white} />
          </View>
        ) : (
          <FlatList
            data={history}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContent}
            ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
            ListEmptyComponent={
              <View style={styles.emptyState}>
                <Ionicons name="chatbubbles-outline" size={56} color="rgba(255,255,255,0.25)" />
                <Text style={styles.emptyTitle}>Chưa có lịch sử</Text>
                <Text style={styles.emptySubtitle}>
                  Các cuộc hội thoại sẽ được lưu tại đây sau khi kết thúc cuộc gọi.
                </Text>
              </View>
            }
          />
        )}

        {!!error && <Text style={styles.errorText}>{error}</Text>}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: { flex: 1 },
  safeArea: { flex: 1, paddingBottom: 90 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
  },
  headerTitle: {
    fontSize: Typography.xl,
    fontWeight: Typography.bold,
    color: Colors.white,
  },
  headerActions: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'center',
  },
  sourceBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
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
  syncBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.xl,
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: BorderRadius.xl,
    padding: Spacing.base,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    gap: Spacing.md,
  },
  historyIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(21,101,192,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyInfo: { flex: 1 },
  historyTitle: {
    fontSize: Typography.base,
    fontWeight: Typography.semibold,
    color: Colors.white,
    marginBottom: 2,
  },
  historyMeta: {
    fontSize: Typography.xs,
    color: 'rgba(255,255,255,0.55)',
    marginBottom: Spacing.xs,
  },
  historyTagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: BorderRadius.full,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  tagText: { fontSize: 10, color: 'rgba(255,255,255,0.65)' },
  deleteBtn: {
    padding: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    paddingHorizontal: Spacing.xl,
    gap: Spacing.md,
  },
  emptyTitle: {
    fontSize: Typography.lg,
    fontWeight: Typography.bold,
    color: 'rgba(255,255,255,0.5)',
  },
  emptySubtitle: {
    fontSize: Typography.sm,
    color: 'rgba(255,255,255,0.35)',
    textAlign: 'center',
    lineHeight: 20,
  },
  errorText: {
    color: '#ffd0d0',
    paddingHorizontal: Spacing.base,
    paddingBottom: Spacing.base,
  },
});
