/**
 * Multiplayer Round 5 — خمّن اللاعب
 *
 * Rules:
 * - Host reads the full transfer history block out loud at once.
 * - Unlimited guessing attempts for everyone simultaneously.
 * - First player to shout the correct answer gets the point.
 * - Host selects which player answered correctly.
 * - Any player may request to "skip" the current puzzle: it is not discarded — it is
 *   requeued to the end of the round's puzzle order and a new puzzle is shown immediately.
 *   This keeps the total puzzle count stable and lets the skipped puzzle resurface later.
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
import { useGroupSounds } from '@/hooks/useGroupSounds';

const LETTER_COLORS: Record<string, string> = {
  'ر': '#7B2FFF', 'ب': '#FF3B3B', 'م': '#00E5FF', 'ل': '#FF6B00',
  'أ': '#FFD700', 'ي': '#00C853', 'ت': '#FF69B4', 'ن': '#7B2FFF',
  'ف': '#00E5FF', 'إ': '#FFD700', 'س': '#FF6B00', 'ج': '#00C853',
  'ه': '#FF3B3B', 'ع': '#7B2FFF', 'غ': '#FF69B4', 'خ': '#00E5FF',
  'ك': '#FFD700', 'د': '#FF3B3B', 'ز': '#00C853', 'ق': '#FF6B00',
  'ش': '#FF69B4', 'A': '#00E5FF', 'P': '#7B2FFF', 'F': '#FF3B3B',
  'L': '#FF6B00', 'U': '#FFD700',
};
function clubColor(name: string) {
  const raw = name.replace(/\s*\(.*?\)/g, '').trim();
  return LETTER_COLORS[raw.charAt(0)] ?? '#FFD700';
}

function ClubChip({ clubRaw, isNewest = false }: { clubRaw: string; isNewest?: boolean }) {
  const rawName = clubRaw.replace(/\s*\(.*?\)/g, '').trim();
  const country = clubRaw.match(/\(([^)]+)\)/)?.[1] ?? '';
  const color   = clubColor(clubRaw);
  return (
    <View style={[chip.wrap, { borderColor: isNewest ? color : `${color}55`, backgroundColor: isNewest ? `${color}14` : `${color}06`, shadowColor: color, shadowOpacity: isNewest ? 0.55 : 0, shadowRadius: 10, shadowOffset: { width: 0, height: 0 }, elevation: isNewest ? 8 : 0 }]}>
      <Text style={[chip.name, { color: isNewest ? color : `${color}BB` }]}>{rawName}</Text>
      {country ? <Text style={chip.country}>({country})</Text> : null}
    </View>
  );
}
const chip = StyleSheet.create({
  wrap: { borderRadius: 12, borderWidth: 1.5, paddingVertical: 8, paddingHorizontal: 11, alignItems: 'center', gap: 2, minWidth: 72 },
  name: { fontSize: 12, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  country: { fontSize: 9, fontFamily: 'Inter_400Regular', color: '#666', textAlign: 'center' },
});

type Phase = 'intro' | 'playing' | 'confirming' | 'puzzle_result' | 'round_done';

export default function MpRound5Screen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const colors  = useColors();
  const { state, addScore, nextRound } = useMultiplayer();
  const { playClick, playCorrect, playFanfare } = useGroupSounds(state.isMuted);

  const puzzles = state.transferPuzzles;
  const n       = state.players.length;

  const [phase, setPhase]             = useState<Phase>('intro');
  // Queue of puzzle indices for this round. Skipping moves the front index to the
  // back instead of removing it, so the same puzzle is asked again later.
  const [queue, setQueue]             = useState<number[]>(() => puzzles.map((_, i) => i));
  const [selectedPlayer, setSelectedPlayer] = useState<number | null>(null);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const puzzleIdx = puzzles.length - queue.length; // how many puzzles already resolved
  const puzzle = puzzles[queue[0]];
  const displayChain = puzzle?.transfers ? [...puzzle.transfers].reverse() : [];
  const isLastInQueue = queue.length <= 1;

  const handleSkip = useCallback(() => {
    if (queue.length <= 1) return; // nothing else to show instead
    playClick();
    Haptics.selectionAsync();
    setQueue(q => [...q.slice(1), q[0]]);
  }, [queue.length, playClick]);

  const handlePlayerGuessed = (playerIdx: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setSelectedPlayer(playerIdx);
    setPhase('confirming');
  };

  const handleCorrect = () => {
    if (selectedPlayer === null) return;
    playCorrect();
    setTimeout(() => playFanfare(), 200);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addScore(selectedPlayer, 1);
    setPhase('puzzle_result');
  };

  const handleWrong = () => {
    // Wrong just goes back to playing for another player to try
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    setSelectedPlayer(null);
    setPhase('playing');
  };

  const handleNextPuzzle = () => {
    setSelectedPlayer(null);
    if (isLastInQueue) {
      setQueue([]);
      playFanfare();
      setPhase('round_done');
    } else {
      setQueue(q => q.slice(1));
      setPhase('playing');
    }
  };

  const handleFinishRound = () => {
    nextRound();
    router.back();
  };

  if (!puzzles?.length) {
    return (
      <View style={[S.root, { backgroundColor: '#050510', alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: '#555', fontSize: 16 }}>جارٍ تحضير الألغاز...</Text>
      </View>
    );
  }

  // ── Intro ─────────────────────────────────────────────────────────────────
  if (phase === 'intro') {
    return (
      <View style={[S.root, { backgroundColor: colors.background }]}>
        <LinearGradient colors={['#050510', '#001A1A', '#050510']} style={StyleSheet.absoluteFill} />
        <View style={[S.center, { paddingTop: topPad, paddingBottom: botPad }]}>
          <View style={[S.badge, { borderColor: '#00E5FF' }]}>
            <Ionicons name="people" size={52} color="#00E5FF" />
          </View>
          <Text style={[S.roundTag, { color: colors.mutedForeground }]}>الجولة الخامسة — جماعي</Text>
          <Text style={[S.roundTitle, { color: '#00E5FF' }]}>خمّن اللاعب</Text>
          <Text style={[S.desc, { color: colors.mutedForeground }]}>
            {'المضيف يقرأ سلسلة الانتقالات كاملة\nالجميع يحزرون في نفس الوقت\nمن يصيح بالإجابة الصحيحة أولاً يضغط عليه المضيف\nيحصل على نقطة!'}
          </Text>
          <View style={S.playersGrid}>
            {state.players.map((name, i) => (
              <View key={i} style={[S.playerPill, { borderColor: PLAYER_COLORS[i] ?? '#FFD700', backgroundColor: `${PLAYER_COLORS[i] ?? '#FFD700'}15` }]}>
                <Text style={[S.playerPillTxt, { color: PLAYER_COLORS[i] ?? '#FFD700' }]}>{name}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity onPress={() => setPhase('playing')} activeOpacity={0.85} style={S.fullW}>
            <LinearGradient colors={['#00E5FF', '#00A8CC']} style={S.startBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Ionicons name="play" size={22} color="#050510" />
              <Text style={[S.startBtnTxt, { color: '#050510' }]}>ابدأ الجولة</Text>
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
        <LinearGradient colors={['#050510', '#001A1A', '#050510']} style={StyleSheet.absoluteFill} />
        <View style={[S.center, { paddingTop: topPad, paddingBottom: botPad }]}>
          <Ionicons name="trophy" size={64} color="#00E5FF" />
          <Text style={[S.roundTag, { color: colors.mutedForeground }]}>نهاية الجولة الخامسة</Text>
          <Text style={[S.roundTitle, { color: '#00E5FF' }]}>انتهت جميع الجولات!</Text>
          <View style={S.playersGrid}>
            {state.players.map((name, i) => (
              <View key={i} style={[S.scoreCard, { borderColor: PLAYER_COLORS[i] ?? '#FFD700' }]}>
                <Text style={[S.scoreCardName, { color: PLAYER_COLORS[i] ?? '#FFD700' }]}>{name}</Text>
                <Text style={[S.scoreCardPts, { color: PLAYER_COLORS[i] ?? '#FFD700' }]}>{state.scores[i]} نقطة</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity onPress={handleFinishRound} activeOpacity={0.85} style={S.fullW}>
            <LinearGradient colors={['#FFD700', '#FFA500']} style={S.startBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Ionicons name="trophy" size={22} color="#050510" />
              <Text style={[S.startBtnTxt, { color: '#050510' }]}>عرض النتائج النهائية</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Puzzle Result ─────────────────────────────────────────────────────────
  if (phase === 'puzzle_result') {
    return (
      <View style={[S.root, { backgroundColor: colors.background }]}>
        <LinearGradient colors={['#050510', '#001A1A', '#050510']} style={StyleSheet.absoluteFill} />
        <View style={[S.center, { paddingTop: topPad, paddingBottom: botPad }]}>
          <Ionicons name="checkmark-circle" size={64} color="#00C853" />
          <Text style={[S.resultWinner, { color: selectedPlayer !== null ? (PLAYER_COLORS[selectedPlayer] ?? '#FFD700') : '#00C853' }]}>
            🏆 {selectedPlayer !== null ? state.players[selectedPlayer] : '?'} أجاب أولاً! +١
          </Text>
          <View style={[S.answerCard, { backgroundColor: colors.card, borderColor: '#00E5FF' }]}>
            <Text style={[S.answerLabel, { color: colors.mutedForeground }]}>اللاعب المقصود</Text>
            <Text style={[S.answerTxt, { color: '#00E5FF' }]}>{puzzle?.answer}</Text>
          </View>
          <Text style={[S.qProgress, { color: colors.mutedForeground }]}>{puzzleIdx + 1} / {puzzles.length} لغز</Text>
          <TouchableOpacity onPress={handleNextPuzzle} activeOpacity={0.85} style={S.fullW}>
            <LinearGradient
              colors={isLastInQueue ? ['#FFD700', '#FFA500'] : ['#00E5FF', '#00A8CC']}
              style={S.startBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Ionicons
                name={isLastInQueue ? 'trophy' : 'arrow-forward'}
                size={22}
                color="#050510"
              />
              <Text style={[S.startBtnTxt, { color: '#050510' }]}>
                {isLastInQueue ? 'النتائج النهائية' : 'اللغز التالي'}
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
        <LinearGradient colors={['#050510', '#001A1A', '#050510']} style={StyleSheet.absoluteFill} />
        <View style={[S.center, { paddingTop: topPad, paddingBottom: botPad }]}>
          <Ionicons name="help-circle" size={50} color="#00E5FF" />
          <Text style={[S.confirmTag, { color: colors.mutedForeground }]}>هل أجاب صح؟</Text>
          <Text style={[S.confirmPlayer, { color: cpColor }]}>{state.players[selectedPlayer]}</Text>
          <View style={[S.answerCard, { backgroundColor: colors.card, borderColor: '#FFD700' }]}>
            <Text style={[S.answerLabel, { color: colors.mutedForeground }]}>اللاعب المقصود</Text>
            <Text style={[S.answerTxt, { color: colors.foreground }]}>{puzzle?.answer}</Text>
          </View>
          <View style={S.confirmBtns}>
            <TouchableOpacity onPress={handleWrong} activeOpacity={0.85} style={{ flex: 1 }}>
              <LinearGradient colors={['#FF3B3B', '#CC1010']} style={S.confirmBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Ionicons name="close-circle" size={22} color="#FFF" />
                <Text style={S.confirmBtnTxt}>خطأ</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleCorrect} activeOpacity={0.85} style={{ flex: 1 }}>
              <LinearGradient colors={['#00E5FF', '#00A8CC']} style={S.confirmBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Ionicons name="checkmark-circle" size={22} color="#050510" />
                <Text style={[S.confirmBtnTxt, { color: '#050510' }]}>صحيح! +١</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  // ── Playing ───────────────────────────────────────────────────────────────
  return (
    <View style={[S.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={['#050510', '#001A1A', '#050510']} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={[S.playContent, { paddingTop: topPad + 12, paddingBottom: botPad + 24 }]}>
        <View style={S.headerRow}>
          <View style={[S.qPill, { borderColor: '#00E5FF' }]}>
            <Text style={[S.qPillTxt, { color: '#00E5FF' }]}>لغز {puzzleIdx + 1} / {puzzles.length}</Text>
          </View>
          <TouchableOpacity onPress={handleSkip} activeOpacity={0.85} disabled={isLastInQueue}>
            <View style={[S.skipPill, { borderColor: '#00E5FF', opacity: isLastInQueue ? 0.35 : 1 }]}>
              <Ionicons name="play-skip-forward" size={14} color="#00E5FF" />
              <Text style={[S.skipPillTxt, { color: '#00E5FF' }]}>تخطي هذا اللغز</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={[S.chainCard, { backgroundColor: colors.card, borderColor: '#00E5FF' }]}>
          <Text style={[S.chainTitle, { color: colors.mutedForeground }]}>مسار الانتقالات ← الأحدث أولاً</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.chainScroll}>
            {displayChain.map((club, i) => (
              <React.Fragment key={i}>
                {i > 0 && <Ionicons name="arrow-back" size={14} color="#00E5FF" style={{ opacity: 0.55 }} />}
                <ClubChip clubRaw={club} isNewest={i === 0} />
              </React.Fragment>
            ))}
          </ScrollView>
        </View>

        <View style={[S.hostAnswer, { backgroundColor: 'rgba(0,229,255,0.06)', borderColor: '#00E5FF' }]}>
          <Text style={[S.hostAnswerLbl, { color: colors.mutedForeground }]}>اللاعب — للمضيف فقط 👁</Text>
          <Text style={[S.hostAnswerTxt, { color: '#00E5FF' }]}>{puzzle?.answer}</Text>
        </View>

        <View style={[S.questionBanner, { borderColor: '#00E5FF', backgroundColor: 'rgba(0,229,255,0.08)' }]}>
          <Ionicons name="help-circle" size={22} color="#00E5FF" />
          <Text style={[S.questionBannerTxt, { color: '#00E5FF' }]}>من هو هذا اللاعب؟</Text>
        </View>

        <Text style={[S.buzzLabel, { color: colors.mutedForeground }]}>اضغط على اسم أول من صاح بالإجابة:</Text>

        <View style={S.buzzGrid}>
          {state.players.map((name, i) => {
            const pc = PLAYER_COLORS[i] ?? '#FFD700';
            return (
              <TouchableOpacity key={i} onPress={() => handlePlayerGuessed(i)} activeOpacity={0.85} style={{ flex: 1, minWidth: '45%' }}>
                <LinearGradient colors={[pc, `${pc}BB`]} style={S.buzzBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                  <Ionicons name="mic" size={22} color="#050510" />
                  <Text style={[S.buzzBtnTxt, { color: '#050510' }]}>{name}</Text>
                </LinearGradient>
              </TouchableOpacity>
            );
          })}
        </View>
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
  playContent: { paddingHorizontal: 18, gap: 14 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  qPill: { borderRadius: 20, borderWidth: 1.5, paddingVertical: 6, paddingHorizontal: 14 },
  qPillTxt: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  chainCard: { borderRadius: 20, borderWidth: 1.5, padding: 16, gap: 10 },
  chainTitle: { fontSize: 10, fontFamily: 'Inter_500Medium', letterSpacing: 1.5, textAlign: 'center' },
  chainScroll: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4 },
  hostAnswer: { borderRadius: 12, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center', gap: 4 },
  hostAnswerLbl: { fontSize: 10, fontFamily: 'Inter_500Medium', letterSpacing: 1 },
  hostAnswerTxt: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  questionBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 14, borderWidth: 1.5, paddingVertical: 12 },
  questionBannerTxt: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  buzzLabel: { fontSize: 13, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  buzzGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  buzzBtn: { paddingVertical: 22, borderRadius: 18, alignItems: 'center', justifyContent: 'center', gap: 8 },
  buzzBtnTxt: { fontSize: 14, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  skipPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, borderWidth: 1.5, paddingVertical: 6, paddingHorizontal: 12 },
  skipPillTxt: { fontSize: 12, fontFamily: 'Inter_700Bold' },
});
