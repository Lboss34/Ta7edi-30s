import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useGame } from '@/contexts/GameContext';
import { Timer } from '@/components/Timer';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSounds } from '@/hooks/useSounds';

type Phase = 'p1_intro' | 'p1_play' | 'transition' | 'p2_intro' | 'p2_play';

export default function Round4Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { state, addScore, nextRound } = useGame();
  const { playCorrect, playWrong, startTick, stopTick } = useSounds(state.isMuted);

  const [phase, setPhase]           = useState<Phase>('p1_intro');
  const [qIdx, setQIdx]             = useState(0);
  const [p1pts, setP1pts]           = useState(0);
  const [p2pts, setP2pts]           = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const p1Qs = state.round4Questions?.slice(0, 10) ?? [];
  const p2Qs = state.round4Questions?.slice(10, 20) ?? [];

  const isP1Playing  = phase === 'p1_play';
  const questions    = isP1Playing ? p1Qs : p2Qs;
  const allExhausted = qIdx >= questions.length;
  const currentQ     = questions.length > 0 && !allExhausted ? questions[qIdx] : undefined;

  const handleTimerDone = useCallback(() => {
    setTimerRunning(false);
    stopTick();
    if (phase === 'p1_play') {
      setPhase('transition');
    } else {
      finishRound(p1pts, p2pts);
    }
  }, [phase, p1pts, p2pts, stopTick]);

  const finishRound = (p1: number, p2: number) => {
    if (p1 > 0) addScore(0, p1);
    if (p2 > 0) addScore(1, p2);
    nextRound();
    router.back();
  };

  const advance = (scoreDelta: number) => {
    if (allExhausted) return; // all questions consumed — wait for timer
    if (isP1Playing) {
      setP1pts(v => Math.max(0, v + scoreDelta));
    } else {
      setP2pts(v => Math.max(0, v + scoreDelta));
    }
    setQIdx(prev => prev + 1); // allow going to questions.length (triggers allExhausted)
  };

  const handleCorrect = () => { playCorrect(); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); advance(1); };
  const handleWrong   = () => { playWrong();   Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);   advance(-1); };
  const handlePass    = () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);              advance(0); };

  // ── Safety guard ──────────────────────────────────────────────────────
  if (!state.round4Questions?.length) {
    return (
      <View style={{ flex: 1, backgroundColor: '#050510', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#555', fontSize: 16 }}>جارٍ تحضير الأسئلة...</Text>
      </View>
    );
  }

  // ── Intro ─────────────────────────────────────────────────────────────
  if (phase === 'p1_intro' || phase === 'p2_intro') {
    const isP1    = phase === 'p1_intro';
    const player  = state.players[isP1 ? 0 : 1];
    const color   = isP1 ? '#7B2FFF' : '#00E5FF';

    const startPlay = () => {
      setQIdx(0);
      setTimerRunning(true);
      startTick();
      setPhase(isP1 ? 'p1_play' : 'p2_play');
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    };

    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <LinearGradient colors={['#050510', `${color}15`, '#050510']} style={StyleSheet.absoluteFill} />
        <View style={[styles.center, { paddingTop: topPad, paddingBottom: botPad }]}>
          <View style={[styles.avatar, { borderColor: color }]}>
            <Text style={[styles.avatarNum, { color }]}>٣٠</Text>
          </View>
          <Text style={[styles.introTag, { color: colors.mutedForeground }]}>
            {isP1 ? 'الجولة الرابعة · تحدي الثلاثين' : 'الآن دور اللاعب الثاني'}
          </Text>
          <Text style={[styles.introPlayer, { color }]}>{player}</Text>
          <Text style={[styles.introSub, { color: colors.mutedForeground }]}>
            {'٣٠ ثانية من الأسئلة المتلاحقة\nصحيح +١ · خطأ -١ · تمرير ٠'}
          </Text>
          {phase === 'p2_intro' && (
            <View style={[styles.p1ScoreBox, { borderColor: '#7B2FFF' }]}>
              <Text style={[styles.p1ScoreTxt, { color: '#7B2FFF' }]}>
                {state.players[0]} سجّل {p1pts} نقطة
              </Text>
            </View>
          )}
          <TouchableOpacity onPress={startPlay} activeOpacity={0.85} style={styles.fullW}>
            <LinearGradient colors={['#FF3B3B', '#AA0000']} style={styles.introBtn}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Ionicons name="flash" size={24} color="#FFF" />
              <Text style={styles.introBtnTxt}>ابدأ العد التنازلي</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Transition ────────────────────────────────────────────────────────
  if (phase === 'transition') {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <LinearGradient colors={['#050510', '#00100A', '#050510']} style={StyleSheet.absoluteFill} />
        <View style={[styles.center, { paddingTop: topPad, paddingBottom: botPad }]}>
          <Ionicons name="checkmark-done-circle" size={64} color="#00C853" />
          <Text style={[styles.transTitle, { color: colors.foreground }]}>
            انتهى دور {state.players[0]}
          </Text>
          <View style={[styles.transScore, { borderColor: '#7B2FFF' }]}>
            <Text style={[styles.transScoreTxt, { color: '#7B2FFF' }]}>+{p1pts} نقطة</Text>
          </View>
          <Text style={[styles.transSub, { color: colors.mutedForeground }]}>
            الآن دور {state.players[1]}
          </Text>
          <TouchableOpacity onPress={() => setPhase('p2_intro')} activeOpacity={0.85} style={styles.fullW}>
            <LinearGradient colors={['#00E5FF', '#00A8CC']} style={styles.introBtn}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Text style={[styles.introBtnTxt, { color: '#050510' }]}>استعد للتحدي</Text>
              <Ionicons name="arrow-forward" size={22} color="#050510" />
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Playing ───────────────────────────────────────────────────────────
  const currentPlayer: 0 | 1 = isP1Playing ? 0 : 1;
  const color    = isP1Playing ? '#7B2FFF' : '#00E5FF';
  const currentPts = isP1Playing ? p1pts : p2pts;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={['#050510', '#1A0000', '#050510']} style={StyleSheet.absoluteFill} />
      <View style={[styles.content, { paddingTop: topPad + 10, paddingBottom: botPad + 16 }]}>

        <View style={styles.playHeader}>
          <View style={[styles.playerPill, { borderColor: color, backgroundColor: `${color}15` }]}>
            <Text style={[styles.playerPillTxt, { color }]}>{state.players[currentPlayer]}</Text>
          </View>
          <View style={[styles.ptsPill, { borderColor: '#FFD700' }]}>
            <Text style={[styles.ptsPillTxt, { color: colors.primary }]}>{currentPts} نقطة</Text>
          </View>
        </View>

        <View style={styles.timerWrap}>
          <Timer seconds={30} running={timerRunning} onComplete={handleTimerDone} />
        </View>

        {/* Question — hidden once all questions are exhausted */}
        {allExhausted ? (
          <View style={[styles.qCard, { backgroundColor: colors.card, borderColor: '#555', alignItems: 'center', justifyContent: 'center' }]}>
            <Ionicons name="checkmark-done-circle" size={40} color="#00C853" />
            <Text style={[styles.qTxt, { color: colors.mutedForeground, textAlign: 'center', fontSize: 16 }]}>
              انتهت الأسئلة — انتظر صفّارة الوقت
            </Text>
          </View>
        ) : (
          <>
            <View style={[styles.qCard, { backgroundColor: colors.card, borderColor: '#FF3B3B' }]}>
              <Text style={[styles.qIdx, { color: colors.mutedForeground }]}>
                س {qIdx + 1} من {questions.length}
              </Text>
              <Text style={[styles.qTxt, { color: colors.foreground }]}>{currentQ?.question}</Text>
            </View>

            {/* Answer — for host */}
            <View style={[styles.answerCard, { backgroundColor: 'rgba(255,215,0,0.06)', borderColor: '#FFD700' }]}>
              <Text style={[styles.answerLbl, { color: colors.mutedForeground }]}>الجواب (للمضيف 👁)</Text>
              <Text style={[styles.answerTxt, { color: '#FFD700' }]}>{currentQ?.answer}</Text>
            </View>
          </>
        )}

        <View style={{ flex: 1 }} />

        <View style={styles.actRow}>
          <TouchableOpacity onPress={handleWrong} activeOpacity={allExhausted ? 1 : 0.85} disabled={allExhausted} style={{ flex: 1, opacity: allExhausted ? 0.3 : 1 }}>
            <LinearGradient colors={['#FF3B3B', '#CC1010']} style={styles.actBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Ionicons name="close" size={22} color="#FFF" />
              <Text style={styles.actBtnTxt}>خطأ</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={handlePass} activeOpacity={allExhausted ? 1 : 0.85} disabled={allExhausted} style={{ flex: 0.7, opacity: allExhausted ? 0.3 : 1 }}>
            <View style={[styles.passBtn, { borderColor: colors.border, backgroundColor: colors.muted }]}>
              <Text style={[styles.passTxt, { color: colors.mutedForeground }]}>تمرير</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleCorrect} activeOpacity={allExhausted ? 1 : 0.85} disabled={allExhausted} style={{ flex: 1, opacity: allExhausted ? 0.3 : 1 }}>
            <LinearGradient colors={['#00C853', '#009624']} style={styles.actBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Ionicons name="checkmark" size={22} color="#FFF" />
              <Text style={styles.actBtnTxt}>صحيح</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 20 },
  fullW: { width: '100%' },
  avatar: { width: 110, height: 110, borderRadius: 55, borderWidth: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A22' },
  avatarNum: { fontSize: 52, fontFamily: 'Inter_700Bold', lineHeight: 60 },
  introTag: { fontSize: 13, fontFamily: 'Inter_500Medium', textAlign: 'center', letterSpacing: 1 },
  introPlayer: { fontSize: 36, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  introSub: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 24 },
  p1ScoreBox: { borderRadius: 12, borderWidth: 1.5, paddingVertical: 8, paddingHorizontal: 16 },
  p1ScoreTxt: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  introBtn: { paddingVertical: 17, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  introBtnTxt: { fontSize: 20, fontFamily: 'Inter_700Bold', color: '#FFF' },
  transTitle: { fontSize: 26, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  transScore: { borderRadius: 16, borderWidth: 2, paddingVertical: 10, paddingHorizontal: 20 },
  transScoreTxt: { fontSize: 32, fontFamily: 'Inter_700Bold' },
  transSub: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  content: { flex: 1, paddingHorizontal: 20, gap: 12 },
  playHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  playerPill: { borderRadius: 20, borderWidth: 1.5, paddingVertical: 6, paddingHorizontal: 14 },
  playerPillTxt: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  ptsPill: { borderRadius: 14, borderWidth: 1.5, paddingVertical: 6, paddingHorizontal: 12 },
  ptsPillTxt: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  timerWrap: { alignItems: 'center' },
  qCard: { borderRadius: 20, borderWidth: 1.5, padding: 20, gap: 6, alignItems: 'flex-end', minHeight: 100, justifyContent: 'center' },
  qIdx: { fontSize: 11, fontFamily: 'Inter_500Medium' },
  qTxt: { fontSize: 20, fontFamily: 'Inter_700Bold', textAlign: 'right', lineHeight: 30 },
  answerCard: { borderRadius: 14, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 16, alignItems: 'center', gap: 4 },
  answerLbl: { fontSize: 10, fontFamily: 'Inter_500Medium', letterSpacing: 1 },
  answerTxt: { fontSize: 18, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  actRow: { flexDirection: 'row', gap: 10 },
  actBtn: { paddingVertical: 18, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  actBtnTxt: { fontSize: 17, fontFamily: 'Inter_700Bold', color: '#FFF' },
  passBtn: { paddingVertical: 18, borderRadius: 16, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  passTxt: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
