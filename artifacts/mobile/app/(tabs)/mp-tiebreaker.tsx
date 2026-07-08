/**
 * Multiplayer Tiebreaker — الهدف الذهبي
 *
 * Rules:
 * - All players tied for 1st (with score strictly higher than the rest) enter simultaneously.
 * - Host reads a new transfer puzzle (+5% difficulty conceptually — just pick from medium/hard pool).
 * - First to shout the correct answer wins the entire game.
 * - Host selects which tied player answered first.
 * - "تغيير لاعب" bypass button to change the selected player.
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform, Animated, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useMultiplayer, PLAYER_COLORS } from '@/contexts/MultiplayerContext';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useGroupSounds } from '@/hooks/useGroupSounds';
import { addLeaderboardEntry } from '@/lib/leaderboard';

const { width: W, height: H } = Dimensions.get('window');

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

// Confetti
const CONFETTI_COLORS = ['#FFD700', '#FF3B3B', '#7B2FFF', '#00E5FF', '#00C853', '#FF6B00', '#FF69B4', '#FFFFFF'];
function Confetti() {
  const particles = useRef(Array.from({ length: 60 }, () => ({
    x: new Animated.Value(Math.random() * W),
    y: new Animated.Value(-20 - Math.random() * 80),
    opacity: new Animated.Value(1),
    rotate: new Animated.Value(0),
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    size: 5 + Math.random() * 9,
    isRect: Math.random() > 0.5,
  }))).current;
  useEffect(() => {
    const anims = particles.map((p, i) => {
      const delay = i * 26;
      const duration = 2000 + Math.random() * 2000;
      const targetX = (p.x as any)._value + (Math.random() - 0.5) * 160;
      return Animated.parallel([
        Animated.timing(p.y, { toValue: H + 40, duration, delay, useNativeDriver: true }),
        Animated.timing(p.x, { toValue: targetX, duration, delay, useNativeDriver: true }),
        Animated.timing(p.rotate, { toValue: Math.random() > 0.5 ? 10 : -10, duration, delay, useNativeDriver: true }),
        Animated.timing(p.opacity, { toValue: 0, duration: duration * 0.35, delay: delay + duration * 0.65, useNativeDriver: true }),
      ]);
    });
    Animated.parallel(anims).start();
  }, []);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((p, i) => {
        const spin = p.rotate.interpolate({ inputRange: [-10, 10], outputRange: ['-720deg', '720deg'] });
        return (
          <Animated.View key={i} style={{ position: 'absolute', width: p.size, height: p.isRect ? p.size * 0.4 : p.size, borderRadius: p.isRect ? 2 : p.size / 2, backgroundColor: p.color, transform: [{ translateX: p.x }, { translateY: p.y }, { rotate: spin }], opacity: p.opacity }} />
        );
      })}
    </View>
  );
}

type Phase = 'intro' | 'play' | 'confirming' | 'winner';

export default function MpTiebreakerScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const colors  = useColors();
  const { state, addScore, resetGame } = useMultiplayer();
  const { playCorrect, playWrong, playFanfare } = useGroupSounds(state.isMuted);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  // Determine tied players
  const maxScore = Math.max(...state.scores);
  const tiedIndices = state.scores
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s === maxScore)
    .map(({ i }) => i);

  const puzzle = state.tiebreakerPuzzle;
  const [activePuzzle, setActivePuzzle] = useState(puzzle);
  const [skippedIds, setSkippedIds]     = useState<Set<string>>(() => new Set(puzzle ? [puzzle.id] : []));

  const handleSkip = () => {
    const pool = state.tiebreakerPool;
    const available = pool.filter(p => !skippedIds.has(p.id));
    const candidates = available.length > 0 ? available : pool.filter(p => p.id !== activePuzzle?.id);
    if (candidates.length === 0) return;
    const next = candidates[Math.floor(Math.random() * candidates.length)];
    setSkippedIds(prev => new Set([...prev, next.id]));
    setActivePuzzle(next);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const [phase, setPhase]           = useState<Phase>('intro');
  const [selectedPlayer, setSelectedPlayer] = useState<number | null>(null);
  const [winner, setWinner]         = useState<number | null>(null);

  const [saved, setSaved]           = useState(false);
  const [saving, setSaving]         = useState(false);
  const [savedIsNewRecord, setSavedIsNewRecord] = useState(false);

  const trophyScale   = useRef(new Animated.Value(0)).current;
  const trophyOpacity = useRef(new Animated.Value(0)).current;
  const nameSlide     = useRef(new Animated.Value(40)).current;
  const nameOpacity   = useRef(new Animated.Value(0)).current;

  const startWinnerAnim = useCallback(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 280);
    Animated.parallel([
      Animated.spring(trophyScale, { toValue: 1, tension: 50, friction: 5, useNativeDriver: true }),
      Animated.timing(trophyOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.sequence([
        Animated.delay(240),
        Animated.parallel([
          Animated.spring(nameSlide, { toValue: 0, tension: 60, friction: 8, useNativeDriver: true }),
          Animated.timing(nameOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        ]),
      ]),
    ]).start();
  }, []);

  const displayChain = activePuzzle?.transfers ? [...activePuzzle.transfers].reverse() : [];

  const puzzleReady = puzzle && puzzle.id !== '__placeholder__' && state.tiebreakerPool.length > 0;
  if (!puzzleReady) {
    return (
      <View style={{ flex: 1, backgroundColor: '#050510', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: '#555', fontSize: 16 }}>جارٍ تحضير الفاصل...</Text>
      </View>
    );
  }

  const handleBuzz = (playerIdx: number) => {
    if (!tiedIndices.includes(playerIdx)) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setSelectedPlayer(playerIdx);
    setPhase('confirming');
  };

  const handleCorrect = () => {
    if (selectedPlayer === null) return;
    playCorrect();
    setTimeout(() => playFanfare(), 200);
    addScore(selectedPlayer, 1);
    setWinner(selectedPlayer);
    setPhase('winner');
    startWinnerAnim();
  };

  const handleWrong = () => {
    playWrong();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    setSelectedPlayer(null);
    setPhase('play');
  };

  const handleSaveToLeaderboard = async () => {
    if (saving || saved || winner === null) return;
    setSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const result = await addLeaderboardEntry(
        state.players[winner].slice(0, 20),
        state.scores[winner],
      );
      if (result) {
        setSaved(true);
        setSavedIsNewRecord(result.isNewRecord);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch (err) {
      console.warn('[mp-tiebreaker] Failed to save leaderboard entry:', err);
    } finally {
      setSaving(false);
    }
  };

  const handlePlayAgain = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    resetGame();
    router.dismissAll();
  };

  // ── Intro ─────────────────────────────────────────────────────────────────
  if (phase === 'intro') {
    return (
      <View style={[S.root, { backgroundColor: colors.background }]}>
        <LinearGradient colors={['#050510', '#1A0F00', '#050510']} style={StyleSheet.absoluteFill} />
        <View style={S.goldGlow} />
        <View style={[S.center, { paddingTop: topPad, paddingBottom: botPad }]}>
          <Text style={S.introEmoji}>⚡</Text>
          <Text style={[S.introSub, { color: colors.mutedForeground }]}>تعادل في المقدمة!</Text>
          <Text style={[S.introTitle, { color: '#FFD700' }]}>الهدف الذهبي</Text>
          <View style={[S.tiedCard, { backgroundColor: colors.card, borderColor: '#FFD700' }]}>
            <Text style={[S.tiedLabel, { color: colors.mutedForeground }]}>المتعادلون في المقدمة</Text>
            {tiedIndices.map(i => (
              <View key={i} style={[S.tiedPlayerRow, { borderColor: PLAYER_COLORS[i] ?? '#FFD700' }]}>
                <Text style={[S.tiedPlayerName, { color: PLAYER_COLORS[i] ?? '#FFD700' }]}>{state.players[i]}</Text>
                <Text style={[S.tiedPlayerScore, { color: PLAYER_COLORS[i] ?? '#FFD700' }]}>{state.scores[i]} نقطة</Text>
              </View>
            ))}
          </View>
          <Text style={[S.tieDesc, { color: colors.mutedForeground }]}>
            {'سؤال واحد فاصل — انتقالات لاعب مجهول\nمن يجيب أولاً يفوز باللعبة كاملة'}
          </Text>
          <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); setPhase('play'); }} activeOpacity={0.85} style={S.fullW}>
            <LinearGradient colors={['#FFD700', '#FFA500']} style={S.startBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Ionicons name="star" size={24} color="#050510" />
              <Text style={S.startBtnTxt}>ابدأ سؤال الفصل</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Winner ────────────────────────────────────────────────────────────────
  if (phase === 'winner' && winner !== null) {
    const winColor = PLAYER_COLORS[winner] ?? '#FFD700';
    return (
      <View style={[S.root, { backgroundColor: colors.background }]}>
        <LinearGradient colors={[`${winColor}18`, '#050510', '#050510']} style={StyleSheet.absoluteFill} />
        <View style={[S.winnerGlow, { backgroundColor: winColor }]} />
        <Confetti />
        <ScrollView contentContainerStyle={[S.center, { paddingTop: topPad, paddingBottom: botPad }]}>
          <Animated.View style={{ transform: [{ scale: trophyScale }], opacity: trophyOpacity }}>
            <View style={[S.trophyCircle, { borderColor: '#FFD700', shadowColor: '#FFD700' }]}>
              <Ionicons name="trophy" size={72} color="#FFD700" />
            </View>
          </Animated.View>
          <Animated.View style={{ alignItems: 'center', gap: 6, transform: [{ translateY: nameSlide }], opacity: nameOpacity }}>
            <Text style={[S.winLabel, { color: colors.mutedForeground }]}>🏆 بطل تحدي الثلاثين</Text>
            <Text style={[S.winName, { color: winColor }]}>{state.players[winner]}</Text>
            <Text style={[S.winScore, { color: '#FFD700' }]}>الهدف الذهبي — الفوز المطلق</Text>
          </Animated.View>
          <Animated.View style={[S.answerReveal, { borderColor: '#FFD700', backgroundColor: 'rgba(255,215,0,0.07)', opacity: nameOpacity }]}>
            <Text style={[S.answerRevealLbl, { color: colors.mutedForeground }]}>اللاعب المقصود</Text>
            <Text style={[S.answerRevealTxt, { color: '#FFD700' }]}>{activePuzzle?.answer}</Text>
          </Animated.View>
          <Animated.View style={[S.leaderboardCard, { opacity: nameOpacity, borderColor: '#FFD700', backgroundColor: 'rgba(255,215,0,0.06)' }]}>
            {saved ? (
              <View style={S.savedRow}>
                <Ionicons name="checkmark-circle" size={22} color="#00C853" />
                <Text style={[S.savedTxt, { color: '#00C853' }]}>
                  {savedIsNewRecord ? '🏆 رقم قياسي جديد على العرش!' : '✅ تم تسجيلك على عرش الأبطال!'}
                </Text>
              </View>
            ) : (
              <>
                <Text style={[S.leaderboardLbl, { color: '#FFD700' }]}>🏆 سجّل الفائز على عرش الأبطال</Text>
                <TouchableOpacity onPress={handleSaveToLeaderboard} activeOpacity={0.85} disabled={saving}>
                  <LinearGradient colors={['#FFD700', '#FFA500']} style={S.saveBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    <Ionicons name="trophy" size={18} color="#050510" />
                    <Text style={S.saveBtnTxt}>{saving ? '...جارٍ الحفظ' : 'أضف إلى لوحة الصدارة'}</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}
          </Animated.View>
          <Animated.View style={[S.fullW, { opacity: nameOpacity }]}>
            <TouchableOpacity onPress={handlePlayAgain} activeOpacity={0.85}>
              <LinearGradient colors={['#FFD700', '#FFA500']} style={S.playAgainBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Ionicons name="refresh" size={22} color="#050510" />
                <Text style={S.playAgainTxt}>العب مجددًا</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        </ScrollView>
      </View>
    );
  }

  // ── Confirming ────────────────────────────────────────────────────────────
  if (phase === 'confirming' && selectedPlayer !== null) {
    const cpColor = PLAYER_COLORS[selectedPlayer] ?? '#FFD700';
    return (
      <View style={[S.root, { backgroundColor: colors.background }]}>
        <LinearGradient colors={['#050510', '#1A1000', '#050510']} style={StyleSheet.absoluteFill} />
        <View style={S.goldGlow} />
        <View style={[S.center, { paddingTop: topPad, paddingBottom: botPad }]}>
          <Ionicons name="star" size={50} color="#FFD700" />
          <Text style={[S.confirmTag, { color: colors.mutedForeground }]}>هل أجاب صح؟</Text>
          <Text style={[S.confirmPlayer, { color: cpColor }]}>{state.players[selectedPlayer]}</Text>
          <View style={[S.answerCard, { backgroundColor: colors.card, borderColor: '#FFD700' }]}>
            <Text style={[S.answerLbl, { color: colors.mutedForeground }]}>اللاعب المقصود</Text>
            <Text style={[S.answerTxt, { color: colors.foreground }]}>{activePuzzle?.answer}</Text>
          </View>
          <View style={S.confirmBtns}>
            <TouchableOpacity onPress={handleWrong} activeOpacity={0.85} style={{ flex: 1 }}>
              <LinearGradient colors={['#FF3B3B', '#CC1010']} style={S.confirmBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Ionicons name="close-circle" size={22} color="#FFF" />
                <Text style={S.confirmBtnTxt}>خطأ</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleCorrect} activeOpacity={0.85} style={{ flex: 1 }}>
              <LinearGradient colors={['#FFD700', '#FFA500']} style={S.confirmBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Ionicons name="trophy" size={22} color="#050510" />
                <Text style={[S.confirmBtnTxt, { color: '#050510' }]}>صحيح — فاز!</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
          {/* Change player bypass */}
          <TouchableOpacity onPress={() => { setSelectedPlayer(null); setPhase('play'); }} activeOpacity={0.7}>
            <View style={[S.changePlayerBtn, { borderColor: colors.border }]}>
              <Ionicons name="shuffle" size={15} color={colors.mutedForeground} />
              <Text style={[S.changePlayerTxt, { color: colors.mutedForeground }]}>تغيير اللاعب</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Play ──────────────────────────────────────────────────────────────────
  return (
    <View style={[S.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={['#050510', '#1A0F00', '#050510']} style={StyleSheet.absoluteFill} />
      <View style={S.goldGlowTop} />
      <ScrollView contentContainerStyle={[S.playContent, { paddingTop: topPad + 8, paddingBottom: botPad + 16 }]}>
        <View style={S.goldHeader}>
          <Ionicons name="star" size={16} color="#FFD700" />
          <Text style={[S.goldHeaderTxt, { color: '#FFD700' }]}>سؤال الفصل الذهبي ⚡</Text>
          <Ionicons name="star" size={16} color="#FFD700" />
        </View>
        <View style={[S.chainCard, { backgroundColor: colors.card, borderColor: '#FFD700' }]}>
          <Text style={[S.chainTitle, { color: colors.mutedForeground }]}>مسار الانتقالات ← الأحدث أولاً</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.chainScroll}>
            {displayChain.map((club, i) => (
              <React.Fragment key={i}>
                {i > 0 && <Ionicons name="arrow-back" size={14} color="#FFD700" style={{ opacity: 0.55 }} />}
                <ClubChip clubRaw={club} isNewest={i === 0} />
              </React.Fragment>
            ))}
          </ScrollView>
        </View>
        <View style={[S.hostAnswer, { backgroundColor: 'rgba(255,215,0,0.06)', borderColor: '#FFD700' }]}>
          <Text style={[S.hostAnswerLbl, { color: colors.mutedForeground }]}>اللاعب — للمضيف فقط 👁</Text>
          <Text style={[S.hostAnswerTxt, { color: '#FFD700' }]}>{activePuzzle?.answer}</Text>
        </View>
        <View style={{ flex: 1, minHeight: 12 }} />
        <View style={[S.questionBanner, { borderColor: '#FFD700', backgroundColor: 'rgba(255,215,0,0.08)' }]}>
          <Ionicons name="help-circle" size={22} color="#FFD700" />
          <Text style={[S.questionBannerTxt, { color: '#FFD700' }]}>من هو هذا اللاعب؟</Text>
        </View>
        <Text style={[S.buzzLabel, { color: colors.mutedForeground }]}>اضغط على اسم أول من صاح (المتعادلون فقط):</Text>
        <View style={S.buzzGrid}>
          {state.players.map((name, i) => {
            const pc = PLAYER_COLORS[i] ?? '#FFD700';
            const isTied = tiedIndices.includes(i);
            return (
              <TouchableOpacity key={i} onPress={() => handleBuzz(i)} activeOpacity={isTied ? 0.85 : 1} disabled={!isTied} style={{ flex: 1, minWidth: '45%' }}>
                <LinearGradient
                  colors={isTied ? [pc, `${pc}BB`] : ['#1A1A1A', '#111']}
                  style={[S.buzzBtn, { opacity: isTied ? 1 : 0.3 }]}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                >
                  <Ionicons name={isTied ? 'star' : 'lock-closed'} size={24} color={isTied ? '#050510' : '#555'} />
                  <Text style={[S.buzzBtnTxt, { color: isTied ? '#050510' : '#555' }]}>{name}</Text>
                </LinearGradient>
              </TouchableOpacity>
            );
          })}
        </View>
        <TouchableOpacity onPress={handleSkip} activeOpacity={0.8}>
          <View style={S.skipBtn}>
            <Ionicons name="shuffle" size={18} color="#FF6B00" />
            <Text style={S.skipBtnTxt}>تخطي اللاعب</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1 },
  goldGlow: { position: 'absolute', top: '8%', alignSelf: 'center', width: 280, height: 280, borderRadius: 140, backgroundColor: '#FFD700', opacity: 0.06 },
  goldGlowTop: { position: 'absolute', top: -60, alignSelf: 'center', width: 340, height: 340, borderRadius: 170, backgroundColor: '#FFD700', opacity: 0.04 },
  winnerGlow: { position: 'absolute', top: '15%', alignSelf: 'center', width: 260, height: 260, borderRadius: 130, opacity: 0.14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 16 },
  fullW: { width: '100%' },
  introEmoji: { fontSize: 56 },
  introSub: { fontSize: 13, fontFamily: 'Inter_500Medium', letterSpacing: 2 },
  introTitle: { fontSize: 44, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  tiedCard: { borderRadius: 18, borderWidth: 1.5, paddingVertical: 14, paddingHorizontal: 18, width: '100%', gap: 10 },
  tiedLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', letterSpacing: 1.5, textAlign: 'center' },
  tiedPlayerRow: { flexDirection: 'row-reverse', alignItems: 'center', justifyContent: 'space-between', borderRadius: 10, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 12 },
  tiedPlayerName: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  tiedPlayerScore: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  tieDesc: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 24 },
  startBtn: { paddingVertical: 18, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, shadowColor: '#FFD700', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.6, shadowRadius: 24, elevation: 16 },
  startBtnTxt: { fontSize: 22, fontFamily: 'Inter_700Bold', color: '#050510' },
  trophyCircle: { width: 140, height: 140, borderRadius: 70, borderWidth: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A10', shadowOpacity: 0.8, shadowRadius: 40, shadowOffset: { width: 0, height: 0 }, elevation: 30 },
  winLabel: { fontSize: 15, fontFamily: 'Inter_600SemiBold', letterSpacing: 1 },
  winName: { fontSize: 46, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  winScore: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  answerReveal: { borderRadius: 14, borderWidth: 1, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', gap: 6, width: '100%' },
  answerRevealLbl: { fontSize: 11, fontFamily: 'Inter_500Medium', letterSpacing: 1.5 },
  answerRevealTxt: { fontSize: 24, fontFamily: 'Inter_700Bold' },
  leaderboardCard: { width: '100%', borderRadius: 18, borderWidth: 1.5, padding: 16, gap: 12 },
  leaderboardLbl: { fontSize: 14, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  savedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 4 },
  savedTxt: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14 },
  saveBtnTxt: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#050510' },
  playAgainBtn: { paddingVertical: 18, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, shadowColor: '#FFD700', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.55, shadowRadius: 24, elevation: 16 },
  playAgainTxt: { fontSize: 22, fontFamily: 'Inter_700Bold', color: '#050510' },
  confirmTag: { fontSize: 14, fontFamily: 'Inter_500Medium', letterSpacing: 1 },
  confirmPlayer: { fontSize: 38, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  answerCard: { borderRadius: 16, borderWidth: 1.5, padding: 20, alignItems: 'center', gap: 6, width: '100%' },
  answerLbl: { fontSize: 12, fontFamily: 'Inter_500Medium', letterSpacing: 1 },
  answerTxt: { fontSize: 26, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  confirmBtns: { flexDirection: 'row', gap: 12, width: '100%' },
  confirmBtn: { paddingVertical: 18, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  confirmBtnTxt: { fontSize: 17, fontFamily: 'Inter_700Bold', color: '#FFF' },
  changePlayerBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 16 },
  changePlayerTxt: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  playContent: { paddingHorizontal: 18, gap: 14 },
  goldHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  goldHeaderTxt: { fontSize: 16, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 },
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
  skipBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderWidth: 1.5, paddingVertical: 10, borderColor: '#FF6B00', backgroundColor: 'rgba(255,107,0,0.07)' },
  skipBtnTxt: { fontSize: 14, fontFamily: 'Inter_700Bold', color: '#FF6B00' },
});
