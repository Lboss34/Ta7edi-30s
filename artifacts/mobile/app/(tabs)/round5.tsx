import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useGame } from '@/contexts/GameContext';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSounds } from '@/hooks/useSounds';

// ── Neon color by first Arabic letter ────────────────────────────────────────
const LETTER_COLORS: Record<string, string> = {
  'ر': '#7B2FFF', 'ب': '#FF3B3B', 'م': '#00E5FF', 'ل': '#FF6B00',
  'أ': '#FFD700', 'ي': '#00C853', 'ت': '#FF69B4', 'ن': '#7B2FFF',
  'ف': '#00E5FF', 'إ': '#FFD700', 'س': '#FF6B00', 'ج': '#00C853',
  'ه': '#FF3B3B', 'ع': '#7B2FFF', 'غ': '#FF69B4', 'خ': '#00E5FF',
  'ك': '#FFD700', 'د': '#FF3B3B', 'ز': '#00C853', 'ق': '#FF6B00',
  'ش': '#FF69B4', 'و': '#7B2FFF', 'A': '#00E5FF', 'P': '#7B2FFF',
  'F': '#FF3B3B', 'L': '#FF6B00', 'U': '#FFD700',
};

function getClubColor(name: string): string {
  const rawName = name.replace(/\s*\(.*?\)/g, '').trim();
  return LETTER_COLORS[rawName.charAt(0)] ?? '#00E5FF';
}

// ── Text-only Club Chip ───────────────────────────────────────────────────────
function ClubChip({
  clubRaw,
  isNewest = false,
}: {
  clubRaw: string;
  isNewest?: boolean;
}) {
  const rawName      = clubRaw.replace(/\s*\(.*?\)/g, '').trim();
  const countryMatch = clubRaw.match(/\(([^)]+)\)/);
  const countryTag   = countryMatch ? countryMatch[1] : '';
  const color        = getClubColor(clubRaw);

  return (
    <View style={[
      chipStyles.chip,
      {
        borderColor: isNewest ? color : `${color}60`,
        backgroundColor: isNewest ? `${color}14` : `${color}06`,
        shadowColor: color,
        shadowOpacity: isNewest ? 0.5 : 0,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 0 },
        elevation: isNewest ? 6 : 0,
      },
    ]}>
      <Text style={[chipStyles.name, { color: isNewest ? color : `${color}CC` }]}>
        {rawName}
      </Text>
      {countryTag ? (
        <Text style={chipStyles.country}>({countryTag})</Text>
      ) : null}
    </View>
  );
}

