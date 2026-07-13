import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useGame } from '@/contexts/GameContext';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSounds } from '@/hooks/useSounds';

type Phase = 'intro' | 'question' | 'confirming';
const BUZZER_COLOR = '#FF6B00';

export default function Round3Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { state, addScore, nextRound } = useGame();
  const { playCorrect, playWrong } = useSounds(state.isMuted);

  const questions = state.buzzerQuestions;

  const [phase, setPhase]                       = useState<Phase>('intro');
  const [qIdx, setQIdx]                         = useState(0);
  const [scores, setScores]                     = useState<[number, number]>([0, 0]);
  const [locked, setLocked]                     = useState<[boolean, boolean]>([false, false]);
  const [confirmPlayer, setConfirmPlayer]        = useState<0 | 1>(0);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const totalQs   = questions.length;
  const safeIdx   = totalQs > 0 ? Math.min(qIdx, totalQs - 1) : 0;
  const currentQ  = questions[safeIdx] as (typeof questions)[0] | undefined;
  const isLastQ   = qIdx >= totalQs - 1;
  const bothLocked = locked[0] && locked[1];

  const finishRound = (finalScores: [number, number]) => {
    if (finalScores[0] > 0) addScore(0, finalScores[0]);
    if (finalScores[1] > 0) addScore(1, finalScores[1]);
    nextRound();
    router.back();
  };

  const goNext = (sc: [number, number]) => {
    if (isLastQ) {
      finishRound(sc);
    } else {
      setQIdx(i => i + 1);
      setLocked([false, false]);
      setPhase('question');
    }
  };

  const handleBuzz = (player: 0 | 1) => {
    if (locked[player] || bothLocked) return;
    setConfirmPlayer(player);
    setPhase('confirming');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  };

  const handleBurn = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    goNext(scores);
  };

  const handleCorrect = () => {
    playCorrect();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const ns: [number, number] = [scores[0], scores[1]];
    ns[confirmPlayer] += 1;
    setScores(ns);
    goNext(ns);
  };

  const handleWrong = () => {
    playWrong();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    const nl: [boolean, boolean] = [locked[0], locked[1]];
    nl[confirmPlayer] = true;
    setLocked(nl);
    if (nl[0] && nl[1]) {
      // Both locked → end question
      goNext(scores);
    } else {
      setPhase('question');
    }
  };

  // ── Safety guard ─────────────────────────────────────────────────────
  if (!questions?.length) {
    return (
      <View style={[styles.root, { backgroundColor: '#050510', alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: '#555', fontSize: 16 }}>جارٍ تحضير الأسئلة...</Text>
      </View>
    );
  }

  // ── Intro ────────────────────────────────────────────────────────────
  if (phase === 'intro') {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <LinearGradient colors={['#050510', '#1A0A00', '#050510']} style={StyleSheet.absoluteFill} />
        <View style={[styles.center, { paddingTop: topPad, paddingBottom: botPad }]}>
          <View style={[styles.badge, { borderColor: BUZZER_COLOR, backgroundColor: `${BUZZER_COLOR}15` }]}>
            <Ionicons name="radio-button-on" size={52} color={BUZZER_COLOR} />
          </View>
          <Text style={[styles.roundTag, { color: colors.mutedForeground }]}>الجولة الثالثة</Text>
          <Text style={[styles.roundTitle, { color: BUZZER_COLOR }]}>الجرس</Text>
          <Text style={[styles.desc, { color: colors.mutedForeground }]}>
            {'المضيف يقرأ السؤال ويعرض الجواب\nمن يصيح أولًا يضغط زره\nإذا أخطأ — يُقفل وللآخر الفرصة\nسؤال محروق = لا أحد يجيب'}
          </Text>
          <View style={styles.ruleRow}>
            {[
              { icon: 'checkmark-circle', color: '#00C853', text: 'صحيح = +١ نقطة' },
              { icon: 'close-circle',     color: '#FF3B3B', text: 'خطأ = إقفال' },
              { icon: 'flame',            color: '#FF6B00', text: 'محروق = التالي' },
            ].map((r, i) => (
              <View key={i} style={[styles.ruleChip, { borderColor: r.color, backgroundColor: `${r.color}15` }]}>
                <Ionicons name={r.icon as any} size={16} color={r.color} />
                <Text style={[styles.ruleChipTxt, { color: r.color }]}>{r.text}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity onPress={() => setPhase('question')} activeOpacity={0.85} style={styles.fullW}>
            <LinearGradient
              colors={[BUZZER_COLOR, '#CC5500']}
              style={styles.startBtn}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            >
              <Ionicons name="radio-button-on" size={24} color="#FFF" />
              <Text style={styles.startBtnTxt}>ابدأ الجولة</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Confirming phase ─────────────────────────────────────────────────
  if (phase === 'confirming') {
    const cpColor = confirmPlayer === 0 ? '#7B2FFF' : '#00E5FF';
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <LinearGradient colors={['#050510', '#001500', '#050510']} style={StyleSheet.absoluteFill} />
        <View style={[styles.center, { paddingTop: topPad, paddingBottom: botPad }]}>
          <Text style={[styles.confirmTag, { color: colors.mutedForeground }]}>هل أجاب صح؟</Text>
          <Text style={[styles.confirmPlayer, { color: cpColor }]}>{state.players[confirmPlayer]}</Text>
          <View style={[styles.answerCard, { backgroundColor: colors.card, borderColor: '#FFD700' }]}>
            <Text style={[styles.answerLbl, { color: colors.primary }]}>الجواب الصحيح</Text>
            <Text style={[styles.answerTxt, { color: colors.foreground }]}>{currentQ?.answer}</Text>
          </View>
          <View style={styles.confirmBtns}>
            <TouchableOpacity onPress={handleWrong} activeOpacity={0.85} style={{ flex: 1 }}>
              <LinearGradient colors={['#FF3B3B', '#CC1010']} style={styles.confirmBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Ionicons name="close-circle" size={22} color="#FFF" />
                <Text style={styles.confirmBtnTxt}>خطأ — إقفال</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleCorrect} activeOpacity={0.85} style={{ flex: 1 }}>
              <LinearGradient colors={['#00C853', '#009624']} style={styles.confirmBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Ionicons name="checkmark-circle" size={22} color="#FFF" />
                <Text style={styles.confirmBtnTxt}>صحيح +١</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // ── Question phase ────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={['#050510', '#1A0A00', '#050510']} style={StyleSheet.absoluteFill} />
      <View style={[styles.questionContent, { paddingTop: topPad + 12, paddingBottom: botPad + 20 }]}>

        {/* Header */}
        <View style={styles.qHeader}>
          <View style={[styles.qPill, { borderColor: BUZZER_COLOR }]}>
            <Text style={[styles.qPillTxt, { color: BUZZER_COLOR }]}>
              س {qIdx + 1} / {totalQs}
            </Text>
          </View>
          <View style={styles.scoreMini}>
            <Text style={[styles.scoreMiniTxt, { color: '#7B2FFF' }]}>{scores[0]}</Text>
            <Text style={[styles.scoreMiniSep, { color: colors.mutedForeground }]}>—</Text>
            <Text style={[styles.scoreMiniTxt, { color: '#00E5FF' }]}>{scores[1]}</Text>
          </View>
        </View>

        {/* Question */}
        <View style={[styles.qCard, { backgroundColor: colors.card, borderColor: BUZZER_COLOR }]}>
          <Text style={[styles.qTxt, { color: colors.foreground }]}>{currentQ?.question}</Text>
        </View>

        {/* Choices — shown when question has multiple-choice options */}
        {currentQ?.choices && currentQ.choices.length > 0 && (
          <View style={styles.choicesGrid}>
            {currentQ.choices.map((choice, i) => (
              <View
                key={i}
                style={[styles.choiceChip, { borderColor: BUZZER_COLOR, backgroundColor: `${BUZZER_COLOR}12` }]}
              >
                <Text style={[styles.choiceLabel, { color: colors.mutedForeground }]}>
                  {['أ', 'ب', 'ج', 'د'][i]}
                </Text>
                <Text style={[styles.choiceTxt, { color: colors.foreground }]}>{choice}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Answer — visible to host */}
        <View style={[styles.answerCard, { backgroundColor: colors.card, borderColor: '#FFD700', borderStyle: 'dashed' }]}>
          <Text style={[styles.answerLbl, { color: colors.primary }]}>
            الجواب (للمضيف فقط 👁)
          </Text>
          <Text style={[styles.answerTxtHost, { color: '#FFD700' }]}>{currentQ?.answer}</Text>
        </View>

        <View style={{ flex: 1 }} />

        {/* Buzz buttons */}
        <View style={styles.buzzRow}>
          {/* P1 */}
          <TouchableOpacity
            onPress={() => handleBuzz(0)} activeOpacity={0.85} style={{ flex: 1 }}
            disabled={locked[0] || bothLocked}
          >
            <LinearGradient
              colors={locked[0] ? ['#1A1A1A', '#111'] : ['#7B2FFF', '#5B1FDF']}
              style={[styles.buzzBtn, { opacity: locked[0] ? 0.35 : 1 }]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            >
              {locked[0]
                ? <Ionicons name="lock-closed" size={22} color="#555" />
                : <Ionicons name="radio-button-on" size={22} color="#FFF" />
              }
              <Text style={[styles.buzzBtnTxt, { color: locked[0] ? '#555' : '#FFF' }]}>
                {state.players[0]}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Burn */}
          <TouchableOpacity onPress={handleBurn} activeOpacity={0.85} style={{ flex: 0.8 }}>
            <View style={[styles.burnBtn, { borderColor: '#FF6B00', backgroundColor: 'rgba(255,107,0,0.1)' }]}>
              <Ionicons name="flame" size={20} color="#FF6B00" />
              <Text style={[styles.burnTxt, { color: '#FF6B00' }]}>محروق</Text>
            </View>
          </TouchableOpacity>

          {/* P2 */}
          <TouchableOpacity
            onPress={() => handleBuzz(1)} activeOpacity={0.85} style={{ flex: 1 }}
            disabled={locked[1] || bothLocked}
          >
            <LinearGradient
              colors={locked[1] ? ['#1A1A1A', '#111'] : ['#00E5FF', '#00A8CC']}
              style={[styles.buzzBtn, { opacity: locked[1] ? 0.35 : 1 }]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            >
              {locked[1]
                ? <Ionicons name="lock-closed" size={22} color="#555" />
                : <Ionicons name="radio-button-on" size={22} color="#050510" />
              }
              <Text style={[styles.buzzBtnTxt, { color: locked[1] ? '#555' : '#050510' }]}>
                {state.players[1]}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 16 },
  fullW: { width: '100%' },
  badge: { width: 110, height: 110, borderRadius: 55, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  roundTag: { fontSize: 13, fontFamily: 'Inter_500Medium', letterSpacing: 1 },
  roundTitle: { fontSize: 40, fontFamily: 'Inter_700Bold' },
  desc: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 26 },
  ruleRow: { gap: 8, width: '100%' },
  ruleChip: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 8,
    borderRadius: 12, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 14,
  },
  ruleChipTxt: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  startBtn: { paddingVertical: 17, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  startBtnTxt: { fontSize: 20, fontFamily: 'Inter_700Bold', color: '#FFF' },
  // Confirming
  confirmTag: { fontSize: 14, fontFamily: 'Inter_500Medium', letterSpacing: 1 },
  confirmPlayer: { fontSize: 36, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  confirmBtns: { flexDirection: 'row', gap: 12, width: '100%' },
  confirmBtn: { paddingVertical: 18, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  confirmBtnTxt: { fontSize: 17, fontFamily: 'Inter_700Bold', color: '#FFF' },
  // Question
  questionContent: { flex: 1, paddingHorizontal: 20, gap: 14 },
  qHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  qPill: { borderRadius: 20, borderWidth: 1.5, paddingVertical: 6, paddingHorizontal: 14 },
  qPillTxt: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  scoreMini: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreMiniTxt: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  scoreMiniSep: { fontSize: 14, fontFamily: 'Inter_400Regular' },
  qCard: { borderRadius: 20, borderWidth: 1.5, padding: 24, alignItems: 'flex-end', minHeight: 110, justifyContent: 'center' },
  qTxt: { fontSize: 22, fontFamily: 'Inter_700Bold', textAlign: 'right', lineHeight: 34 },
  answerCard: { borderRadius: 16, borderWidth: 1.5, padding: 16, alignItems: 'center', gap: 6 },
  answerLbl: { fontSize: 11, fontFamily: 'Inter_500Medium', letterSpacing: 1.5 },
  answerTxt: { fontSize: 24, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  answerTxtHost: { fontSize: 26, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  choicesGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' },
  choiceChip: { borderRadius: 12, borderWidth: 1.5, paddingVertical: 8, paddingHorizontal: 12, flexDirection: 'row-reverse', alignItems: 'center', gap: 6, minWidth: '45%' },
  choiceLabel: { fontSize: 11, fontFamily: 'Inter_700Bold', minWidth: 14, textAlign: 'center' },
  choiceTxt: { fontSize: 14, fontFamily: 'Inter_600SemiBold', textAlign: 'right', flex: 1 },
  buzzRow: { flexDirection: 'row', gap: 10 },
  buzzBtn: { paddingVertical: 22, borderRadius: 18, flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 },
  buzzBtnTxt: { fontSize: 14, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  burnBtn: {
    paddingVertical: 22, borderRadius: 18, borderWidth: 1.5,
    flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6,
  },
  burnTxt: { fontSize: 12, fontFamily: 'Inter_700Bold' },
});
