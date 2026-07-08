import React, { useRef, useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Platform, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useGame } from '@/contexts/GameContext';
import { ScoreBoard } from '@/components/ScoreBoard';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSounds } from '@/hooks/useSounds';
import { addLeaderboardEntry } from '@/lib/leaderboard';

export default function ResultsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { state, resetGame } = useGame();
  const { playFanfare } = useSounds(state.isMuted);

  // Keep a ref to the latest playFanfare so the mount-effect can call
  // the fully-initialised version even if the audio player resolves after
  // the first render.
  const playFanfareRef = useRef(playFanfare);
  playFanfareRef.current = playFanfare;

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const [s0, s1] = state.scores;
  const isTie    = s0 === s1;

  const scale   = useRef(new Animated.Value(0.5)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  const [winnerNameInput, setWinnerNameInput] = useState('');
  const [saved, setSaved]                     = useState(false);
  const [saving, setSaving]                   = useState(false);
  const [savedIsNewRecord, setSavedIsNewRecord] = useState(false);

  // If tied, redirect to tiebreaker immediately
  useEffect(() => {
    if (isTie) {
      router.replace('/tiebreaker');
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Small delay so the native audio player finishes initialising before we
    // call play — the ref always points to the latest (post-load) instance.
    const fanfareTimer = setTimeout(() => playFanfareRef.current(), 600);
    Animated.parallel([
      Animated.spring(scale,   { toValue: 1, useNativeDriver: true, tension: 60, friction: 7 }),
      Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();
    return () => clearTimeout(fanfareTimer);
  }, []);

  // Render nothing while redirecting in tie case
  if (isTie) return null;

  const winnerIdx   : 0 | 1 = s0 > s1 ? 0 : 1;
  const winnerName  = state.players[winnerIdx];
  const winnerColor = winnerIdx === 0 ? '#7B2FFF' : '#00E5FF';
  const winnerScore = state.scores[winnerIdx];

  const handleSaveToLeaderboard = async () => {
    if (saving || saved) return;
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const result = await addLeaderboardEntry(
        (winnerNameInput.trim() || winnerName).slice(0, 20),
        winnerScore,
      );
      if (result) {
        setSaved(true);
        setSavedIsNewRecord(result.isNewRecord);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err) {
      console.warn('[results] Failed to save leaderboard entry:', err);
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
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient
        colors={[`${winnerColor}18`, '#050510', `${winnerColor}10`]}
        style={StyleSheet.absoluteFill}
      />
      <View style={[styles.glow, { backgroundColor: winnerColor }]} />

      <View style={[styles.content, { paddingTop: topPad + 20, paddingBottom: botPad + 30 }]}>
        {/* Trophy */}
        <Animated.View style={[styles.trophyWrap, { transform: [{ scale }], opacity }]}>
          <View style={[styles.trophyCircle, { borderColor: winnerColor }]}>
            <Ionicons name="trophy" size={64} color={winnerColor} />
          </View>
        </Animated.View>

        {/* Winner */}
        <Animated.View style={[styles.resultBox, { opacity }]}>
          <Text style={[styles.congratsTxt, { color: colors.mutedForeground }]}>🏆 الفائز هو</Text>
          <Text style={[styles.winnerName, { color: winnerColor }]}>{winnerName}</Text>
          <Text style={[styles.winnerScore, { color: colors.primary }]}>{winnerScore} نقطة</Text>
        </Animated.View>

        {/* Scoreboard */}
        <Animated.View style={[styles.scoreWrap, { opacity }]}>
          <ScoreBoard players={state.players} scores={state.scores} />
        </Animated.View>

        {/* Breakdown */}
        <Animated.View style={[styles.breakdown, { opacity, backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.breakdownTitle, { color: colors.mutedForeground }]}>النتيجة النهائية</Text>
          {state.players.map((name, i) => (
            <View key={i} style={[styles.breakdownRow, { borderColor: i === 0 ? '#7B2FFF' : '#00E5FF' }]}>
              <Text style={[styles.breakdownScore, { color: i === 0 ? '#7B2FFF' : '#00E5FF' }]}>
                {state.scores[i]}
              </Text>
              <Text style={[styles.breakdownName, { color: colors.foreground }]}>{name}</Text>
            </View>
          ))}
        </Animated.View>

        {/* Leaderboard name entry */}
        <Animated.View style={[styles.leaderboardCard, { opacity, borderColor: '#FFD700', backgroundColor: 'rgba(255,215,0,0.06)' }]}>
          {saved ? (
            <View style={styles.savedRow}>
              <Ionicons name="checkmark-circle" size={22} color="#00C853" />
              <Text style={[styles.savedTxt, { color: '#00C853' }]}>
                {savedIsNewRecord ? '🏆 رقم قياسي جديد على العرش!' : '✅ تم تسجيلك على عرش الأبطال!'}
              </Text>
            </View>
          ) : (
            <>
              <Text style={[styles.leaderboardLbl, { color: '#FFD700' }]}>
                🏆 سجّل اسمك على عرش الأبطال
              </Text>
              <View style={[styles.nameInputRow, { borderColor: '#FFD700' }]}>
                <Ionicons name="person-circle" size={22} color="#FFD700" />
                <TextInput
                  value={winnerNameInput}
                  onChangeText={setWinnerNameInput}
                  placeholder={winnerName}
                  placeholderTextColor={colors.mutedForeground}
                  style={[styles.nameInput, { color: colors.foreground }]}
                  textAlign="right"
                  maxLength={20}
                  returnKeyType="done"
                />
              </View>
              <TouchableOpacity onPress={handleSaveToLeaderboard} activeOpacity={0.85} disabled={saving}>
                <LinearGradient
                  colors={['#FFD700', '#FFA500']}
                  style={styles.saveBtn}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                >
                  <Ionicons name="trophy" size={18} color="#050510" />
                  <Text style={styles.saveBtnTxt}>{saving ? '...جارٍ الحفظ' : 'أضف إلى لوحة الصدارة'}</Text>
                </LinearGradient>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>

        <View style={{ flex: 1 }} />

        <TouchableOpacity onPress={handlePlayAgain} activeOpacity={0.85}>
          <LinearGradient
            colors={['#FFD700', '#FFA500']}
            style={styles.playAgainBtn}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          >
            <Ionicons name="refresh" size={24} color="#050510" />
            <Text style={styles.playAgainTxt}>العب مجددًا</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  glow: {
    position: 'absolute', top: '10%', alignSelf: 'center',
    width: 250, height: 250, borderRadius: 125, opacity: 0.12,
  },
  content: { flex: 1, paddingHorizontal: 22, gap: 22, alignItems: 'center' },
  trophyWrap: { alignItems: 'center' },
  trophyCircle: {
    width: 130, height: 130, borderRadius: 65, borderWidth: 3,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A22',
    shadowOpacity: 0.6, shadowRadius: 30, shadowOffset: { width: 0, height: 0 }, elevation: 20,
  },
  resultBox: { alignItems: 'center', gap: 8 },
  congratsTxt: { fontSize: 16, fontFamily: 'Inter_500Medium', letterSpacing: 1 },
  winnerName: { fontSize: 42, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  winnerScore: { fontSize: 24, fontFamily: 'Inter_700Bold' },
  scoreWrap: { width: '100%' },
  breakdown: { width: '100%', borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  breakdownTitle: { fontSize: 12, fontFamily: 'Inter_500Medium', textAlign: 'center', letterSpacing: 1.5 },
  breakdownRow: {
    flexDirection: 'row-reverse', alignItems: 'center',
    justifyContent: 'space-between', borderRadius: 10,
    borderWidth: 1, paddingVertical: 10, paddingHorizontal: 14,
  },
  breakdownScore: { fontSize: 26, fontFamily: 'Inter_700Bold' },
  breakdownName: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  playAgainBtn: {
    width: '100%', paddingVertical: 18, borderRadius: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    shadowColor: '#FFD700', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55, shadowRadius: 24, elevation: 16,
  },
  playAgainTxt: { fontSize: 22, fontFamily: 'Inter_700Bold', color: '#050510' },
  leaderboardCard: { width: '100%', borderRadius: 18, borderWidth: 1.5, padding: 16, gap: 12 },
  leaderboardLbl: { fontSize: 14, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  nameInputRow: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
    borderRadius: 14, borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  nameInput: { flex: 1, fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 13, borderRadius: 14,
  },
  saveBtnTxt: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#050510' },
  savedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 4 },
  savedTxt: { fontSize: 15, fontFamily: 'Inter_700Bold' },
});
