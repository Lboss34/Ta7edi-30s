/**
 * Multiplayer Results Screen
 *
 * - Shows all player scores sorted descending.
 * - If multiple players tied at the top with the same score: redirect to mp-tiebreaker.
 * - Otherwise: show winner with trophy + leaderboard save option.
 */
import React, { useRef, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Animated, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useMultiplayer, PLAYER_COLORS } from '@/contexts/MultiplayerContext';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSounds } from '@/hooks/useSounds';
import { addLeaderboardEntry } from '@/lib/leaderboard';

export default function MpResultsScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const colors  = useColors();
  const { state, resetGame } = useMultiplayer();
  const { playFanfare } = useSounds(state.isMuted);

  const playFanfareRef = useRef(playFanfare);
  playFanfareRef.current = playFanfare;

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const maxScore = Math.max(...state.scores);
  const tiedIndices = state.scores.map((s, i) => ({ s, i })).filter(({ s }) => s === maxScore).map(({ i }) => i);
  const isTie = tiedIndices.length > 1;

  const scale   = useRef(new Animated.Value(0.5)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const [saved, setSaved]                       = useState(false);
  const [saving, setSaving]                     = useState(false);
  const [savedIsNewRecord, setSavedIsNewRecord] = useState(false);

  useEffect(() => {
    if (isTie) {
      router.replace('/mp-tiebreaker');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const timer = setTimeout(() => playFanfareRef.current(), 600);
    Animated.parallel([
      Animated.spring(scale,   { toValue: 1, useNativeDriver: true, tension: 60, friction: 7 }),
      Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();
    return () => clearTimeout(timer);
  }, []);

  if (isTie) return null;

  const winnerIdx   = tiedIndices[0];
  const winnerName  = state.players[winnerIdx];
  const winnerColor = PLAYER_COLORS[winnerIdx] ?? '#FFD700';
  const winnerScore = state.scores[winnerIdx];

  // Sort players by score descending
  const sorted = state.players
    .map((name, i) => ({ name, score: state.scores[i], originalIdx: i }))
    .sort((a, b) => b.score - a.score);

  const handleSaveToLeaderboard = async () => {
    if (saving || saved) return;
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const result = await addLeaderboardEntry(winnerName.slice(0, 20), winnerScore);
      if (result) {
        setSaved(true);
        setSavedIsNewRecord(result.isNewRecord);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err) {
      console.warn('[mp-results] Failed to save leaderboard entry:', err);
    } finally {
      setSaving(false);
    }
  };

  const handlePlayAgain = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    resetGame();
    router.dismissAll();
  };

  return (
    <View style={[S.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={[`${winnerColor}18`, '#050510', `${winnerColor}10`]} style={StyleSheet.absoluteFill} />
      <View style={[S.glow, { backgroundColor: winnerColor }]} />
      <ScrollView contentContainerStyle={[S.content, { paddingTop: topPad + 20, paddingBottom: botPad + 30 }]}>
        {/* Trophy */}
        <Animated.View style={[S.trophyWrap, { transform: [{ scale }], opacity }]}>
          <View style={[S.trophyCircle, { borderColor: winnerColor }]}>
            <Ionicons name="trophy" size={64} color={winnerColor} />
          </View>
        </Animated.View>

        {/* Winner */}
        <Animated.View style={[S.resultBox, { opacity }]}>
          <Text style={[S.congratsTxt, { color: colors.mutedForeground }]}>🏆 الفائز هو</Text>
          <Text style={[S.winnerName, { color: winnerColor }]}>{winnerName}</Text>
          <Text style={[S.winnerScore, { color: '#FFD700' }]}>{winnerScore} نقطة</Text>
        </Animated.View>

        {/* All scores */}
        <Animated.View style={[S.breakdown, { opacity, backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[S.breakdownTitle, { color: colors.mutedForeground }]}>النتيجة النهائية</Text>
          {sorted.map(({ name, score, originalIdx }, rank) => {
            const pc = PLAYER_COLORS[originalIdx] ?? '#FFD700';
            const isWinner = originalIdx === winnerIdx;
            return (
              <View key={originalIdx} style={[S.breakdownRow, { borderColor: isWinner ? pc : `${pc}66` }]}>
                <Text style={[S.rankNum, { color: isWinner ? '#FFD700' : colors.mutedForeground }]}>
                  {rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `${rank + 1}.`}
                </Text>
                <Text style={[S.breakdownScore, { color: pc }]}>{score}</Text>
                <Text style={[S.breakdownName, { color: isWinner ? pc : colors.foreground }]}>{name}</Text>
              </View>
            );
          })}
        </Animated.View>

        {/* Leaderboard save */}
        <Animated.View style={[S.leaderboardCard, { opacity, borderColor: '#FFD700', backgroundColor: 'rgba(255,215,0,0.06)' }]}>
          {saved ? (
            <View style={S.savedRow}>
              <Ionicons name="checkmark-circle" size={22} color="#00C853" />
              <Text style={[S.savedTxt, { color: '#00C853' }]}>
                {savedIsNewRecord ? '🏆 رقم قياسي جديد على العرش!' : '✅ تم تسجيلك على عرش الأبطال!'}
              </Text>
            </View>
          ) : (
            <>
              <Text style={[S.leaderboardLbl, { color: '#FFD700' }]}>🏆 سجّل الفائز على عرش الأبطال</Text>
              <TouchableOpacity onPress={handleSaveToLeaderboard} activeOpacity={0.85} disabled={saving}>
                <LinearGradient colors={['#FFD700', '#FFA500']} style={S.saveBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  <Ionicons name="trophy" size={18} color="#050510" />
                  <Text style={S.saveBtnTxt}>{saving ? '...جارٍ الحفظ' : `أضف ${winnerName} إلى لوحة الصدارة`}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>

        <TouchableOpacity onPress={handlePlayAgain} activeOpacity={0.85}>
          <LinearGradient colors={['#FFD700', '#FFA500']} style={S.playAgainBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <Ionicons name="refresh" size={24} color="#050510" />
            <Text style={S.playAgainTxt}>العب مجددًا</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1 },
  glow: { position: 'absolute', top: '10%', alignSelf: 'center', width: 250, height: 250, borderRadius: 125, opacity: 0.12 },
  content: { paddingHorizontal: 22, gap: 20, alignItems: 'center' },
  trophyWrap: { alignItems: 'center' },
  trophyCircle: { width: 130, height: 130, borderRadius: 65, borderWidth: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A22', shadowOpacity: 0.6, shadowRadius: 30, shadowOffset: { width: 0, height: 0 }, elevation: 20 },
  resultBox: { alignItems: 'center', gap: 8 },
  congratsTxt: { fontSize: 16, fontFamily: 'Inter_500Medium', letterSpacing: 1 },
  winnerName: { fontSize: 42, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  winnerScore: { fontSize: 24, fontFamily: 'Inter_700Bold' },
  breakdown: { width: '100%', borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  breakdownTitle: { fontSize: 12, fontFamily: 'Inter_500Medium', textAlign: 'center', letterSpacing: 1.5 },
  breakdownRow: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, borderRadius: 10, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 14 },
  rankNum: { fontSize: 18, fontFamily: 'Inter_700Bold', width: 30, textAlign: 'center' },
  breakdownScore: { fontSize: 26, fontFamily: 'Inter_700Bold' },
  breakdownName: { fontSize: 16, fontFamily: 'Inter_600SemiBold', flex: 1, textAlign: 'right' },
  leaderboardCard: { width: '100%', borderRadius: 18, borderWidth: 1.5, padding: 16, gap: 12 },
  leaderboardLbl: { fontSize: 14, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  savedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 4 },
  savedTxt: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14 },
  saveBtnTxt: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#050510' },
  playAgainBtn: { width: '100%', paddingVertical: 18, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, shadowColor: '#FFD700', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.55, shadowRadius: 24, elevation: 16 },
  playAgainTxt: { fontSize: 22, fontFamily: 'Inter_700Bold', color: '#050510' },
});
