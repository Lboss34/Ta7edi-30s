import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, FlatList } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSounds } from '@/hooks/useSounds';
import { getLeaderboard, LeaderboardEntry } from '@/lib/leaderboard';

const RANK_STYLES: Record<number, { color: string; icon: string; label: string }> = {
  0: { color: '#FFD700', icon: 'trophy', label: '🥇' },
  1: { color: '#C0C0C0', icon: 'medal', label: '🥈' },
  2: { color: '#CD7F32', icon: 'medal', label: '🥉' },
};

function RankRow({ entry, index }: { entry: LeaderboardEntry; index: number }) {
  const colors = useColors();
  const rankStyle = RANK_STYLES[index];
  const isTop3 = !!rankStyle;
  const accentColor = isTop3 ? rankStyle.color : colors.primary;

  return (
    <View style={[
      styles.row,
      {
        backgroundColor: isTop3 ? `${rankStyle.color}12` : colors.card,
        borderColor:     isTop3 ? rankStyle.color : colors.border,
        borderWidth:     isTop3 ? 1.5 : 1,
      },
    ]}>

      {/* ── RIGHT side: rank badge + player name (RTL: rightmost = most prominent) */}
      <View style={styles.rowRight}>
        {isTop3 ? (
          <View style={[styles.medalBadge, { borderColor: rankStyle.color, backgroundColor: `${rankStyle.color}18` }]}>
            <Ionicons name={rankStyle.icon as any} size={20} color={rankStyle.color} />
          </View>
        ) : (
          <View style={[styles.rankBadge, { borderColor: colors.border }]}>
            <Text style={[styles.rankNum, { color: colors.mutedForeground }]}>{index + 1}</Text>
          </View>
        )}
        <View style={styles.rowInfo}>
          <Text style={[styles.rowName, { color: isTop3 ? rankStyle.color : colors.foreground }]} numberOfLines={1}>
            {entry.playerName}
          </Text>
          {entry.gamesWon > 1 && (
            <Text style={[styles.rowWins, { color: colors.mutedForeground }]}>
              {entry.gamesWon} انتصارات
            </Text>
          )}
        </View>
      </View>

      {/* ── LEFT side: best score */}
      <View style={styles.rowScoreCol}>
        <Text style={[styles.rowScore, { color: accentColor }]}>{entry.bestScore}</Text>
        <Text style={[styles.rowScoreLbl, { color: colors.mutedForeground }]}>أفضل</Text>
      </View>

    </View>
  );
}

export default function LeaderboardScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { playClick } = useSounds(false);

  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loaded, setLoaded]   = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [retryTick, setRetryTick] = useState(0);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      setLoaded(false);
      setLoadError(false);
      (async () => {
        try {
          const data = await getLeaderboard();
          if (!cancelled) {
            setEntries(data);
            setLoaded(true);
          }
        } catch {
          if (!cancelled) {
            setLoadError(true);
            setLoaded(true);
          }
        }
      })();
      return () => { cancelled = true; };
    }, [retryTick])
  );

  const handleRetry = () => {
    playClick();
    setRetryTick((t) => t + 1);
  };

  const handleBack = () => {
    playClick();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={['#150A00', '#050510', '#0A0020']} style={StyleSheet.absoluteFill} />
      <View style={styles.glowGold} />

      <View style={[styles.content, { paddingTop: topPad + 16, paddingBottom: botPad + 24 }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={handleBack} activeOpacity={0.8} style={[styles.backBtn, { borderColor: colors.border }]}>
            <Ionicons name="arrow-forward" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
          <View style={styles.headerTitles}>
            <Text style={[styles.headerTag, { color: colors.mutedForeground }]}>عرش الأبطال</Text>
            <Text style={[styles.headerTitle, { color: '#FFD700' }]}>لوحة الصدارة</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Crown badge */}
        <View style={styles.crownWrap}>
          <View style={styles.crownCircle}>
            <MaterialCommunityIcons name="crown" size={44} color="#FFD700" />
          </View>
        </View>

        {loaded && loadError ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="cloud-offline-outline" size={56} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>تعذّر الوصول إلى الخادم</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              تحقق من اتصالك بالإنترنت وحاول مجددًا
            </Text>
            <TouchableOpacity
              onPress={handleRetry}
              activeOpacity={0.85}
              style={[styles.backBtn, { width: 'auto', paddingHorizontal: 18, borderColor: colors.border }]}
            >
              <Text style={{ color: colors.foreground, fontFamily: 'Inter_500Medium' }}>إعادة المحاولة</Text>
            </TouchableOpacity>
          </View>
        ) : loaded && entries.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="trophy-outline" size={56} color={colors.mutedForeground} />
            <Text style={[styles.emptyTitle, { color: colors.foreground }]}>العرش شاغر بعد!</Text>
            <Text style={[styles.emptySub, { color: colors.mutedForeground }]}>
              العب مباراة وافز بها لتكون أول ملك على العرش
            </Text>
          </View>
        ) : (
          <FlatList
            data={entries}
            keyExtractor={(item, i) => `${item.playerName}-${item.lastPlayed}-${i}`}
            renderItem={({ item, index }) => <RankRow entry={item} index={index} />}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  glowGold: {
    position: 'absolute', top: '5%', alignSelf: 'center',
    width: 280, height: 280, borderRadius: 140,
    backgroundColor: '#FFD700', opacity: 0.08,
  },
  content: { flex: 1, paddingHorizontal: 20, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: {
    width: 40, height: 40, borderRadius: 14, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitles: { alignItems: 'center', gap: 2 },
  headerTag: { fontSize: 11, fontFamily: 'Inter_500Medium', letterSpacing: 2 },
  headerTitle: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  crownWrap: { alignItems: 'center', marginVertical: 4 },
  crownCircle: {
    width: 92, height: 92, borderRadius: 46, borderWidth: 3, borderColor: '#FFD700',
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,215,0,0.08)',
    shadowColor: '#FFD700', shadowOpacity: 0.6, shadowRadius: 22, shadowOffset: { width: 0, height: 0 }, elevation: 16,
  },
  list: { gap: 10, paddingBottom: 12 },
  row: {
    // Standard LTR row: scoreCol pinned to the LEFT, nameRow pinned to the RIGHT.
    // This is intentional for Arabic RTL reading — score is "far end" on left,
    // rank badge + name are on the right where the eye lands first.
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14,
  },
  // RIGHT side: rank badge + player name, laid out right-to-left inside
  rowRight: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, flex: 1 },
  rowInfo: { gap: 2 },
  rowWins: { fontSize: 11, fontFamily: 'Inter_400Regular' },
  // LEFT side: best score + "أفضل" label
  rowScoreCol: { alignItems: 'center', gap: 1, minWidth: 52 },
  rowScoreLbl: { fontSize: 10, fontFamily: 'Inter_400Regular' },
  medalBadge: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  rankBadge: {
    width: 36, height: 36, borderRadius: 18, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  rankNum: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  rowName: { fontSize: 17, fontFamily: 'Inter_700Bold', flexShrink: 1 },
  rowScore: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  emptySub: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 22 },
});
