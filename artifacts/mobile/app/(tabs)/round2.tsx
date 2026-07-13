import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useGame } from '@/contexts/GameContext';
import { Timer } from '@/components/Timer';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSounds } from '@/hooks/useSounds';

type Phase = 'setup' | 'timer' | 'result';

// Scoring tier based on bid size
function auctionPoints(bid: number): number {
  if (bid >= 30) return 3;
  if (bid >= 20) return 2;
  return 1;
}

export default function Round2Screen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { state, addScore, nextRound } = useGame();
  const { playCorrect, playWrong, startTick, stopTick } = useSounds(state.isMuted);

  const [phase, setPhase]               = useState<Phase>('setup');
  const [bids, setBids]                 = useState<[number, number]>([5, 5]);
  const [winner, setWinner]             = useState<0 | 1>(0);
  const [timerRunning, setTimerRunning] = useState(false);
  const [auctionIdx, setAuctionIdx]     = useState(0);   // 0, 1, 2

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const topic = state.auctionTopics?.[auctionIdx];
  const isLastAuction = auctionIdx >= 2;
  const pts = auctionPoints(bids[winner]);

  const adjustBid = (player: 0 | 1, delta: number) => {
    setBids(prev => {
      const next: [number, number] = [prev[0], prev[1]];
      next[player] = Math.max(1, next[player] + delta);
      return next;
    });
    Haptics.selectionAsync();
  };

  const confirmAuction = () => {
    const w: 0 | 1 = bids[0] >= bids[1] ? 0 : 1;
    setWinner(w);
    setPhase('timer');
    setTimerRunning(true);
    startTick();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  };

  const handleTimerDone = () => {
    setTimerRunning(false);
    stopTick();
    setPhase('result');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  };

  const endTimerEarly = () => {
    setTimerRunning(false);
    stopTick();
    setPhase('result');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleResult = (success: boolean) => {
    if (success) {
      playCorrect();
      addScore(winner, pts);
    } else {
      playWrong();
    }
    if (isLastAuction) {
      nextRound();
      router.back();
    } else {
      setAuctionIdx(i => i + 1);
      setBids([5, 5]);
      setPhase('setup');
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const winnerColor = winner === 0 ? '#7B2FFF' : '#00E5FF';

  // ── Timer Phase ──────────────────────────────────────────────────────
  if (phase === 'timer') {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <LinearGradient colors={['#050510', '#150800', '#050510']} style={StyleSheet.absoluteFill} />
        <View style={[styles.content, { paddingTop: topPad + 12, paddingBottom: botPad + 20 }]}>
          {/* Header */}
          <View style={styles.timerHeader}>
            <Text style={[styles.auctionPill, { color: '#FFD700', borderColor: '#FFD700' }]}>
              المزاد {auctionIdx + 1} من ٣
            </Text>
            <View style={[styles.ptsTier, { borderColor: winnerColor }]}>
              <Text style={[styles.ptsTierTxt, { color: winnerColor }]}>+{pts} نقطة</Text>
            </View>
          </View>

          <Text style={[styles.timerPlayer, { color: winnerColor }]}>{state.players[winner]}</Text>
          <Text style={[styles.timerBid, { color: colors.primary }]}>
            {bids[winner]} إجابة في ٣٠ ثانية
          </Text>

          <View style={[styles.topicBadge, { borderColor: colors.primary, backgroundColor: 'rgba(255,215,0,0.08)' }]}>
            <Text style={[styles.topicBadgeTxt, { color: colors.primary }]}>{topic?.category ?? ''}</Text>
          </View>

          <Timer seconds={30} running={timerRunning} onComplete={handleTimerDone} />

          {/* Possible answers list for host */}
          <Text style={[styles.answersTitle, { color: colors.mutedForeground }]}>إجابات مقبولة (للمضيف):</Text>
          <ScrollView style={styles.answersList} showsVerticalScrollIndicator={false}>
            <View style={styles.answersGrid}>
              {(topic?.possibleAnswers ?? []).map((ans, i) => (
                <View key={i} style={[styles.answerChip, { borderColor: '#FFD700', backgroundColor: 'rgba(255,215,0,0.06)' }]}>
                  <Text style={[styles.answerChipTxt, { color: colors.foreground }]}>{ans}</Text>
                </View>
              ))}
            </View>
          </ScrollView>

          {/* End Timer Early */}
          <TouchableOpacity onPress={endTimerEarly} activeOpacity={0.85}>
            <View style={[styles.endEarlyBtn, { borderColor: '#FF3B3B', backgroundColor: 'rgba(255,59,59,0.08)' }]}>
              <Ionicons name="stop-circle-outline" size={20} color="#FF3B3B" />
              <Text style={[styles.endEarlyTxt, { color: '#FF3B3B' }]}>إنهاء الوقت مبكرًا</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Result Phase ─────────────────────────────────────────────────────
  if (phase === 'result') {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <LinearGradient colors={['#050510', '#100800', '#050510']} style={StyleSheet.absoluteFill} />
        <View style={[styles.center, { paddingTop: topPad, paddingBottom: botPad }]}>
          <Ionicons name="help-circle" size={60} color={colors.primary} />
          <Text style={[styles.resultTitle, { color: colors.foreground }]}>هل نجح التحدي؟</Text>
          <Text style={[styles.resultPlayer, { color: winnerColor }]}>{state.players[winner]}</Text>
          <Text style={[styles.resultBid, { color: colors.primary }]}>
            التحدي: {bids[winner]} إجابة
          </Text>
          <View style={[styles.ptsTierResult, { borderColor: '#FFD700', backgroundColor: 'rgba(255,215,0,0.1)' }]}>
            <Text style={[styles.ptsTierResultTxt, { color: '#FFD700' }]}>
              {bids[winner] >= 30 ? '٣٠+ إجابة = ٣ نقاط' :
               bids[winner] >= 20 ? '٢٠–٢٩ إجابة = ٢ نقطة' :
                                    '١–١٩ إجابة = ١ نقطة'}
            </Text>
          </View>
          <View style={styles.resultBtns}>
            <TouchableOpacity onPress={() => handleResult(false)} activeOpacity={0.85} style={{ flex: 1 }}>
              <LinearGradient colors={['#FF3B3B', '#CC1010']} style={styles.resultBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Ionicons name="close-circle" size={24} color="#FFF" />
                <Text style={styles.resultBtnTxt}>فشل — ٠ نقطة</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => handleResult(true)} activeOpacity={0.85} style={{ flex: 1 }}>
              <LinearGradient colors={['#00C853', '#009624']} style={styles.resultBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Ionicons name="checkmark-circle" size={24} color="#FFF" />
                <Text style={styles.resultBtnTxt}>نجح +{pts}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
          {!isLastAuction && (
            <Text style={[styles.nextAuctionHint, { color: colors.mutedForeground }]}>
              المزاد {auctionIdx + 2} من ٣ قادم
            </Text>
          )}
        </View>
      </View>
    );
  }

  // ── Setup Phase ──────────────────────────────────────────────────────
  const higherBidder: 0 | 1 = bids[0] >= bids[1] ? 0 : 1;
  const higherColor = higherBidder === 0 ? '#7B2FFF' : '#00E5FF';
  const previewPts = auctionPoints(bids[higherBidder]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={['#050510', '#100800', '#050510']} style={StyleSheet.absoluteFill} />
      <View style={[styles.content, { paddingTop: topPad + 12, paddingBottom: botPad + 24 }]}>
        <View style={styles.setupHeader}>
          <Text style={[styles.roundTitle, { color: colors.primary }]}>الجولة الثانية: المزاد</Text>
          <Text style={[styles.auctionCounter, { color: colors.mutedForeground }]}>
            مسابقة {auctionIdx + 1} من ٣
          </Text>
        </View>

        {/* Topic */}
        <View style={[styles.topicCard, { backgroundColor: colors.card, borderColor: '#FFD700' }]}>
          <Text style={[styles.topicCat, { color: colors.primary }]}>{topic?.category ?? ''}</Text>
          <Text style={[styles.topicDesc, { color: colors.foreground }]}>{topic?.description ?? ''}</Text>
        </View>

        <Text style={[styles.bidLabel, { color: colors.mutedForeground }]}>
          كم إجابة تستطيع تسمية في ٣٠ ثانية؟
        </Text>

        {/* Bid controls */}
        {([0, 1] as const).map(p => (
          <View key={p} style={[styles.bidRow, { backgroundColor: colors.card, borderColor: p === 0 ? '#7B2FFF' : '#00E5FF' }]}>
            <Text style={[styles.bidPlayer, { color: p === 0 ? '#7B2FFF' : '#00E5FF' }]}>
              {state.players[p]}
            </Text>
            <View style={styles.bidControls}>
              <TouchableOpacity onPress={() => adjustBid(p, -5)} style={[styles.bidBtn, { borderColor: colors.border }]}>
                <Text style={[styles.bidBtnTxt, { color: colors.mutedForeground }]}>-5</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => adjustBid(p, -1)} style={[styles.bidBtn, { borderColor: colors.border }]}>
                <Ionicons name="remove" size={20} color={colors.foreground} />
              </TouchableOpacity>
              <Text style={[styles.bidNum, { color: colors.foreground }]}>{bids[p]}</Text>
              <TouchableOpacity onPress={() => adjustBid(p, 1)} style={[styles.bidBtn, { borderColor: colors.border }]}>
                <Ionicons name="add" size={20} color={colors.foreground} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => adjustBid(p, 5)} style={[styles.bidBtn, { borderColor: colors.border }]}>
                <Text style={[styles.bidBtnTxt, { color: colors.mutedForeground }]}>+5</Text>
              </TouchableOpacity>
            </View>
          </View>
        ))}

        {/* Score preview */}
        <View style={[styles.winnerPreview, { borderColor: higherColor, backgroundColor: `${higherColor}10` }]}>
          <Text style={[styles.winnerPreviewTxt, { color: higherColor }]}>
            الفائز بالمزاد: {state.players[higherBidder]} ({bids[higherBidder]} إجابة) ← {previewPts} نقطة
          </Text>
        </View>

        <View style={{ flex: 1 }} />

        <TouchableOpacity onPress={confirmAuction} activeOpacity={0.85}>
          <LinearGradient
            colors={['#FFD700', '#FFA500']}
            style={styles.startBtn}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          >
            <Ionicons name="timer" size={24} color="#050510" />
            <Text style={styles.startBtnTxt}>ابدأ التحدي</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 16 },
  content: { flex: 1, paddingHorizontal: 20, gap: 12 },
  setupHeader: { alignItems: 'center', gap: 4 },
  roundTitle: { fontSize: 15, fontFamily: 'Inter_700Bold', textAlign: 'center', letterSpacing: 1 },
  auctionCounter: { fontSize: 12, fontFamily: 'Inter_500Medium', letterSpacing: 1 },
  topicCard: { borderRadius: 20, borderWidth: 1.5, padding: 18, gap: 6, alignItems: 'flex-end' },
  topicCat: { fontSize: 18, fontFamily: 'Inter_700Bold', textAlign: 'right' },
  topicDesc: { fontSize: 15, fontFamily: 'Inter_500Medium', textAlign: 'right', lineHeight: 24 },
  bidLabel: { fontSize: 13, fontFamily: 'Inter_500Medium', textAlign: 'center', letterSpacing: 0.5 },
  bidRow: {
    borderRadius: 16, borderWidth: 1.5, paddingVertical: 12, paddingHorizontal: 14,
    flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between',
  },
  bidPlayer: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  bidControls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  bidBtn: {
    width: 36, height: 36, borderRadius: 10, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A22',
  },
  bidBtnTxt: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  bidNum: { fontSize: 28, fontFamily: 'Inter_700Bold', minWidth: 44, textAlign: 'center' },
  winnerPreview: { borderRadius: 12, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'flex-end' },
  winnerPreviewTxt: { fontSize: 13, fontFamily: 'Inter_600SemiBold', textAlign: 'right' },
  startBtn: {
    paddingVertical: 18, borderRadius: 20,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12,
    shadowColor: '#FFD700', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.55, shadowRadius: 24, elevation: 16,
  },
  startBtnTxt: { fontSize: 20, fontFamily: 'Inter_700Bold', color: '#050510' },
  // Timer phase
  timerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  auctionPill: { borderRadius: 20, borderWidth: 1.5, paddingVertical: 6, paddingHorizontal: 14, fontSize: 13, fontFamily: 'Inter_700Bold' },
  ptsTier: { borderRadius: 12, borderWidth: 1.5, paddingVertical: 6, paddingHorizontal: 12 },
  ptsTierTxt: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  timerPlayer: { fontSize: 32, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  timerBid: { fontSize: 18, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  topicBadge: { borderRadius: 12, borderWidth: 1.5, paddingVertical: 8, paddingHorizontal: 16 },
  topicBadgeTxt: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  answersTitle: { fontSize: 11, fontFamily: 'Inter_500Medium', letterSpacing: 1, textAlign: 'right' },
  answersList: { flex: 1, marginVertical: 2 },
  answersGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'flex-end' },
  answerChip: { borderRadius: 10, borderWidth: 1, paddingVertical: 6, paddingHorizontal: 12 },
  answerChipTxt: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  endEarlyBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 12, borderWidth: 1, paddingVertical: 12,
  },
  endEarlyTxt: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  // Result phase
  resultTitle: { fontSize: 22, fontFamily: 'Inter_700Bold', letterSpacing: 1 },
  resultPlayer: { fontSize: 32, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  resultBid: { fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  ptsTierResult: { borderRadius: 14, borderWidth: 1.5, paddingVertical: 10, paddingHorizontal: 18 },
  ptsTierResultTxt: { fontSize: 14, fontFamily: 'Inter_600SemiBold', textAlign: 'center' },
  resultBtns: { flexDirection: 'row', gap: 12, width: '100%' },
  resultBtn: {
    paddingVertical: 18, borderRadius: 16,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  resultBtnTxt: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#FFF' },
  nextAuctionHint: { fontSize: 13, fontFamily: 'Inter_500Medium', textAlign: 'center' },
});
