import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useSounds } from '@/hooks/useSounds';
import { useAuth } from '@/contexts/AuthContext';
import { fetchGameStats, GameStats } from '@/lib/game';

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { playClick } = useSounds(false);
  const { user, token, isLoading: authLoading } = useAuth();

  const [stats, setStats] = useState<GameStats | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const loadStats = useCallback(async () => {
    if (!token) return;
    try {
      const s = await fetchGameStats(token);
      setStats(s);
      setError(null);
    } catch (err) {
      console.warn('[profile] load failed:', err);
      setError('تعذّر تحميل الإحصائيات');
    } finally {
      setLoaded(true);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      setLoaded(false);
      loadStats();
    }, [loadStats]),
  );

  const handleBack = () => {
    playClick();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  // ── Not logged in ──────────────────────────────────────────────────────
  if (!authLoading && !user) {
    return (
      <View style={[S.root, { backgroundColor: colors.background }]}>
        <LinearGradient colors={['#0D0025', '#050510', '#000D1A']} style={StyleSheet.absoluteFill} />
        <View style={[S.centerWrap, { paddingTop: topPad + 16, paddingBottom: botPad + 24 }]}>
          <MaterialCommunityIcons name="account-circle-outline" size={64} color={colors.mutedForeground} />
          <Text style={[S.emptyTitle, { color: colors.foreground, marginTop: 16 }]}>سجّل الدخول لعرض ملفك الشخصي</Text>
          <TouchableOpacity onPress={() => router.replace('/auth-login')} activeOpacity={0.85} style={{ marginTop: 20 }}>
            <LinearGradient colors={['#FFD700', '#FFA500']} style={S.loginBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Text style={S.loginBtnTxt}>تسجيل الدخول</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const xpProgress = stats && stats.nextLevelXp > 0 ? Math.min(1, stats.xp / stats.nextLevelXp) : 0;
  const xpRemaining = stats ? Math.max(0, stats.nextLevelXp - stats.xp) : 0;

  return (
    <View style={[S.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={['#0D0025', '#050510', '#000D1A']} style={StyleSheet.absoluteFill} />
      <View style={S.glowGold} />

      <ScrollView contentContainerStyle={[S.content, { paddingTop: topPad + 16, paddingBottom: botPad + 24 }]}>
        <View style={S.header}>
          <TouchableOpacity onPress={handleBack} activeOpacity={0.8} style={[S.backBtn, { borderColor: colors.border }]}>
            <Ionicons name="arrow-forward" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
          <View style={S.headerTitles}>
            <Text style={[S.headerTag, { color: colors.mutedForeground }]}>حسابي</Text>
            <Text style={[S.headerTitle, { color: '#FFD700' }]}>الملف الشخصي</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {authLoading || !loaded ? (
          <View style={{ paddingVertical: 60, alignItems: 'center' }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <>
            {/* Avatar + name */}
            <View style={[S.card, S.identityCard, { backgroundColor: colors.card, borderColor: '#FFD700' }]}>
              <Text style={S.avatar}>{user?.avatar}</Text>
              <Text style={[S.username, { color: colors.foreground }]}>{user?.username}</Text>
              <Text style={[S.uniqueId, { color: colors.mutedForeground }]}>#{user?.uniqueId}</Text>
            </View>

            {error && (
              <View style={[S.errorBanner, { borderColor: '#FF3B3B44', backgroundColor: '#FF3B3B10' }]}>
                <Ionicons name="alert-circle" size={18} color="#FF3B3B" />
                <Text style={[S.errorTxt, { color: '#FF3B3B' }]}>{error}</Text>
              </View>
            )}

            {stats && (
              <>
                {/* Level + XP */}
                <View style={[S.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <View style={S.levelRow}>
                    <View style={[S.levelBadge, { borderColor: '#FFD700' }]}>
                      <Text style={[S.levelBadgeNum, { color: '#FFD700' }]}>{stats.level}</Text>
                    </View>
                    <View style={{ flex: 1, alignItems: 'flex-end', gap: 4 }}>
                      <Text style={[S.levelLabel, { color: colors.foreground }]}>المستوى {stats.level}</Text>
                      <Text style={[S.xpSub, { color: colors.mutedForeground }]}>
                        {xpRemaining > 0 ? `${xpRemaining} XP للمستوى التالي` : 'جاهز للترقية!'}
                      </Text>
                    </View>
                  </View>
                  <View style={[S.xpBarTrack, { backgroundColor: `${colors.border}` }]}>
                    <View style={[S.xpBarFill, { width: `${Math.round(xpProgress * 100)}%`, backgroundColor: '#FFD700' }]} />
                  </View>
                  <Text style={[S.xpNums, { color: colors.mutedForeground }]}>{stats.xp} / {stats.nextLevelXp} XP</Text>
                </View>

                {/* Total wins */}
                <View style={[S.card, S.winsCard, { backgroundColor: colors.card, borderColor: '#00C853' }]}>
                  <MaterialCommunityIcons name="trophy" size={40} color="#00C853" />
                  <View style={{ alignItems: 'flex-end', flex: 1 }}>
                    <Text style={[S.winsLabel, { color: colors.mutedForeground }]}>إجمالي الانتصارات</Text>
                    <Text style={[S.winsNum, { color: '#00C853' }]}>{stats.totalWins}</Text>
                  </View>
                </View>
              </>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1 },
  glowGold: {
    position: 'absolute', top: '10%', left: '20%',
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: '#FFD700', opacity: 0.1,
  },
  content: { paddingHorizontal: 22, gap: 16 },
  centerWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 22 },
  emptyTitle: { fontSize: 16, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  loginBtn: { paddingVertical: 16, paddingHorizontal: 32, borderRadius: 16 },
  loginBtnTxt: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#050510' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 6 },
  backBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  headerTitles: { flex: 1, alignItems: 'center' },
  headerTag: { fontSize: 11, fontFamily: 'Inter_500Medium', letterSpacing: 1.5 },
  headerTitle: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  card: { borderRadius: 20, borderWidth: 1.5, padding: 20, gap: 12 },
  identityCard: { alignItems: 'center', gap: 6 },
  avatar: { fontSize: 56 },
  username: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  uniqueId: { fontSize: 13, fontFamily: 'Inter_500Medium', letterSpacing: 1 },
  errorBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 16 },
  errorTxt: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  levelRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  levelBadge: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,215,0,0.08)' },
  levelBadgeNum: { fontSize: 24, fontFamily: 'Inter_700Bold' },
  levelLabel: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  xpSub: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  xpBarTrack: { height: 10, borderRadius: 5, overflow: 'hidden' },
  xpBarFill: { height: '100%', borderRadius: 5 },
  xpNums: { fontSize: 12, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  winsCard: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  winsLabel: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  winsNum: { fontSize: 34, fontFamily: 'Inter_700Bold' },
});
