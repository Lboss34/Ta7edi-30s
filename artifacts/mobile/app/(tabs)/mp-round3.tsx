/**
 * Multiplayer Round 3 — الجرس (Buzzer)
 *
 * Rules:
 * - Host reads question aloud. First player to verbally call out gets the turn.
 * - Host selects which player buzzed.
 * - If wrong: that player is barred from this question.
 * - Remaining eligible players can steal.
 * - "سؤال محروق" button if nobody knows.
 */
import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useMultiplayer, PLAYER_COLORS } from '@/contexts/MultiplayerContext';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSounds } from '@/hooks/useSounds';

type Phase = 'intro' | 'playing' | 'confirming' | 'question_result' | 'round_done';

export default function MpRound3Screen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const colors  = useColors();
  const { state, addScore, nextRound } = useMultiplayer();
  const { playCorrect, playWrong, playFanfare } = useSounds(state.isMuted);

  const questions = state.buzzerQuestions;
  const n         = state.players.length;

  const [phase, setPhase]           = useState<Phase>('intro');
  const [qIndex, setQIndex]         = useState(0);
  const [barred, setBarred]         = useState<boolean[]>(() => Array(n).fill(false));
  const [selectedPlayer, setSelectedPlayer] = useState<number | null>(null);
  const [lastResult, setLastResult] = useState<{ playerIdx: number; correct: boolean } | null>(null);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const currentQ    = questions[qIndex];
  const barredCount = barred.filter(Boolean).length;
  const allBarred   = barredCount >= n;

  const handleBuzz = (playerIdx: number) => {
    if (barred[playerIdx]) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setSelectedPlayer(playerIdx);
    setPhase('confirming');
  };

  const handleCorrect = () => {
    if (selectedPlayer === null) return;
    playCorrect();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addScore(selectedPlayer, 1);
    setLastResult({ playerIdx: selectedPlayer, correct: true });
    setPhase('question_result');
  };

  const handleWrong = () => {
    if (selectedPlayer === null) return;
    playWrong();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    const nb = [...barred];
    nb[selectedPlayer] = true;
    setBarred(nb);
    setLastResult({ playerIdx: selectedPlayer, correct: false });

    // If all are now barred, treat as burned
    if (nb.filter(Boolean).length >= n) {
      setPhase('question_result');
    } else {
      setPhase('playing'); // Others can still steal
    }
  };

  const handleBurnQuestion = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLastResult(null);
    setPhase('question_result');
  };

  const handleNextQuestion = useCallback(() => {
    setBarred(Array(n).fill(false));
    setSelectedPlayer(null);
    setLastResult(null);
    if (qIndex >= questions.length - 1) {
      playFanfare();
      setPhase('round_done');
    } else {
      setQIndex(i => i + 1);
      setPhase('playing');
    }
  }, [qIndex, questions.length, n, playFanfare]);

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
        <LinearGradient colors={['#050510', '#1A0800', '#050510']} style={StyleSheet.absoluteFill} />
        <View style={[S.center, { paddingTop: topPad, paddingBottom: botPad }]}>
          <View style={[S.badge, { borderColor: '#FF6B00' }]}>
            <Ionicons name="radio-button-on" size={52} color="#FF6B00" />
          </View>
          <Text style={[S.roundTag, { color: colors.mutedForeground }]}>الجولة الثالثة — جماعي</Text>
          <Text style={[S.roundTitle, { color: '#FF6B00' }]}>الجرس</Text>
          <Text style={[S.desc, { color: colors.mutedForeground }]}>
            {'المضيف يقرأ السؤال بصوت عالٍ\nمن ينادي أولاً يضغط المضيف على اسمه\nإذا أخطأ — يُحجب من هذا السؤال\nالباقون يمكنهم الإجابة\nسؤال محروق إذا لم يعرف أحد'}
          </Text>
          <View style={S.playersGrid}>
            {state.players.map((name, i) => (
              <View key={i} style={[S.playerPill, { borderColor: PLAYER_COLORS[i] ?? '#FFD700', backgroundColor: `${PLAYER_COLORS[i] ?? '#FFD700'}15` }]}>
                <Text style={[S.playerPillTxt, { color: PLAYER_COLORS[i] ?? '#FFD700' }]}>{name}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity onPress={() => setPhase('playing')} activeOpacity={0.85} style={S.fullW}>
            <LinearGradient colors={['#FF6B00', '#CC4400']} style={S.startBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
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
    return (
      <View style={[S.root, { backgroundColor: colors.background }]}>
        <LinearGradient colors={['#050510', '#1A0800', '#050510']} style={StyleSheet.absoluteFill} />
        <View style={[S.center, { paddingTop: topPad, paddingBottom: botPad }]}>
          <Ionicons name="trophy" size={64} color="#FF6B00" />
          <Text style={[S.roundTag, { color: colors.mutedForeground }]}>نهاية الجولة الثالثة</Text>
          <Text style={[S.roundTitle, { color: '#FF6B00' }]}>انتهى الجرس!</Text>
          <View style={S.playersGrid}>
            {state.players.map((name, i) => (
              <View key={i} style={[S.scoreCard, { borderColor: PLAYER_COLORS[i] ?? '#FFD700' }]}>
                <Text style={[S.scoreCardName, { color: PLAYER_COLORS[i] ?? '#FFD700' }]}>{name}</Text>
                <Text style={[S.scoreCardPts, { color: PLAYER_COLORS[i] ?? '#FFD700' }]}>{state.scores[i]} نقطة</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity onPress={handleFinishRound} activeOpacity={0.85} style={S.fullW}>
            <LinearGradient colors={['#00C853', '#009624']} style={S.startBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Ionicons name="checkmark-done" size={22} color="#FFF" />
              <Text style={S.startBtnTxt}>التالي: خمّن اللاعب</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Question Result ───────────────────────────────────────────────────────
  if (phase === 'question_result') {
    const burned = lastResult === null || allBarred;
    return (
      <View style={[S.root, { backgroundColor: colors.background }]}>
        <LinearGradient colors={['#050510', '#08082A', '#050510']} style={StyleSheet.absoluteFill} />
        <View style={[S.center, { paddingTop: topPad, paddingBottom: botPad }]}>
          <Ionicons
            name={burned ? 'flame' : lastResult?.correct ? 'checkmark-circle' : 'close-circle'}
            size={64}
            color={burned ? '#FF6B00' : lastResult?.correct ? '#00C853' : '#FF3B3B'}
          />
          <Text style={[S.resultWinner, {
            color: burned ? '#FF6B00' : lastResult?.correct ? '#00C853' : '#FF3B3B',
          }]}>
            {burned
              ? '🔥 سؤال محروق'
              : lastResult?.correct
                ? `✅ ${state.players[lastResult.playerIdx]} أجاب صح! +١`
                : `❌ ${state.players[lastResult!.playerIdx]} أخطأ`}
          </Text>
          <View style={[S.answerCard, { backgroundColor: colors.card, borderColor: '#FF6B00' }]}>
            <Text style={[S.answerLabel, { color: colors.mutedForeground }]}>الإجابة الصحيحة</Text>
            <Text style={[S.answerTxt, { color: colors.foreground }]}>{currentQ?.answer}</Text>
          </View>
          <Text style={[S.qProgress, { color: colors.mutedForeground }]}>
            {qIndex + 1} / {questions.length} سؤال
          </Text>
          <TouchableOpacity onPress={handleNextQuestion} activeOpacity={0.85} style={S.fullW}>
            <LinearGradient
              colors={qIndex >= questions.length - 1 ? ['#FFD700', '#FFA500'] : ['#FF6B00', '#CC4400']}
              style={S.startBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Ionicons
                name={qIndex >= questions.length - 1 ? 'trophy' : 'arrow-forward'}
                size={22}
                color={qIndex >= questions.length - 1 ? '#050510' : '#FFF'}
              />
              <Text style={[S.startBtnTxt, { color: qIndex >= questions.length - 1 ? '#050510' : '#FFF' }]}>
                {qIndex >= questions.length - 1 ? 'إنهاء الجولة' : 'السؤال التالي'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Confirming ────────────────────────────────────────────────────────────
  if (phase === 'confirming' && selectedPlayer !== null) {
    const cpColor = PLAYER_COLORS[selectedPlayer] ?? '#FFD700';
    return (
      <View style={[S.root, { backgroundColor: colors.background }]}>
        <LinearGradient colors={['#050510', '#1A0800', '#050510']} style={StyleSheet.absoluteFill} />
        <View style={[S.center, { paddingTop: topPad, paddingBottom: botPad }]}>
          <Ionicons name="radio-button-on" size={50} color="#FF6B00" />
          <Text style={[S.confirmTag, { color: colors.mutedForeground }]}>هل أجاب صح؟</Text>
          <Text style={[S.confirmPlayer, { color: cpColor }]}>{state.players[selectedPlayer]}</Text>
          <View style={[S.answerCard, { backgroundColor: colors.card, borderColor: '#FF6B00' }]}>
            <Text style={[S.answerLabel, { color: colors.mutedForeground }]}>الإجابة الصحيحة</Text>
            <Text style={[S.answerTxt, { color: colors.foreground }]}>{currentQ?.answer}</Text>
          </View>
          <View style={S.confirmBtns}>
            <TouchableOpacity onPress={handleWrong} activeOpacity={0.85} style={{ flex: 1 }}>
              <LinearGradient colors={['#FF3B3B', '#CC1010']} style={S.confirmBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Ionicons name="close-circle" size={22} color="#FFF" />
                <Text style={S.confirmBtnTxt}>خطأ — محجوب</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleCorrect} activeOpacity={0.85} style={{ flex: 1 }}>
              <LinearGradient colors={['#00C853', '#009624']} style={S.confirmBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Ionicons name="checkmark-circle" size={22} color="#FFF" />
                <Text style={S.confirmBtnTxt}>صحيح! +١</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => setPhase('playing')} activeOpacity={0.7}>
            <Text style={[S.cancelTxt, { color: colors.mutedForeground }]}>← رجوع</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Playing ───────────────────────────────────────────────────────────────
  return (
    <View style={[S.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={['#050510', '#1A0800', '#050510']} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={[S.playContent, { paddingTop: topPad + 12, paddingBottom: botPad + 24 }]}>
        <View style={S.headerRow}>
          <View style={[S.qPill, { borderColor: '#FF6B00' }]}>
            <Text style={[S.qPillTxt, { color: '#FF6B00' }]}>سؤال {qIndex + 1} / {questions.length}</Text>
          </View>
          <Text style={[S.activeTxt, { color: colors.mutedForeground }]}>
            متبقٍ: {n - barredCount} / {n}
          </Text>
        </View>

        {lastResult && !lastResult.correct && (
          <View style={[S.wrongBanner, { borderColor: '#FF3B3B', backgroundColor: 'rgba(255,59,59,0.08)' }]}>
            <Ionicons name="close-circle" size={16} color="#FF3B3B" />
            <Text style={[S.wrongBannerTxt, { color: '#FF3B3B' }]}>
              {state.players[lastResult.playerIdx]} محجوب — من يجيب؟
            </Text>
          </View>
        )}

        <View style={[S.qCard, { backgroundColor: colors.card, borderColor: '#FF6B00' }]}>
          <Text style={[S.qLabel, { color: '#FF6B00' }]}>السؤال</Text>
          <Text style={[S.qTxt, { color: colors.foreground }]}>{currentQ?.question}</Text>
        </View>

        <View style={[S.hostNote2, { borderColor: '#FF6B00', backgroundColor: 'rgba(255,107,0,0.07)' }]}>
          <Text style={[S.hostNoteTxt, { color: colors.mutedForeground }]}>👁 الإجابة — للمضيف فقط</Text>
          <Text style={[S.hostAnswerTxt, { color: '#FF6B00' }]}>{currentQ?.answer}</Text>
        </View>

        <Text style={[S.buzzLabel, { color: colors.mutedForeground }]}>اضغط على اسم من نادى أولاً:</Text>

        <View style={S.buzzGrid}>
          {state.players.map((name, i) => {
            const pc      = PLAYER_COLORS[i] ?? '#FFD700';
            const isBarred = barred[i];
            return (
              <TouchableOpacity
                key={i}
                onPress={() => handleBuzz(i)}
                activeOpacity={isBarred ? 1 : 0.85}
                disabled={isBarred}
                style={{ flex: 1, minWidth: '45%' }}
              >
                <LinearGradient
                  colors={isBarred ? ['#1A1A1A', '#111'] : [pc, `${pc}BB`]}
                  style={[S.buzzBtn, { opacity: isBarred ? 0.3 : 1 }]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                >
                  <Ionicons name={isBarred ? 'lock-closed' : 'radio-button-on'} size={24} color={isBarred ? '#555' : '#FFF'} />
                  <Text style={[S.buzzBtnTxt, { color: isBarred ? '#555' : '#FFF' }]}>
                    {name}{isBarred ? '\n(محجوب)' : ''}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity onPress={handleBurnQuestion} activeOpacity={0.8}>
          <View style={[S.burnBtn, { borderColor: '#FF6B00', backgroundColor: 'rgba(255,107,0,0.08)' }]}>
            <Ionicons name="flame" size={18} color="#FF6B00" />
            <Text style={[S.burnBtnTxt, { color: '#FF6B00' }]}>سؤال محروق 🔥</Text>
          </View>
        </TouchableOpacity>
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
  scoreCard: { borderRadius: 14, borderWidth: 1.5, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center', gap: 4 },
  scoreCardName: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  scoreCardPts: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  resultWinner: { fontSize: 24, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  answerCard: { borderRadius: 16, borderWidth: 1.5, padding: 20, alignItems: 'center', gap: 6, width: '100%' },
  answerLabel: { fontSize: 12, fontFamily: 'Inter_500Medium', letterSpacing: 1 },
  answerTxt: { fontSize: 26, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  qProgress: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  confirmTag: { fontSize: 14, fontFamily: 'Inter_500Medium', letterSpacing: 1 },
  confirmPlayer: { fontSize: 38, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  confirmBtns: { flexDirection: 'row', gap: 12, width: '100%' },
  confirmBtn: { paddingVertical: 18, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  confirmBtnTxt: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#FFF' },
  cancelTxt: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  playContent: { paddingHorizontal: 18, gap: 14 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  qPill: { borderRadius: 20, borderWidth: 1.5, paddingVertical: 6, paddingHorizontal: 14 },
  qPillTxt: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  activeTxt: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  wrongBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 14 },
  wrongBannerTxt: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  qCard: { borderRadius: 20, borderWidth: 1.5, padding: 22, gap: 8, alignItems: 'flex-end' },
  qLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5 },
  qTxt: { fontSize: 20, fontFamily: 'Inter_600SemiBold', textAlign: 'right', lineHeight: 32 },
  hostNote2: { borderRadius: 12, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center', gap: 4 },
  hostNoteTxt: { fontSize: 10, fontFamily: 'Inter_500Medium', letterSpacing: 1 },
  hostAnswerTxt: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  buzzLabel: { fontSize: 13, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  buzzGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  buzzBtn: { paddingVertical: 22, borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 8 },
  buzzBtnTxt: { fontSize: 14, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  burnBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 14, borderWidth: 1.5, paddingVertical: 12 },
  burnBtnTxt: { fontSize: 15, fontFamily: 'Inter_700Bold' },
});
