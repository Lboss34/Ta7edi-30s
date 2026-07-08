/**
 * Multiplayer Round 1 — ماذا تعرف (Round-robin with per-round strikes)
 *
 * Rules:
 * - Players rotate in order for each answer slot.
 * - Each incorrect answer = +1 strike for that player (accumulated across the whole round).
 * - 3 strikes → player is eliminated from the round.
 * - After all questions: player(s) with the MINIMUM strikes win 1 bonus point each.
 */
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useMultiplayer, PLAYER_COLORS } from '@/contexts/MultiplayerContext';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSounds } from '@/hooks/useSounds';

const MAX_STRIKES = 3;

type Phase = 'intro' | 'playing' | 'question_result' | 'round_done';

export default function MpRound1Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { state, addScore, nextRound } = useMultiplayer();
  const { playCorrect, playWrong, playFanfare } = useSounds(state.isMuted);

  const questions = state.pingPongQuestions;
  const n = state.players.length;

  const [phase, setPhase]         = useState<Phase>('intro');
  const [qIndex, setQIndex]       = useState(0);
  const [givenAnswers, setGivenAnswers] = useState<string[]>([]);
  const [lastWinnerIdx, setLastWinnerIdx] = useState<number | null>(null);

  // Per-round accumulated strikes (reset never — they accumulate the whole round)
  const [roundStrikes, setRoundStrikes] = useState<number[]>(() => Array(n).fill(0));
  // Which players are eliminated (3 strikes)
  const [eliminated, setEliminated] = useState<boolean[]>(() => Array(n).fill(false));
  // Current turn index (into state.players)
  const [currentTurn, setCurrentTurn] = useState(0);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const currentQ = questions[qIndex];

  // Next active player after `from`
  const nextActive = useCallback((from: number, elim: boolean[]) => {
    for (let i = 1; i <= n; i++) {
      const idx = (from + i) % n;
      if (!elim[idx]) return idx;
    }
    return from; // all eliminated fallback
  }, [n]);

  const activeCount = eliminated.filter(e => !e).length;

  const handleCorrect = useCallback(() => {
    playCorrect();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    // Advance turn
    setCurrentTurn(t => nextActive(t, eliminated));
  }, [eliminated, nextActive, playCorrect]);

  const handleCorrectWithAnswer = useCallback((answer: string) => {
    if (!currentQ || givenAnswers.includes(answer)) return;
    playCorrect();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const newGiven = [...givenAnswers, answer];
    setGivenAnswers(newGiven);
    if (newGiven.length >= (currentQ.validAnswers?.length ?? 0)) {
      setLastWinnerIdx(null);
      setPhase('question_result');
    } else {
      setCurrentTurn(t => nextActive(t, eliminated));
    }
  }, [givenAnswers, currentQ, eliminated, nextActive, playCorrect]);

  const handleWrong = useCallback(() => {
    playWrong();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    const ns = [...roundStrikes];
    ns[currentTurn]++;
    const ne = [...eliminated];
    if (ns[currentTurn] >= MAX_STRIKES) {
      ne[currentTurn] = true;
    }
    setRoundStrikes(ns);
    setEliminated(ne);

    const stillActive = ne.filter(e => !e).length;
    if (stillActive === 0) {
      // All eliminated — end question with no winner
      setLastWinnerIdx(null);
      setPhase('question_result');
    } else {
      setCurrentTurn(t => nextActive(t, ne));
    }
  }, [currentTurn, roundStrikes, eliminated, nextActive, playWrong]);

  const handleNextQuestion = useCallback(() => {
    setGivenAnswers([]);
    setCurrentTurn(t => nextActive(t, eliminated));
    if (qIndex >= questions.length - 1) {
      // Round done — compute winners (min strikes)
      const minStrikes = Math.min(...roundStrikes);
      // Award 1 point to each player with min strikes
      roundStrikes.forEach((s, i) => {
        if (s === minStrikes) addScore(i, 1);
      });
      playFanfare();
      setPhase('round_done');
    } else {
      setQIndex(i => i + 1);
      setPhase('playing');
    }
  }, [qIndex, questions.length, roundStrikes, eliminated, nextActive, addScore, playFanfare]);

  const handleFinishRound = () => {
    nextRound();
    router.back();
  };

  if (!questions?.length) {
    return (
      <View style={[S.root, { backgroundColor: '#050510', alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: '#555', fontSize: 16 }}>جارٍ تحضير الأسئلة...</Text>
      </View>
    );
  }

  // ── Intro ─────────────────────────────────────────────────────────────────
  if (phase === 'intro') {
    return (
      <View style={[S.root, { backgroundColor: colors.background }]}>
        <LinearGradient colors={['#050510', '#1A0030', '#050510']} style={StyleSheet.absoluteFill} />
        <View style={[S.center, { paddingTop: topPad, paddingBottom: botPad }]}>
          <View style={[S.badge, { borderColor: '#7B2FFF' }]}>
            <MaterialCommunityIcons name="table-tennis" size={52} color="#7B2FFF" />
          </View>
          <Text style={[S.roundTag, { color: colors.mutedForeground }]}>الجولة الأولى — جماعي</Text>
          <Text style={[S.roundTitle, { color: '#7B2FFF' }]}>ماذا تعرف</Text>
          <Text style={[S.desc, { color: colors.mutedForeground }]}>
            {'اللاعبون يتناوبون على الإجابة بالدور\nكل إجابة خاطئة = إنذار\n٣ إنذارات = خروج من الجولة\nمن لديه أقل إنذارات في نهاية الجولة يفوز!'}
          </Text>
          <View style={S.playersGrid}>
            {state.players.map((name, i) => (
              <View key={i} style={[S.playerPill, { borderColor: PLAYER_COLORS[i] ?? '#FFD700', backgroundColor: `${PLAYER_COLORS[i] ?? '#FFD700'}15` }]}>
                <Text style={[S.playerPillTxt, { color: PLAYER_COLORS[i] ?? '#FFD700' }]}>{name}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity onPress={() => setPhase('playing')} activeOpacity={0.85} style={S.fullW}>
            <LinearGradient colors={['#7B2FFF', '#5B1FDF']} style={S.startBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Ionicons name="play" size={22} color="#FFF" />
              <Text style={S.startBtnTxt}>ابدأ الجولة</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Round Done ────────────────────────────────────────────────────────────
  if (phase === 'round_done') {
    const minStrikes = Math.min(...roundStrikes);
    return (
      <View style={[S.root, { backgroundColor: colors.background }]}>
        <LinearGradient colors={['#050510', '#001A30', '#050510']} style={StyleSheet.absoluteFill} />
        <View style={[S.center, { paddingTop: topPad, paddingBottom: botPad }]}>
          <Ionicons name="trophy" size={64} color="#FFD700" />
          <Text style={[S.resultLabel, { color: colors.mutedForeground }]}>نهاية الجولة الأولى</Text>
          <Text style={[S.resultWinner, { color: '#FFD700' }]}>
            {roundStrikes.filter(s => s === minStrikes).length > 1
              ? 'تعادل الفائزين 🏆'
              : `فاز ${state.players[roundStrikes.indexOf(minStrikes)]}!`}
          </Text>
          <View style={S.strikesSummary}>
            {state.players.map((name, i) => (
              <View key={i} style={[S.strikeRow, { borderColor: PLAYER_COLORS[i] ?? '#FFD700' }]}>
                <View style={{ flexDirection: 'row', gap: 3 }}>
                  {Array.from({ length: MAX_STRIKES }).map((_, k) => (
                    <Text key={k} style={{ opacity: k < roundStrikes[i] ? 1 : 0.15, fontSize: 16 }}>❌</Text>
                  ))}
                </View>
                <Text style={[S.strikeRowName, { color: PLAYER_COLORS[i] ?? '#FFD700' }]}>{name}</Text>
                {roundStrikes[i] === minStrikes && <Text style={{ fontSize: 16 }}>🏆</Text>}
              </View>
            ))}
          </View>
          <TouchableOpacity onPress={handleFinishRound} activeOpacity={0.85} style={S.fullW}>
            <LinearGradient colors={['#00C853', '#009624']} style={S.startBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Ionicons name="checkmark-done" size={22} color="#FFF" />
              <Text style={S.startBtnTxt}>التالي: المزاد</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Question Result ───────────────────────────────────────────────────────
  if (phase === 'question_result') {
    return (
      <View style={[S.root, { backgroundColor: colors.background }]}>
        <LinearGradient colors={['#050510', '#001A0A', '#050510']} style={StyleSheet.absoluteFill} />
        <View style={[S.center, { paddingTop: topPad, paddingBottom: botPad }]}>
          <Ionicons name="checkmark-done-circle" size={64} color="#00C853" />
          <Text style={[S.resultLabel, { color: colors.mutedForeground }]}>السؤال {qIndex + 1} من {questions.length}</Text>
          <Text style={[S.resultWinner, { color: '#00C853' }]}>انتهت الإجابات!</Text>
          <View style={S.strikesSummary}>
            {state.players.map((name, i) => (
              <View key={i} style={[S.strikeRow, { borderColor: eliminated[i] ? '#555' : (PLAYER_COLORS[i] ?? '#FFD700'), opacity: eliminated[i] ? 0.4 : 1 }]}>
                <View style={{ flexDirection: 'row', gap: 3 }}>
                  {Array.from({ length: MAX_STRIKES }).map((_, k) => (
                    <Text key={k} style={{ opacity: k < roundStrikes[i] ? 1 : 0.15, fontSize: 14 }}>❌</Text>
                  ))}
                </View>
                <Text style={[S.strikeRowName, { color: eliminated[i] ? '#555' : (PLAYER_COLORS[i] ?? '#FFD700') }]}>
                  {name} {eliminated[i] ? '(خرج)' : ''}
                </Text>
              </View>
            ))}
          </View>
          <TouchableOpacity onPress={handleNextQuestion} activeOpacity={0.85} style={S.fullW}>
            <LinearGradient
              colors={qIndex >= questions.length - 1 ? ['#FFD700', '#FFA500'] : ['#7B2FFF', '#5B1FDF']}
              style={S.startBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Ionicons name={qIndex >= questions.length - 1 ? 'trophy' : 'arrow-forward'} size={22}
                color={qIndex >= questions.length - 1 ? '#050510' : '#FFF'} />
              <Text style={[S.startBtnTxt, { color: qIndex >= questions.length - 1 ? '#050510' : '#FFF' }]}>
                {qIndex >= questions.length - 1 ? 'إنهاء الجولة' : 'السؤال التالي'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Playing ───────────────────────────────────────────────────────────────
  const activeColor = PLAYER_COLORS[currentTurn] ?? '#FFD700';

  return (
    <View style={[S.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={['#050510', '#08082A', '#050510']} style={StyleSheet.absoluteFill} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[S.playContent, { paddingTop: topPad + 12, paddingBottom: botPad + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={S.headerRow}>
          <View style={[S.qPill, { borderColor: activeColor }]}>
            <Text style={[S.qPillTxt, { color: activeColor }]}>سؤال {qIndex + 1} / {questions.length}</Text>
          </View>
          <Text style={[S.activeTxt, { color: colors.mutedForeground }]}>
            متبقٍ: {activeCount} لاعبين
          </Text>
        </View>

        {/* Players Status */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {state.players.map((name, i) => {
            const pc = PLAYER_COLORS[i] ?? '#FFD700';
            const isActive = currentTurn === i && !eliminated[i];
            const isElim = eliminated[i];
            return (
              <View key={i} style={[
                S.playerStatus,
                {
                  borderColor: isElim ? '#333' : isActive ? pc : colors.border,
                  backgroundColor: isElim ? '#111' : isActive ? `${pc}15` : colors.card,
                  opacity: isElim ? 0.4 : 1,
                },
              ]}>
                <Text style={[S.playerStatusName, { color: isElim ? '#555' : isActive ? pc : colors.mutedForeground }]}>
                  {name}{isActive ? ' 🎙' : ''}{isElim ? ' 🚫' : ''}
                </Text>
                <View style={{ flexDirection: 'row', gap: 2 }}>
                  {Array.from({ length: MAX_STRIKES }).map((_, k) => (
                    <Text key={k} style={{ opacity: k < roundStrikes[i] ? 1 : 0.15, fontSize: 14 }}>❌</Text>
                  ))}
                </View>
              </View>
            );
          })}
        </ScrollView>

        {/* Question */}
        <View style={[S.qCard, { backgroundColor: colors.card, borderColor: activeColor }]}>
          <Text style={[S.qLabel, { color: activeColor }]}>السؤال</Text>
          <Text style={[S.qTxt, { color: colors.foreground }]}>{currentQ?.question}</Text>
        </View>

        {/* Turn banner */}
        <View style={[S.turnBanner, { backgroundColor: `${activeColor}18`, borderColor: activeColor }]}>
          <MaterialCommunityIcons name="microphone" size={18} color={activeColor} />
          <Text style={[S.turnBannerTxt, { color: activeColor }]}>دور {state.players[currentTurn]}</Text>
        </View>

        {/* Controls */}
        <View style={S.controlsRow}>
          <TouchableOpacity onPress={handleWrong} activeOpacity={0.85} style={{ flex: 1 }}>
            <LinearGradient colors={['#FF3B3B', '#CC1010']} style={S.controlBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Ionicons name="close-circle" size={22} color="#FFF" />
              <Text style={S.controlBtnTxt}>خطأ ❌</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleCorrect} activeOpacity={0.85} style={{ flex: 1 }}>
            <LinearGradient colors={['#00C853', '#009624']} style={S.controlBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Ionicons name="checkmark-circle" size={22} color="#FFF" />
              <Text style={S.controlBtnTxt}>صحيح ✓</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Valid answers */}
        {(currentQ?.validAnswers?.length ?? 0) > 0 && (
          <View style={[S.answersSection, { backgroundColor: 'rgba(255,215,0,0.05)', borderColor: '#FFD700' }]}>
            <Text style={[S.answersTitle, { color: '#FFD700' }]}>
              👁 اضغط على الإجابة لتسجيلها ({currentQ?.validAnswers?.length ?? 0} إجابة)
            </Text>
            <View style={S.answersList}>
              {(currentQ?.validAnswers ?? []).map((ans, i) => {
                const isGiven = givenAnswers.includes(ans);
                return (
                  <TouchableOpacity key={i} onPress={() => handleCorrectWithAnswer(ans)} disabled={isGiven} activeOpacity={0.7}>
                    <View style={[S.answerChip, { backgroundColor: isGiven ? 'rgba(0,200,83,0.2)' : colors.card, borderColor: isGiven ? '#00C853' : '#FFD700' }]}>
                      <Text style={[S.answerChipTxt, { color: isGiven ? '#00C853' : colors.foreground }]}>
                        {isGiven ? '✓ ' : ''}{ans}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 16 },
  fullW: { width: '100%' },
  badge: { width: 110, height: 110, borderRadius: 55, borderWidth: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A22' },
  roundTag: { fontSize: 13, fontFamily: 'Inter_500Medium', letterSpacing: 1 },
  roundTitle: { fontSize: 38, fontFamily: 'Inter_700Bold' },
  desc: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 24 },
  playersGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  playerPill: { borderRadius: 12, borderWidth: 1.5, paddingVertical: 8, paddingHorizontal: 14 },
  playerPillTxt: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  startBtn: { paddingVertical: 16, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  startBtnTxt: { fontSize: 20, fontFamily: 'Inter_700Bold', color: '#FFF' },
  resultLabel: { fontSize: 13, fontFamily: 'Inter_500Medium', letterSpacing: 1 },
  resultWinner: { fontSize: 26, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  strikesSummary: { width: '100%', gap: 8 },
  strikeRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', borderRadius: 12, borderWidth: 1.5, paddingVertical: 10, paddingHorizontal: 14, gap: 8 },
  strikeRowName: { fontSize: 15, fontFamily: 'Inter_700Bold', flex: 1, textAlign: 'right' },
  playContent: { paddingHorizontal: 18, gap: 14 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  qPill: { borderRadius: 20, borderWidth: 1.5, paddingVertical: 6, paddingHorizontal: 14 },
  qPillTxt: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  activeTxt: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  playerStatus: { borderRadius: 14, borderWidth: 1.5, padding: 12, alignItems: 'center', gap: 6, minWidth: 90 },
  playerStatusName: { fontSize: 12, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  qCard: { borderRadius: 20, borderWidth: 1.5, padding: 22, gap: 8, alignItems: 'flex-end' },
  qLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5 },
  qTxt: { fontSize: 20, fontFamily: 'Inter_600SemiBold', textAlign: 'right', lineHeight: 32 },
  turnBanner: { borderRadius: 14, borderWidth: 1.5, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  turnBannerTxt: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  controlBtn: { paddingVertical: 16, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  controlBtnTxt: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#FFF' },
  answersSection: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  answersTitle: { fontSize: 12, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  answersList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' },
  answerChip: { borderRadius: 10, borderWidth: 1, paddingVertical: 6, paddingHorizontal: 10 },
  answerChipTxt: { fontSize: 13, fontFamily: 'Inter_500Medium' },
});