const chipStyles = StyleSheet.create({
  chip: {
    borderRadius: 12, borderWidth: 1.5,
    paddingVertical: 8, paddingHorizontal: 12,
    alignItems: 'center', gap: 2, minWidth: 80,
  },
  name: { fontSize: 13, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  country: { fontSize: 9, fontFamily: 'Inter_400Regular', color: '#666', textAlign: 'center' },
});

// ── Phase types ───────────────────────────────────────────────────────────────
type Phase = 'intro' | 'play' | 'confirming';

export default function Round5Screen() {
  const router   = useRouter();
  const insets   = useSafeAreaInsets();
  const colors   = useColors();
  const { state, addScore, nextRound } = useGame();
  const { playCorrect, playWrong } = useSounds(state.isMuted);

  const puzzles = state.transferPuzzles;

  const [phase, setPhase]                = useState<Phase>('intro');
  const [puzzleIdx, setPuzzleIdx]        = useState(0);
  const [locked, setLocked]             = useState<[boolean, boolean]>([false, false]);
  const [confirmPlayer, setConfirmPlayer] = useState<0 | 1>(0);
  const [scores, setScores]             = useState<[number, number]>([0, 0]);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const currentPuzzle = puzzles?.[puzzleIdx];
  // RTL: newest first
  const displayChain  = currentPuzzle ? [...(currentPuzzle.transfers ?? [])].reverse() : [];
  const isLastPuzzle  = puzzleIdx >= (puzzles?.length ?? 1) - 1;
  const bothLocked    = locked[0] && locked[1];

  const finishRound = (sc: [number, number]) => {
    if (sc[0] > 0) addScore(0, sc[0]);
    if (sc[1] > 0) addScore(1, sc[1]);
    nextRound();
    router.back();
  };

  const goNext = (sc: [number, number]) => {
    if (isLastPuzzle) {
      finishRound(sc);
    } else {
      setPuzzleIdx(i => i + 1);
      setLocked([false, false]);
      setPhase('play');
    }
  };

  const handleBuzz = (player: 0 | 1) => {
    if (locked[player] || bothLocked) return;
    setConfirmPlayer(player);
    setPhase('confirming');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  };

  const handleCorrect = () => {
    playCorrect();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const ns: [number, number] = [scores[0], scores[1]];
    ns[confirmPlayer]++;
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
      goNext(scores);
    } else {
      setPhase('play');
    }
  };

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    goNext(scores);
  };

  // ── Safety guard ─────────────────────────────────────────────────────────
  if (!puzzles?.length) {
    return (
      <View style={[styles.root, { backgroundColor: '#050510', alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: '#555', fontSize: 16 }}>جارٍ تحضير الألغاز...</Text>
      </View>
    );
  }

  // ── Intro ─────────────────────────────────────────────────────────────────
  if (phase === 'intro') {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <LinearGradient colors={['#050510', '#001A1A', '#050510']} style={StyleSheet.absoluteFill} />
        <View style={[styles.center, { paddingTop: topPad, paddingBottom: botPad }]}>
          <View style={[styles.badge, { borderColor: '#00E5FF' }]}>
            <Text style={styles.badgeEmoji}>🔍</Text>
          </View>
          <Text style={[styles.roundTag, { color: colors.mutedForeground }]}>الجولة الخامسة</Text>
          <Text style={[styles.roundTitle, { color: '#00E5FF' }]}>خمّن اللاعب</Text>
          <Text style={[styles.roundDesc, { color: colors.mutedForeground }]}>
            {'مسار انتقالات لاعب مجهول\nمن يصيح الإجابة أولًا يحصد النقطة\n٤ أسئلة في هذه الجولة'}
          </Text>
          <View style={[styles.scoreRow, { backgroundColor: colors.card, borderColor: '#00E5FF' }]}>
            <Text style={[styles.scoreP, { color: '#7B2FFF' }]}>
              {state.players[0]}: {state.scores[0]}
            </Text>
            <Text style={[styles.scoreSep, { color: '#00E5FF' }]}>VS</Text>
            <Text style={[styles.scoreP, { color: '#00E5FF' }]}>
              {state.players[1]}: {state.scores[1]}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              setPhase('play');
            }}
            activeOpacity={0.85}
            style={styles.fullW}
          >
            <LinearGradient
              colors={['#00E5FF', '#00A8CC']}
              style={styles.startBtn}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            >
              <Ionicons name="search" size={24} color="#050510" />
              <Text style={[styles.startBtnTxt, { color: '#050510' }]}>ابدأ التخمين</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Confirming ────────────────────────────────────────────────────────────
  if (phase === 'confirming') {
    const cpColor = confirmPlayer === 0 ? '#7B2FFF' : '#00E5FF';
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <LinearGradient colors={['#050510', '#001A1A', '#050510']} style={StyleSheet.absoluteFill} />
        <View style={[styles.center, { paddingTop: topPad, paddingBottom: botPad }]}>
          <Ionicons name="help-circle" size={52} color="#00E5FF" />
          <Text style={[styles.confirmTag, { color: colors.mutedForeground }]}>هل أجاب صح؟</Text>
          <Text style={[styles.confirmPlayer, { color: cpColor }]}>
            {state.players[confirmPlayer]}
          </Text>
          <View style={[styles.answerCard, { backgroundColor: colors.card, borderColor: '#FFD700' }]}>
            <Text style={[styles.answerLbl, { color: colors.mutedForeground }]}>اللاعب المقصود</Text>
            <Text style={[styles.answerTxt, { color: '#FFD700' }]}>{currentPuzzle?.answer}</Text>
          </View>
          <View style={styles.confirmBtns}>
            <TouchableOpacity onPress={handleWrong} activeOpacity={0.85} style={{ flex: 1 }}>
              <LinearGradient colors={['#FF3B3B', '#CC1010']} style={styles.confirmBtn}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Ionicons name="close-circle" size={22} color="#FFF" />
                <Text style={styles.confirmBtnTxt}>خطأ</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleCorrect} activeOpacity={0.85} style={{ flex: 1 }}>
              <LinearGradient colors={['#00C853', '#009624']} style={styles.confirmBtn}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Ionicons name="checkmark-circle" size={22} color="#FFF" />
                <Text style={styles.confirmBtnTxt}>صحيح +١</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // ── Play ──────────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={['#050510', '#001A1A', '#050510']} style={StyleSheet.absoluteFill} />
      <View style={styles.cyanGlow} />

      <View style={[styles.playContent, { paddingTop: topPad + 8, paddingBottom: botPad + 16 }]}>
        {/* Header */}
        <View style={styles.playHeader}>
          <View style={[styles.roundPill, { borderColor: '#00E5FF' }]}>
            <Text style={[styles.roundPillTxt, { color: '#00E5FF' }]}>خمّن اللاعب</Text>
          </View>
          <View style={[styles.progressPill, { borderColor: colors.border }]}>
            <Text style={[styles.progressTxt, { color: colors.mutedForeground }]}>
              {puzzleIdx + 1} / {puzzles.length}
            </Text>
          </View>
        </View>

        {/* Score row */}
        <View style={[styles.inlineScore, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.inlineScoreP, { color: '#7B2FFF' }]}>
            {state.players[0]}: {scores[0]}
          </Text>
          <Text style={[styles.inlineScoreSep, { color: colors.mutedForeground }]}>—</Text>
          <Text style={[styles.inlineScoreP, { color: '#00E5FF' }]}>
            {state.players[1]}: {scores[1]}
          </Text>
        </View>

        {/* Transfer chain card */}
        <View style={[styles.chainCard, { backgroundColor: colors.card, borderColor: '#00E5FF' }]}>
          <Text style={[styles.chainTitle, { color: colors.mutedForeground }]}>
            مسار الانتقالات ← الأحدث أولًا
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chainScroll}
          >
            {displayChain.map((club, i) => (
              <React.Fragment key={i}>
                {i > 0 && (
                  <Ionicons name="arrow-back" size={16} color="#00E5FF" style={{ opacity: 0.5 }} />
                )}
                <ClubChip clubRaw={club} isNewest={i === 0} />
              </React.Fragment>
            ))}
          </ScrollView>
        </View>

        {/* Host answer */}
        <View style={[styles.hostAnswer, { backgroundColor: 'rgba(255,215,0,0.06)', borderColor: '#FFD700' }]}>
          <Text style={[styles.hostAnswerLbl, { color: colors.mutedForeground }]}>
            اللاعب — للمضيف فقط 👁
          </Text>
          <Text style={[styles.hostAnswerTxt, { color: '#FFD700' }]}>{currentPuzzle?.answer}</Text>
        </View>

        <View style={{ flex: 1 }} />

        {/* Question banner */}
        <View style={[styles.questionBanner, { borderColor: '#00E5FF', backgroundColor: 'rgba(0,229,255,0.06)' }]}>
          <Ionicons name="person-circle" size={22} color="#00E5FF" />
          <Text style={[styles.questionBannerTxt, { color: '#00E5FF' }]}>من هو هذا اللاعب؟</Text>
        </View>

        {/* Buzz buttons */}
        <View style={styles.buzzRow}>
          <TouchableOpacity
            onPress={() => handleBuzz(0)} activeOpacity={0.85}
            style={{ flex: 1 }} disabled={locked[0] || bothLocked}
          >
            <LinearGradient
              colors={locked[0] ? ['#1A1A1A', '#111'] : ['#7B2FFF', '#5B1FDF']}
              style={[styles.buzzBtn, { opacity: locked[0] ? 0.3 : 1 }]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            >
              <Ionicons name={locked[0] ? 'lock-closed' : 'hand-right'} size={26}
                color={locked[0] ? '#555' : '#FFF'} />
              <Text style={[styles.buzzTxt, { color: locked[0] ? '#555' : '#FFF' }]}>
                {state.players[0]}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => handleBuzz(1)} activeOpacity={0.85}
            style={{ flex: 1 }} disabled={locked[1] || bothLocked}
          >
            <LinearGradient
              colors={locked[1] ? ['#1A1A1A', '#111'] : ['#00E5FF', '#00A8CC']}
              style={[styles.buzzBtn, { opacity: locked[1] ? 0.3 : 1 }]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            >
              <Ionicons name={locked[1] ? 'lock-closed' : 'hand-right'} size={26}
                color={locked[1] ? '#555' : '#050510'} />
              <Text style={[styles.buzzTxt, { color: locked[1] ? '#555' : '#050510' }]}>
                {state.players[1]}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Skip */}
        <TouchableOpacity onPress={handleSkip} activeOpacity={0.7}>
          <View style={[styles.skipBtn, { borderColor: colors.border }]}>
            <Ionicons name="arrow-forward-circle" size={16} color={colors.mutedForeground} />
            <Text style={[styles.skipTxt, { color: colors.mutedForeground }]}>
              {isLastPuzzle ? 'إنهاء الجولة' : 'السؤال التالي'}
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  cyanGlow: {
    position: 'absolute', top: -40, alignSelf: 'center',
    width: 320, height: 320, borderRadius: 160,
    backgroundColor: '#00E5FF', opacity: 0.04,
  },
  center: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 24, gap: 18,
  },
  fullW: { width: '100%' },
  badge: {
    width: 110, height: 110, borderRadius: 55,
    borderWidth: 3, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,229,255,0.07)',
  },
  badgeEmoji: { fontSize: 48 },
  roundTag: { fontSize: 12, fontFamily: 'Inter_500Medium', letterSpacing: 2 },
  roundTitle: { fontSize: 40, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  roundDesc: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 26 },
  scoreRow: {
    flexDirection: 'row', alignItems: 'center', gap: 16,
    borderRadius: 16, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 20,
  },
  scoreP: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  scoreSep: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  startBtn: {
    paddingVertical: 18, borderRadius: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    shadowColor: '#00E5FF', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 20, elevation: 14,
  },
  startBtnTxt: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  confirmTag: { fontSize: 14, fontFamily: 'Inter_500Medium', letterSpacing: 1 },
  confirmPlayer: { fontSize: 36, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  answerCard: {
    borderRadius: 16, borderWidth: 1.5, padding: 20,
    alignItems: 'center', gap: 6, width: '100%',
  },
  answerLbl: { fontSize: 12, fontFamily: 'Inter_500Medium', letterSpacing: 1 },
  answerTxt: { fontSize: 26, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  confirmBtns: { flexDirection: 'row', gap: 12, width: '100%' },
  confirmBtn: {
    paddingVertical: 18, borderRadius: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  confirmBtnTxt: { fontSize: 17, fontFamily: 'Inter_700Bold', color: '#FFF' },
  playContent: { flex: 1, paddingHorizontal: 18, gap: 12 },
  playHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  roundPill: { borderRadius: 14, borderWidth: 1.5, paddingVertical: 5, paddingHorizontal: 12 },
  roundPillTxt: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  progressPill: { borderRadius: 12, borderWidth: 1, paddingVertical: 5, paddingHorizontal: 10 },
  progressTxt: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  inlineScore: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 14, borderRadius: 12, borderWidth: 1, paddingVertical: 8,
  },
  inlineScoreP: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  inlineScoreSep: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  chainCard: { borderRadius: 18, borderWidth: 1.5, padding: 16, gap: 10 },
  chainTitle: {
    fontSize: 10, fontFamily: 'Inter_500Medium',
    letterSpacing: 1.5, textAlign: 'center',
  },
  chainScroll: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4,
  },
  hostAnswer: {
    borderRadius: 12, borderWidth: 1,
    paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center', gap: 4,
  },
  hostAnswerLbl: { fontSize: 10, fontFamily: 'Inter_500Medium', letterSpacing: 1 },
  hostAnswerTxt: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  questionBanner: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, borderRadius: 14, borderWidth: 1.5, paddingVertical: 12,
  },
  questionBannerTxt: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  buzzRow: { flexDirection: 'row', gap: 12 },
  buzzBtn: {
    paddingVertical: 26, borderRadius: 20,
    flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
  },
  buzzTxt: { fontSize: 15, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  skipBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, borderRadius: 12, borderWidth: 1, paddingVertical: 10,
  },
  skipTxt: { fontSize: 13, fontFamily: 'Inter_500Medium' },
});
