/**
 * Multiplayer Round 2 — المزاد (Sequential Open Bidding)
 *
 * Rules:
 * - 3 topics. For each topic, an auction takes place.
 * - Players bid in sequence. Pass = eliminated from this topic's auction.
 * - Last remaining player must answer at least (bid) items from possibleAnswers.
 * - If they succeed: win (bid) points. If they fail: 0 points.
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

type Phase = 'intro' | 'bidding' | 'testing' | 'topic_result' | 'round_done';

export default function MpRound2Screen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const colors  = useColors();
  const { state, addScore, nextRound } = useMultiplayer();
  const { playCorrect, playWrong, playFanfare } = useSounds(state.isMuted);

  const topics = state.auctionTopics;
  const n      = state.players.length;

  const [phase, setPhase]       = useState<Phase>('intro');
  const [topicIdx, setTopicIdx] = useState(0);

  // Bidding state
  const [bids, setBids]         = useState<(number | null)[]>(() => Array(n).fill(null));
  const [passed, setPassed]     = useState<boolean[]>(() => Array(n).fill(false));
  const [currentBidder, setCurrentBidder] = useState(0);
  const [currentBid, setCurrentBid]       = useState(1);
  const [auctionWinner, setAuctionWinner] = useState<number | null>(null);

  // Testing state
  const [correct, setCorrect] = useState(0);
  const [wrong,   setWrong]   = useState(0);
  const [testPhaseResult, setTestPhaseResult] = useState<'win' | 'lose' | null>(null);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const topic = topics[topicIdx];

  const resetAuction = () => {
    setBids(Array(n).fill(null));
    setPassed(Array(n).fill(false));
    setCurrentBidder(0);
    setCurrentBid(1);
    setAuctionWinner(null);
    setCorrect(0);
    setWrong(0);
    setTestPhaseResult(null);
  };

  const nextActiveBidder = useCallback((from: number, passedArr: boolean[]) => {
    for (let i = 1; i <= n; i++) {
      const idx = (from + i) % n;
      if (!passedArr[idx]) return idx;
    }
    return from;
  }, [n]);

  const remainingBidders = (passedArr: boolean[]) => passedArr.filter(p => !p).length;

  const handlePass = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const np = [...passed];
    np[currentBidder] = true;
    setPassed(np);

    if (remainingBidders(np) === 1) {
      // Find the last remaining player
      const winner = np.findIndex(p => !p);
      setAuctionWinner(winner);
      setPhase('testing');
    } else {
      setCurrentBidder(nextActiveBidder(currentBidder, np));
    }
  };

  const handleRaise = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newBid = currentBid + 1;
    const maxBid = topic?.possibleAnswers?.length ?? 10;
    if (newBid > maxBid) return;
    setCurrentBid(newBid);
    const nb = [...bids];
    nb[currentBidder] = newBid;
    setBids(nb);
    setCurrentBidder(nextActiveBidder(currentBidder, passed));
  };

  const handleCorrectAnswer = () => {
    playCorrect();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const newCorrect = correct + 1;
    setCorrect(newCorrect);
    if (newCorrect >= currentBid) {
      // Won the auction!
      if (auctionWinner !== null) addScore(auctionWinner, currentBid);
      playFanfare();
      setTestPhaseResult('win');
    }
  };

  const handleWrongAnswer = () => {
    playWrong();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    const newWrong = wrong + 1;
    setWrong(newWrong);
    const remaining = (topic?.possibleAnswers?.length ?? 0) - correct - newWrong;
    const needed = currentBid - correct;
    if (remaining < needed) {
      // Can't possibly win anymore
      setTestPhaseResult('lose');
    }
  };

  const handleNextTopic = () => {
    resetAuction();
    if (topicIdx >= topics.length - 1) {
      playFanfare();
      setPhase('round_done');
    } else {
      setTopicIdx(i => i + 1);
      setPhase('bidding');
    }
  };

  const handleFinishRound = () => {
    nextRound();
    router.back();
  };

  if (!topics?.length) {
    return (
      <View style={[S.root, { backgroundColor: '#050510', alignItems: 'center', justifyContent: 'center' }]}>
        <Text style={{ color: '#555', fontSize: 16 }}>جارٍ تحضير المواضيع...</Text>
      </View>
    );
  }

  // ── Intro ─────────────────────────────────────────────────────────────────
  if (phase === 'intro') {
    return (
      <View style={[S.root, { backgroundColor: colors.background }]}>
        <LinearGradient colors={['#050510', '#1A1100', '#050510']} style={StyleSheet.absoluteFill} />
        <View style={[S.center, { paddingTop: topPad, paddingBottom: botPad }]}>
          <View style={[S.badge, { borderColor: '#FFD700' }]}>
            <Ionicons name="podium" size={52} color="#FFD700" />
          </View>
          <Text style={[S.roundTag, { color: colors.mutedForeground }]}>الجولة الثانية — جماعي</Text>
          <Text style={[S.roundTitle, { color: '#FFD700' }]}>المزاد</Text>
          <Text style={[S.desc, { color: colors.mutedForeground }]}>
            {'٣ مواضيع — كل موضوع يُزاد عليه\nكل لاعب يزايد أو يمرر\nمن يمرر يخرج من هذا المزاد\nالأخير الباقي يجب أن يُوفّي رهانه للفوز'}
          </Text>
          <View style={S.playersGrid}>
            {state.players.map((name, i) => (
              <View key={i} style={[S.playerPill, { borderColor: PLAYER_COLORS[i] ?? '#FFD700', backgroundColor: `${PLAYER_COLORS[i] ?? '#FFD700'}15` }]}>
                <Text style={[S.playerPillTxt, { color: PLAYER_COLORS[i] ?? '#FFD700' }]}>{name}</Text>
              </View>
            ))}
          </View>
          <TouchableOpacity onPress={() => setPhase('bidding')} activeOpacity={0.85} style={S.fullW}>
            <LinearGradient colors={['#FFD700', '#FFA500']} style={S.startBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Ionicons name="play" size={22} color="#050510" />
              <Text style={[S.startBtnTxt, { color: '#050510' }]}>ابدأ المزاد</Text>
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
        <LinearGradient colors={['#050510', '#1A1100', '#050510']} style={StyleSheet.absoluteFill} />
        <View style={[S.center, { paddingTop: topPad, paddingBottom: botPad }]}>
          <Ionicons name="trophy" size={64} color="#FFD700" />
          <Text style={[S.roundTag, { color: colors.mutedForeground }]}>نهاية الجولة الثانية</Text>
          <Text style={[S.roundTitle, { color: '#FFD700' }]}>انتهى المزاد!</Text>
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
              <Text style={S.startBtnTxt}>التالي: الجرس</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Topic Result ──────────────────────────────────────────────────────────
  if (phase === 'topic_result') {
    const isWin = testPhaseResult === 'win';
    return (
      <View style={[S.root, { backgroundColor: colors.background }]}>
        <LinearGradient colors={['#050510', '#08082A', '#050510']} style={StyleSheet.absoluteFill} />
        <View style={[S.center, { paddingTop: topPad, paddingBottom: botPad }]}>
          <Ionicons name={isWin ? 'trophy' : 'close-circle'} size={64} color={isWin ? '#FFD700' : '#FF3B3B'} />
          <Text style={[S.resultWinner, { color: isWin ? '#FFD700' : '#FF3B3B' }]}>
            {isWin
              ? `🏆 ${auctionWinner !== null ? state.players[auctionWinner] : '?'} وفّى رهانه! +${currentBid} نقاط`
              : `😞 ${auctionWinner !== null ? state.players[auctionWinner] : '?'} لم يوفِّ — لا نقاط`}
          </Text>
          <Text style={[S.desc, { color: colors.mutedForeground }]}>
            أجاب صحيح: {correct} / المطلوب: {currentBid}
          </Text>
          <TouchableOpacity onPress={handleNextTopic} activeOpacity={0.85} style={S.fullW}>
            <LinearGradient
              colors={topicIdx >= topics.length - 1 ? ['#FFD700', '#FFA500'] : ['#FFD700', '#FFA500']}
              style={S.startBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Ionicons name={topicIdx >= topics.length - 1 ? 'checkmark-done' : 'arrow-forward'} size={22} color="#050510" />
              <Text style={[S.startBtnTxt, { color: '#050510' }]}>
                {topicIdx >= topics.length - 1 ? 'إنهاء الجولة' : 'الموضوع التالي'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Testing Phase ─────────────────────────────────────────────────────────
  if (phase === 'testing') {
    const winnerName = auctionWinner !== null ? state.players[auctionWinner] : '?';
    const winnerColor = auctionWinner !== null ? (PLAYER_COLORS[auctionWinner] ?? '#FFD700') : '#FFD700';
    const needed = currentBid - correct;
    const remaining = (topic?.possibleAnswers?.length ?? 0) - correct - wrong;

    if (testPhaseResult !== null) {
      return (
        <View style={[S.root, { backgroundColor: colors.background }]}>
          <LinearGradient colors={['#050510', '#08082A', '#050510']} style={StyleSheet.absoluteFill} />
          <View style={[S.center, { paddingTop: topPad, paddingBottom: botPad }]}>
            <Ionicons name={testPhaseResult === 'win' ? 'trophy' : 'close-circle'} size={64} color={testPhaseResult === 'win' ? '#FFD700' : '#FF3B3B'} />
            <Text style={[S.resultWinner, { color: testPhaseResult === 'win' ? '#FFD700' : '#FF3B3B' }]}>
              {testPhaseResult === 'win' ? `🏆 ${winnerName} وفّى! +${currentBid} نقاط` : `😞 ${winnerName} لم يوفِّ — لا نقاط`}
            </Text>
            <TouchableOpacity onPress={() => { setPhase('topic_result'); handleNextTopic(); }} activeOpacity={0.85} style={S.fullW}>
              <LinearGradient colors={['#FFD700', '#FFA500']} style={S.startBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Ionicons name="arrow-forward" size={22} color="#050510" />
                <Text style={[S.startBtnTxt, { color: '#050510' }]}>
                  {topicIdx >= topics.length - 1 ? 'إنهاء الجولة' : 'الموضوع التالي'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    return (
      <View style={[S.root, { backgroundColor: colors.background }]}>
        <LinearGradient colors={['#050510', '#1A1100', '#050510']} style={StyleSheet.absoluteFill} />
        <ScrollView contentContainerStyle={[S.playContent, { paddingTop: topPad + 12, paddingBottom: botPad + 24 }]}>
          <View style={S.headerRow}>
            <Text style={[S.sectionLabel, { color: colors.mutedForeground }]}>اختبار الرهان</Text>
            <View style={[S.bidBadge, { borderColor: winnerColor }]}>
              <Text style={[S.bidBadgeTxt, { color: winnerColor }]}>رهان: {currentBid}</Text>
            </View>
          </View>
          <View style={[S.winnerBanner, { borderColor: winnerColor, backgroundColor: `${winnerColor}12` }]}>
            <Text style={[S.winnerBannerTxt, { color: winnerColor }]}>{winnerName} يتحدى!</Text>
          </View>
          <View style={[S.topicCard, { backgroundColor: colors.card, borderColor: '#FFD700' }]}>
            <Text style={[S.topicCategory, { color: '#FFD700' }]}>{topic?.category}</Text>
            <Text style={[S.topicDesc, { color: colors.foreground }]}>{topic?.description}</Text>
          </View>
          <View style={S.progressRow}>
            <View style={[S.progressChip, { borderColor: '#00C853', backgroundColor: 'rgba(0,200,83,0.12)' }]}>
              <Ionicons name="checkmark-circle" size={16} color="#00C853" />
              <Text style={[S.progressChipTxt, { color: '#00C853' }]}>صحيح: {correct} / {currentBid}</Text>
            </View>
            <View style={[S.progressChip, { borderColor: '#FF3B3B', backgroundColor: 'rgba(255,59,59,0.12)' }]}>
              <Ionicons name="close-circle" size={16} color="#FF3B3B" />
              <Text style={[S.progressChipTxt, { color: '#FF3B3B' }]}>خطأ: {wrong}</Text>
            </View>
            <View style={[S.progressChip, { borderColor: '#FFD700', backgroundColor: 'rgba(255,215,0,0.10)' }]}>
              <Text style={[S.progressChipTxt, { color: '#FFD700' }]}>متبقٍ: {remaining}</Text>
            </View>
          </View>
          <Text style={[S.hostNote, { color: colors.mutedForeground }]}>
            يحتاج {needed} إجابة صحيحة أخرى للفوز
          </Text>
          <View style={S.controlsRow}>
            <TouchableOpacity onPress={handleWrongAnswer} activeOpacity={0.85} style={{ flex: 1 }}>
              <LinearGradient colors={['#FF3B3B', '#CC1010']} style={S.controlBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Ionicons name="close-circle" size={22} color="#FFF" />
                <Text style={S.controlBtnTxt}>خطأ ❌</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleCorrectAnswer} activeOpacity={0.85} style={{ flex: 1 }}>
              <LinearGradient colors={['#00C853', '#009624']} style={S.controlBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Ionicons name="checkmark-circle" size={22} color="#FFF" />
                <Text style={S.controlBtnTxt}>صحيح ✓</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
          {/* Possible answers hint */}
          <View style={[S.answersSection, { backgroundColor: 'rgba(255,215,0,0.05)', borderColor: '#FFD700' }]}>
            <Text style={[S.answersTitle, { color: '#FFD700' }]}>👁 الإجابات الممكنة (للمضيف فقط)</Text>
            <View style={S.answersList}>
              {(topic?.possibleAnswers ?? []).map((ans, i) => (
                <View key={i} style={[S.answerChip, { backgroundColor: colors.card, borderColor: '#FFD700' }]}>
                  <Text style={[S.answerChipTxt, { color: colors.foreground }]}>{ans}</Text>
                </View>
              ))}
            </View>
          </View>
        </ScrollView>
      </View>
    );
  }

  // ── Bidding Phase ─────────────────────────────────────────────────────────
  const currentBidderColor = PLAYER_COLORS[currentBidder] ?? '#FFD700';
  const activeBidders = passed.filter(p => !p).length;
  const maxBid = topic?.possibleAnswers?.length ?? 10;

  return (
    <View style={[S.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={['#050510', '#1A1100', '#050510']} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={[S.playContent, { paddingTop: topPad + 12, paddingBottom: botPad + 24 }]}>
        <View style={S.headerRow}>
          <Text style={[S.sectionLabel, { color: colors.mutedForeground }]}>
            موضوع {topicIdx + 1} من {topics.length}
          </Text>
          <Text style={[S.sectionLabel, { color: '#FFD700' }]}>{activeBidders} لاعبين باقين</Text>
        </View>

        <View style={[S.topicCard, { backgroundColor: colors.card, borderColor: '#FFD700' }]}>
          <Text style={[S.topicCategory, { color: '#FFD700' }]}>{topic?.category}</Text>
          <Text style={[S.topicDesc, { color: colors.foreground }]}>{topic?.description}</Text>
        </View>

        {/* Current bid display */}
        <View style={[S.bidDisplay, { borderColor: '#FFD700' }]}>
          <Text style={[S.bidLabel, { color: colors.mutedForeground }]}>الرهان الحالي</Text>
          <Text style={[S.bidAmount, { color: '#FFD700' }]}>{currentBid}</Text>
          <Text style={[S.bidSub, { color: colors.mutedForeground }]}>من أصل {maxBid} إجابة ممكنة</Text>
        </View>

        {/* Players status */}
        {state.players.map((name, i) => {
          const pc = PLAYER_COLORS[i] ?? '#FFD700';
          const isCurrentBidder = i === currentBidder && !passed[i];
          const hasPassed = passed[i];
          return (
            <View key={i} style={[
              S.bidderRow,
              {
                borderColor: hasPassed ? '#333' : isCurrentBidder ? pc : colors.border,
                backgroundColor: hasPassed ? '#0A0A0A' : isCurrentBidder ? `${pc}15` : colors.card,
                opacity: hasPassed ? 0.4 : 1,
              },
            ]}>
              <Text style={[S.bidderName, { color: hasPassed ? '#555' : isCurrentBidder ? pc : colors.mutedForeground }]}>
                {name}{isCurrentBidder ? ' 🎙' : hasPassed ? ' — مرّر' : ''}
              </Text>
              {bids[i] !== null && !hasPassed && (
                <View style={[S.playerBidChip, { borderColor: pc }]}>
                  <Text style={[S.playerBidTxt, { color: pc }]}>زاد {bids[i]}</Text>
                </View>
              )}
            </View>
          );
        })}

        {/* Bidding controls */}
        <View style={[S.turnBanner, { backgroundColor: `${currentBidderColor}18`, borderColor: currentBidderColor }]}>
          <Text style={[S.turnBannerTxt, { color: currentBidderColor }]}>
            دور {state.players[currentBidder]}
          </Text>
        </View>

        <View style={S.controlsRow}>
          <TouchableOpacity
            onPress={handlePass}
            activeOpacity={0.85}
            style={{ flex: 1 }}
            disabled={activeBidders <= 1}
          >
            <LinearGradient colors={['#444', '#222']} style={S.controlBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Ionicons name="hand-right" size={22} color="#FFF" />
              <Text style={S.controlBtnTxt}>مرّر</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleRaise}
            activeOpacity={0.85}
            style={{ flex: 1 }}
            disabled={currentBid >= maxBid}
          >
            <LinearGradient
              colors={currentBid >= maxBid ? ['#333', '#222'] : ['#FFD700', '#FFA500']}
              style={S.controlBtn}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            >
              <Ionicons name="trending-up" size={22} color={currentBid >= maxBid ? '#666' : '#050510'} />
              <Text style={[S.controlBtnTxt, { color: currentBid >= maxBid ? '#666' : '#050510' }]}>
                زايد ← {Math.min(currentBid + 1, maxBid)}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
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
  playContent: { paddingHorizontal: 18, gap: 14 },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold', letterSpacing: 1 },
  topicCard: { borderRadius: 20, borderWidth: 1.5, padding: 20, gap: 10 },
  topicCategory: { fontSize: 14, fontFamily: 'Inter_700Bold', textAlign: 'center', letterSpacing: 1 },
  topicDesc: { fontSize: 17, fontFamily: 'Inter_600SemiBold', textAlign: 'right', lineHeight: 28 },
  bidDisplay: { borderRadius: 16, borderWidth: 1.5, padding: 20, alignItems: 'center', gap: 4 },
  bidLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', letterSpacing: 1.5 },
  bidAmount: { fontSize: 56, fontFamily: 'Inter_700Bold' },
  bidSub: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  bidderRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, borderWidth: 1.5, paddingVertical: 12, paddingHorizontal: 16 },
  bidderName: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  playerBidChip: { borderRadius: 8, borderWidth: 1, paddingVertical: 4, paddingHorizontal: 10 },
  playerBidTxt: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  turnBanner: { borderRadius: 14, borderWidth: 1.5, paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  turnBannerTxt: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  controlsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  controlBtn: { paddingVertical: 16, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  controlBtnTxt: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#FFF' },
  winnerBanner: { borderRadius: 14, borderWidth: 1.5, paddingVertical: 12, alignItems: 'center' },
  winnerBannerTxt: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  progressRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  progressChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, borderWidth: 1, paddingVertical: 6, paddingHorizontal: 10 },
  progressChipTxt: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  hostNote: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  bidBadge: { borderRadius: 10, borderWidth: 1.5, paddingVertical: 4, paddingHorizontal: 12 },
  bidBadgeTxt: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  answersSection: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 12 },
  answersTitle: { fontSize: 12, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  answersList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' },
  answerChip: { borderRadius: 10, borderWidth: 1, paddingVertical: 6, paddingHorizontal: 10 },
  answerChipTxt: { fontSize: 13, fontFamily: 'Inter_500Medium' },
});
