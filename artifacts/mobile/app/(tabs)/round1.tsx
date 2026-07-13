import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useGame } from '@/contexts/GameContext';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSounds } from '@/hooks/useSounds';

const MAX_STRIKES = 3;
type Phase = 'intro' | 'playing' | 'question_result';

export default function Round1Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { state, addScore, nextRound } = useGame();
  const { playCorrect, playWrong } = useSounds(state.isMuted);

  const questions = state.pingPongQuestions;

  const [phase, setPhase] = useState<Phase>('intro');
  const [qIndex, setQIndex] = useState(0);
  const [currentTurn, setCurrentTurn] = useState<0 | 1>(0);
  const [strikes, setStrikes] = useState<[number, number]>([0, 0]);
  const [passUsed, setPassUsed] = useState<[boolean, boolean]>([false, false]);
  const [givenAnswers, setGivenAnswers] = useState<string[]>([]);
  const [roundScores, setRoundScores] = useState<[number, number]>([0, 0]);
  const [lastWinner, setLastWinner] = useState<0 | 1 | null>(null);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const currentQ = questions[qIndex];
  const p1Color = '#7B2FFF';
  const p2Color = '#00E5FF';
  const activeColor = currentTurn === 0 ? p1Color : p2Color;

  const resetQuestionState = useCallback(() => {
    setCurrentTurn(0);
    setStrikes([0, 0]);
    setPassUsed([false, false]);
    setGivenAnswers([]);
    setLastWinner(null);
  }, []);

  const endQuestion = useCallback((winner: 0 | 1 | null, ns: [number, number]) => {
    setLastWinner(winner);
    setPhase('question_result');
    if (winner !== null) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  }, []);

  // Mark a specific valid answer as given by the current player.
  // Used both by the answer-chip tap and the generic "صحيح" button (which picks
  // the first still-available answer so the host doesn't need to scroll).
  const handleCorrectWithAnswer = useCallback((answer: string) => {
    if (!currentQ || givenAnswers.includes(answer)) return;
    playCorrect();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const newGiven = [...givenAnswers, answer];
    setGivenAnswers(newGiven);

    if (newGiven.length >= (currentQ?.validAnswers?.length ?? 0)) {
      endQuestion(null, roundScores);
    } else {
      setCurrentTurn(t => (t === 0 ? 1 : 0));
    }
  }, [givenAnswers, currentQ, roundScores, endQuestion, playCorrect]);

  // Manual override — host confirms the player gave a valid answer not in the list.
  // MUST NOT touch givenAnswers or auto-reveal any chip; just switch the turn.
  const handleCorrect = useCallback(() => {
    if (!currentQ) return;
    playCorrect();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCurrentTurn(t => (t === 0 ? 1 : 0));
  }, [currentQ, playCorrect]);

  const handleWrong = useCallback(() => {
    playWrong();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    const ns: [number, number] = [strikes[0], strikes[1]];
    ns[currentTurn]++;
    setStrikes(ns);

    if (ns[currentTurn] >= MAX_STRIKES) {
      const winner: 0 | 1 = currentTurn === 0 ? 1 : 0;
      const newScores: [number, number] = [roundScores[0], roundScores[1]];
      newScores[winner]++;
      setRoundScores(newScores);
      endQuestion(winner, newScores);
    } else {
      setCurrentTurn(t => (t === 0 ? 1 : 0));
    }
  }, [currentTurn, strikes, roundScores, endQuestion]);

  const handlePass = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const np: [boolean, boolean] = [passUsed[0], passUsed[1]];
    np[currentTurn] = true;
    setPassUsed(np);
    setCurrentTurn(t => (t === 0 ? 1 : 0));
  }, [currentTurn, passUsed]);

  const handleNextQuestion = useCallback(() => {
    resetQuestionState();
    if (qIndex >= questions.length - 1) {
      if (roundScores[0] > 0) addScore(0, roundScores[0]);
      if (roundScores[1] > 0) addScore(1, roundScores[1]);
      nextRound();
      router.back();
    } else {
      setQIndex(i => i + 1);
      setPhase('playing');
    }
  }, [qIndex, questions.length, roundScores, addScore, nextRound, router, resetQuestionState]);

  // ── Safety guard — data not yet ready ─────────────────────────────────────
  if (!questions?.length) {
    return (
      <View style={[styles.root, { backgroundColor: '#050510', alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: '#555', fontSize: 16, textAlign: 'center' }}>جارٍ تحضير الأسئلة...</Text>
      </View>
    );
  }

  // ── Intro ──────────────────────────────────────────────────────────────────
  if (phase === 'intro') {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <LinearGradient colors={['#050510', '#1A0030', '#050510']} style={StyleSheet.absoluteFill} />
        <View style={[styles.center, { paddingTop: topPad, paddingBottom: botPad }]}>
          <View style={[styles.badge, { borderColor: p1Color }]}>
            <MaterialCommunityIcons name="table-tennis" size={52} color={p1Color} />
          </View>
          <Text style={[styles.roundTag, { color: colors.mutedForeground }]}>الجولة الأولى</Text>
          <Text style={[styles.roundTitle, { color: p1Color }]}>ماذا تعرف</Text>
          <Text style={[styles.desc, { color: colors.mutedForeground }]}>
            {'بينغ بونغ للإجابات\n\nالسؤال يُقدَّم للاعبَين معًا، يتناوبان في الإجابة\nكل لاعب لديه ٣ ضربات — إذا وصل إليها يخسر النقطة\nكل لاعب لديه سكيب واحد مجاني في كل سؤال'}
          </Text>
          <View style={[styles.playersRow]}>
            <View style={[styles.playerCard, { borderColor: p1Color, backgroundColor: `${p1Color}15` }]}>
              <MaterialCommunityIcons name="account" size={24} color={p1Color} />
              <Text style={[styles.playerCardName, { color: p1Color }]}>{state.players[0]}</Text>
            </View>
            <Text style={[styles.vsText, { color: colors.mutedForeground }]}>VS</Text>
            <View style={[styles.playerCard, { borderColor: p2Color, backgroundColor: `${p2Color}15` }]}>
              <MaterialCommunityIcons name="account" size={24} color={p2Color} />
              <Text style={[styles.playerCardName, { color: p2Color }]}>{state.players[1]}</Text>
            </View>
          </View>
          <TouchableOpacity onPress={() => setPhase('playing')} activeOpacity={0.85} style={styles.fullW}>
            <LinearGradient colors={[p1Color, `${p1Color}AA`]} style={styles.startBtn}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Ionicons name="play" size={22} color="#FFF" />
              <Text style={styles.startBtnTxt}>ابدأ الجولة</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Question Result ────────────────────────────────────────────────────────
  if (phase === 'question_result') {
    const winnerColor = lastWinner === null ? '#FFD700' : (lastWinner === 0 ? p1Color : p2Color);
    const winnerLabel = lastWinner === null
      ? 'تعادل — لا نقطة'
      : `فاز ${state.players[lastWinner]} بالنقطة!`;
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <LinearGradient colors={['#050510', '#001A0A', '#050510']} style={StyleSheet.absoluteFill} />
        <View style={[styles.center, { paddingTop: topPad, paddingBottom: botPad }]}>
          <Ionicons
            name={lastWinner !== null ? 'trophy' : 'remove-circle-outline'}
            size={64}
            color={winnerColor}
          />
          <Text style={[styles.resultLabel, { color: colors.mutedForeground }]}>
            السؤال {qIndex + 1} من {questions.length}
          </Text>
          <Text style={[styles.resultWinner, { color: winnerColor }]}>{winnerLabel}</Text>

          <View style={styles.scoreSnapRow}>
            <View style={[styles.scoreSnapCard, { borderColor: p1Color }]}>
              <Text style={[styles.scoreSnapName, { color: p1Color }]}>{state.players[0]}</Text>
              <Text style={[styles.scoreSnapPts, { color: p1Color }]}>{roundScores[0]} نقطة</Text>
            </View>
            <View style={[styles.scoreSnapCard, { borderColor: p2Color }]}>
              <Text style={[styles.scoreSnapName, { color: p2Color }]}>{state.players[1]}</Text>
              <Text style={[styles.scoreSnapPts, { color: p2Color }]}>{roundScores[1]} نقطة</Text>
            </View>
          </View>

          <TouchableOpacity onPress={handleNextQuestion} activeOpacity={0.85} style={styles.fullW}>
            <LinearGradient
              colors={qIndex >= questions.length - 1 ? ['#00C853', '#009624'] : [p1Color, `${p1Color}AA`]}
              style={styles.startBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Ionicons name={qIndex >= questions.length - 1 ? 'checkmark-done' : 'arrow-forward'} size={22} color="#FFF" />
              <Text style={styles.startBtnTxt}>
                {qIndex >= questions.length - 1 ? 'انهاء الجولة' : 'السؤال التالي'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Playing ────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={['#050510', '#08082A', '#050510']} style={StyleSheet.absoluteFill} />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.playContent, { paddingTop: topPad + 12, paddingBottom: botPad + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.headerRow}>
          <View style={[styles.qPill, { borderColor: activeColor }]}>
            <Text style={[styles.qPillTxt, { color: activeColor }]}>
              سؤال {qIndex + 1} / {questions.length}
            </Text>
          </View>
          <View style={styles.miniScores}>
            <Text style={[styles.miniScoreTxt, { color: p1Color }]}>{roundScores[0]}</Text>
            <Text style={[styles.miniScoreSep, { color: colors.mutedForeground }]}>—</Text>
            <Text style={[styles.miniScoreTxt, { color: p2Color }]}>{roundScores[1]}</Text>
          </View>
        </View>

        {/* Players Status */}
        <View style={styles.playersStatus}>
          {([0, 1] as const).map((p) => {
            const pc = p === 0 ? p1Color : p2Color;
            const isActive = currentTurn === p;
            return (
              <View key={p} style={[
                styles.playerStatus,
                {
                  borderColor: isActive ? pc : colors.border,
                  backgroundColor: isActive ? `${pc}15` : colors.card,
                },
              ]}>
                <Text style={[styles.playerStatusName, { color: isActive ? pc : colors.mutedForeground }]}>
                  {state.players[p]}
                  {isActive ? ' 🎙' : ''}
                </Text>
                <View style={styles.strikesRow}>
                  {[0, 1, 2].map(i => (
                    <Text key={i} style={[styles.strikeIcon, { opacity: i < strikes[p] ? 1 : 0.2 }]}>
                      ❌
                    </Text>
                  ))}
                </View>
                {passUsed[p] && (
                  <View style={[styles.passUsedBadge, { backgroundColor: `${pc}20` }]}>
                    <Text style={[styles.passUsedTxt, { color: pc }]}>استُهلك السكيب</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>

        {/* Question */}
        <View style={[styles.qCard, { backgroundColor: colors.card, borderColor: activeColor }]}>
          <Text style={[styles.qLabel, { color: activeColor }]}>السؤال</Text>
          <Text style={[styles.qTxt, { color: colors.foreground }]}>{currentQ?.question}</Text>
        </View>

        {/* Current turn label */}
        <View style={[styles.turnBanner, { backgroundColor: `${activeColor}18`, borderColor: activeColor }]}>
          <MaterialCommunityIcons name="microphone" size={18} color={activeColor} />
          <Text style={[styles.turnBannerTxt, { color: activeColor }]}>
            دور {state.players[currentTurn]}
          </Text>
        </View>

        {/* Controls */}
        <View style={styles.controlsRow}>
          <TouchableOpacity onPress={handleWrong} activeOpacity={0.85} style={{ flex: 1 }}>
            <LinearGradient colors={['#FF3B3B', '#CC1010']} style={styles.controlBtn}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Ionicons name="close-circle" size={22} color="#FFF" />
              <Text style={styles.controlBtnTxt}>خطأ ❌</Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={passUsed[currentTurn] ? undefined : handlePass}
            activeOpacity={passUsed[currentTurn] ? 1 : 0.85}
            style={styles.passBtn}
          >
            <View style={[
              styles.passBtnInner,
              {
                borderColor: passUsed[currentTurn] ? colors.border : '#FFD700',
                backgroundColor: passUsed[currentTurn] ? colors.muted : 'rgba(255,215,0,0.1)',
                opacity: passUsed[currentTurn] ? 0.4 : 1,
              },
            ]}>
              <Ionicons name="arrow-forward-circle" size={20} color={passUsed[currentTurn] ? colors.mutedForeground : '#FFD700'} />
              <Text style={[styles.passBtnTxt, { color: passUsed[currentTurn] ? colors.mutedForeground : '#FFD700' }]}>
                سكيب
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleCorrect} activeOpacity={0.85} style={{ flex: 1 }}>
            <LinearGradient colors={['#00C853', '#009624']} style={styles.controlBtn}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Ionicons name="checkmark-circle" size={22} color="#FFF" />
              <Text style={styles.controlBtnTxt}>صحيح ✓</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Valid answers — host taps to mark each one as given */}
        <View style={[styles.answersSection, { backgroundColor: 'rgba(255,215,0,0.05)', borderColor: '#FFD700' }]}>
          <Text style={[styles.answersTitle, { color: '#FFD700' }]}>
            👁 اضغط على الإجابة الصحيحة لتسجيلها ({currentQ?.validAnswers?.length ?? 0} إجابة)
          </Text>
          <View style={styles.answersList}>
            {(currentQ?.validAnswers ?? []).map((ans, i) => {
              const isGiven = givenAnswers.includes(ans);
              return (
                <TouchableOpacity
                  key={i}
                  onPress={() => handleCorrectWithAnswer(ans)}
                  disabled={isGiven}
                  activeOpacity={isGiven ? 1 : 0.7}
                >
                  <View style={[
                    styles.answerChip,
                    {
                      backgroundColor: isGiven ? 'rgba(0,200,83,0.2)' : `${colors.card}`,
                      borderColor: isGiven ? '#00C853' : '#FFD700',
                    },
                  ]}>
                    <Text style={[
                      styles.answerChipTxt,
                      { color: isGiven ? '#00C853' : colors.foreground },
                    ]}>
                      {isGiven ? '✓ ' : ''}{ans}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 18 },
  fullW: { width: '100%' },
  badge: { width: 110, height: 110, borderRadius: 55, borderWidth: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A22' },
  roundTag: { fontSize: 13, fontFamily: 'Inter_500Medium', letterSpacing: 1 },
  roundTitle: { fontSize: 40, fontFamily: 'Inter_700Bold' },
  desc: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 24 },
  playersRow: { flexDirection: 'row', alignItems: 'center', gap: 12, width: '100%' },
  playerCard: { flex: 1, borderRadius: 14, borderWidth: 1.5, padding: 12, alignItems: 'center', gap: 6 },
  playerCardName: { fontSize: 14, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  vsText: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  startBtn: { paddingVertical: 16, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  startBtnTxt: { fontSize: 20, fontFamily: 'Inter_700Bold', color: '#FFF' },
  // Result
  resultLabel: { fontSize: 13, fontFamily: 'Inter_500Medium', letterSpacing: 1 },
  resultWinner: { fontSize: 28, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  scoreSnapRow: { flexDirection: 'row', gap: 12, width: '100%' },
  scoreSnapCard: { flex: 1, borderRadius: 14, borderWidth: 1.5, padding: 14, alignItems: 'center', gap: 4 },
  scoreSnapName: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  scoreSnapPts: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  // Playing
  playContent: { paddingHorizontal: 18, gap: 14 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  qPill: { borderRadius: 20, borderWidth: 1.5, paddingVertical: 6, paddingHorizontal: 14 },
  qPillTxt: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  miniScores: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  miniScoreTxt: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  miniScoreSep: { fontSize: 14 },
  playersStatus: { flexDirection: 'row', gap: 10 },
  playerStatus: { flex: 1, borderRadius: 14, borderWidth: 1.5, padding: 12, alignItems: 'center', gap: 8 },
  playerStatusName: { fontSize: 13, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  strikesRow: { flexDirection: 'row', gap: 4 },
  strikeIcon: { fontSize: 18 },
  passUsedBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  passUsedTxt: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  qCard: { borderRadius: 20, borderWidth: 1.5, padding: 22, gap: 8, alignItems: 'flex-end' },
  qLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5 },
  qTxt: { fontSize: 20, fontFamily: 'Inter_600SemiBold', textAlign: 'right', lineHeight: 32 },
  turnBanner: { borderRadius: 14, borderWidth: 1.5, paddingVertical: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  turnBannerTxt: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  controlBtn: { paddingVertical: 16, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  controlBtnTxt: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#FFF' },
  passBtn: { width: 74 },
  passBtnInner: { borderRadius: 14, borderWidth: 1.5, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', gap: 4 },
  passBtnTxt: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  answersSection: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  answersTitle: { fontSize: 12, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  answersList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' },
  answerChip: { borderRadius: 10, borderWidth: 1, paddingVertical: 6, paddingHorizontal: 10 },
  answerChipTxt: { fontSize: 13, fontFamily: 'Inter_500Medium' },
});
