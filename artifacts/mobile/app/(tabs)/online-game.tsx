/**
 * Online Game Screen — renders the full real-time online game driven by Socket.io.
 * Phase-based rendering: one screen handles all rounds and transitions.
 *
 * Rounds: round1 → round2 → round3 → round5 → (tiebreaker if tied).
 * Round 4 ("30-second challenge") only exists offline; not present here.
 *
 * Phases handled:
 *   round1_turn / round1_waiting
 *   round2_bidding / round2_answer
 *   round3_buzz / round3_answer          (generic buzzer)
 *   round5_buzz / round5_answer          (transfer puzzle, buzz-lock)
 *   tiebreaker_buzz / tiebreaker_answer  (transfer puzzle, buzz-lock + skip)
 *   transitionRound (between rounds)
 *   roundEnd (synced round-summary popup)
 *   game_over
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, TextInput, ScrollView, Platform,
  Animated, Dimensions, KeyboardAvoidingView, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useOnlineGame, type OnlinePlayer } from '@/contexts/OnlineGameContext';
import { addLeaderboardEntry } from '@/lib/leaderboard';
import { useSoundContext } from '@/contexts/SoundContext';

const { width: W } = Dimensions.get('window');
const PLAYER_COLORS = ['#7B2FFF', '#FFD700', '#00E5FF', '#FF6B00', '#00C853'];

// ── Helpers ────────────────────────────────────────────────────────────────────

function useCountdown(deadlineTs: number | null): number {
  const [rem, setRem] = useState(0);
  useEffect(() => {
    if (!deadlineTs) { setRem(0); return; }
    const tick = () => setRem(Math.max(0, Math.ceil((deadlineTs - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [deadlineTs]);
  return rem;
}

function playerColor(room: ReturnType<typeof useOnlineGame>['state']['room'], userId: string): string {
  if (!room) return '#7B2FFF';
  const idx = room.players.findIndex(p => p.userId === userId);
  return PLAYER_COLORS[idx >= 0 ? idx : 0] ?? '#7B2FFF';
}

function playerName(room: ReturnType<typeof useOnlineGame>['state']['room'], userId: string): string {
  return room?.players.find(p => p.userId === userId)?.username ?? '—';
}

// ── Club chip for transfer puzzles ─────────────────────────────────────────────

const LETTER_COLORS: Record<string, string> = {
  'ر': '#7B2FFF', 'ب': '#FF3B3B', 'م': '#00E5FF', 'ل': '#FF6B00',
  'أ': '#FFD700', 'ي': '#00C853', 'ت': '#FF69B4', 'ن': '#7B2FFF',
  'ف': '#00E5FF', 'إ': '#FFD700', 'س': '#FF6B00', 'ج': '#00C853',
  'ه': '#FF3B3B', 'ع': '#7B2FFF', 'خ': '#00E5FF', 'ك': '#FFD700',
  'د': '#FF3B3B', 'ز': '#00C853', 'ق': '#FF6B00', 'ش': '#FF69B4',
  'A': '#00E5FF', 'P': '#7B2FFF', 'F': '#FF3B3B', 'L': '#FF6B00', 'U': '#FFD700',
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
    <View style={[ch.wrap, { borderColor: isNewest ? color : `${color}55`, backgroundColor: isNewest ? `${color}14` : `${color}06` }]}>
      <Text style={[ch.name, { color: isNewest ? color : `${color}BB` }]}>{rawName}</Text>
      {country ? <Text style={ch.country}>({country})</Text> : null}
    </View>
  );
}
const ch = StyleSheet.create({
  wrap: { borderRadius: 12, borderWidth: 1.5, paddingVertical: 8, paddingHorizontal: 11, alignItems: 'center', gap: 2, minWidth: 72 },
  name: { fontSize: 12, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  country: { fontSize: 9, fontFamily: 'Inter_400Regular', color: '#666', textAlign: 'center' },
});

// ── Score header ───────────────────────────────────────────────────────────────

function ScoreHeader({ round }: { round: string | null }) {
  const { state, myUserId } = useOnlineGame();
  const colors = useColors();
  const room = state.room;
  if (!room) return null;

  const ROUND_LABELS: Record<string, { label: string; color: string }> = {
    round1: { label: 'ماذا تعرف', color: '#7B2FFF' },
    round2: { label: 'المزاد',    color: '#FFD700' },
    round3: { label: 'الجرس',     color: '#FF6B00' },
    round5: { label: 'خمّن اللاعب', color: '#00E5FF' },
    tiebreaker: { label: 'الهدف الذهبي', color: '#FFD700' },
  };
  const ri = round ? ROUND_LABELS[round] : null;

  return (
    <View style={[SH.wrap, { backgroundColor: colors.card, borderBottomColor: `${ri?.color ?? '#7B2FFF'}44` }]}>
      {ri && (
        <View style={[SH.roundPill, { borderColor: ri.color, backgroundColor: `${ri.color}18` }]}>
          <Text style={[SH.roundTxt, { color: ri.color }]}>{ri.label}</Text>
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={SH.scores}>
        {room.players.map((p, i) => {
          const pc    = PLAYER_COLORS[i % PLAYER_COLORS.length] ?? '#7B2FFF';
          const score = state.scores[p.userId] ?? 0;
          const isMe  = p.userId === myUserId;
          return (
            <View key={p.userId} style={[SH.scoreChip, { borderColor: `${pc}${isMe ? 'FF' : '66'}`, backgroundColor: `${pc}${isMe ? '22' : '0A'}` }]}>
              <Text style={[SH.scoreAvatar]}>{p.avatar || '🎮'}</Text>
              <Text style={[SH.scorePts, { color: pc }]}>{score}</Text>
              {!p.connected && <View style={SH.disconnDot} />}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
const SH = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, gap: 10, borderBottomWidth: 1 },
  roundPill: { borderRadius: 10, borderWidth: 1, paddingVertical: 4, paddingHorizontal: 10 },
  roundTxt: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  scores: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  scoreChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, borderWidth: 1, paddingVertical: 5, paddingHorizontal: 8 },
  scoreAvatar: { fontSize: 16 },
  scorePts: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  disconnDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#FF3B3B' },
});

// ── Countdown ring ─────────────────────────────────────────────────────────────

function CountdownRing({ secs, maxSecs, color = '#7B2FFF' }: { secs: number; maxSecs: number; color?: string }) {
  const fraction = maxSecs > 0 ? secs / maxSecs : 0;
  const danger   = secs <= 2;
  return (
    <View style={[CR.wrap, { borderColor: danger ? '#FF3B3B' : color, backgroundColor: danger ? 'rgba(255,59,59,0.1)' : `${color}14` }]}>
      <Text style={[CR.num, { color: danger ? '#FF3B3B' : color }]}>{secs}</Text>
      <Text style={[CR.sub, { color: danger ? '#FF3B3B' : `${color}99` }]}>ث</Text>
    </View>
  );
}
const CR = StyleSheet.create({
  wrap: { width: 68, height: 68, borderRadius: 34, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  num: { fontSize: 28, fontFamily: 'Inter_700Bold', lineHeight: 32 },
  sub: { fontSize: 11, fontFamily: 'Inter_500Medium', marginTop: -4 },
});

// ── Answer result overlay ──────────────────────────────────────────────────────

function ResultOverlay() {
  const { state, myUserId } = useOnlineGame();
  const colors = useColors();
  const r = state.lastResult;
  if (!r) return null;

  const isMe  = r.userId === myUserId;
  const who   = r.userId ? playerName(state.room, r.userId) : null;
  const color = r.skipped ? '#FF6B00' : r.correct ? '#00C853' : '#FF3B3B';
  const icon  = r.skipped ? 'play-skip-forward' : r.correct ? 'checkmark-circle' : 'close-circle';

  return (
    <View style={[RO.wrap, { backgroundColor: colors.card, borderColor: color }]} pointerEvents="none">
      <Ionicons name={icon} size={32} color={color} />
      <View style={{ flex: 1 }}>
        <Text style={[RO.who, { color }]}>
          {r.skipped ? `${isMe ? 'تخطيت' : `${who} تخطّى`}` :
           r.userId === null ? '⏰ انتهى الوقت' :
           r.correct ? `✅ ${isMe ? 'أجبت صح! +1' : `${who} أجاب صح!`}` :
           `❌ ${isMe ? 'إجابة خاطئة' : `${who} أخطأ`}`}
        </Text>
        {r.correctAnswer && !r.correct && !r.skipped && (
          <Text style={[RO.answer, { color: colors.mutedForeground }]}>الإجابة: {r.correctAnswer}</Text>
        )}
      </View>
    </View>
  );
}
const RO = StyleSheet.create({
  wrap: { position: 'absolute', bottom: 100, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 2, padding: 16, zIndex: 99 },
  who: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  answer: { fontSize: 13, fontFamily: 'Inter_500Medium', marginTop: 2 },
});

// ── Round transition ───────────────────────────────────────────────────────────

const ROUND_META: Record<string, { title: string; sub: string; color: string; icon: keyof typeof Ionicons.glyphMap }> = {
  round1: { title: 'ماذا تعرف؟',   sub: 'بالتناوب — 3 أسئلة، 3 ضربات لكل سؤال', color: '#7B2FFF', icon: 'help-circle'   },
  round2: { title: 'المزاد',        sub: 'زايد واربح الموضوع!',            color: '#FFD700', icon: 'cash'          },
  round3: { title: 'الجرس',         sub: 'اضغط أول وأجب!',                 color: '#FF6B00', icon: 'radio-button-on' },
  round5: { title: 'خمّن اللاعب',   sub: 'اضغط الجرس أول ثم اكشف اللاعب!', color: '#00E5FF', icon: 'people'        },
  tiebreaker: { title: 'الهدف الذهبي', sub: 'اضغط الجرس أول ثم احسم الفوز!', color: '#FFD700', icon: 'star'          },
};

function RoundTransition({ round }: { round: string }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const meta   = ROUND_META[round] ?? { title: round, sub: '', color: '#7B2FFF', icon: 'play' as const };
  const anim   = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(anim, { toValue: 1, tension: 60, friction: 7, useNativeDriver: true }).start();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
  }, []);
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28, paddingTop: topPad }}>
      <LinearGradient colors={[`${meta.color}22`, '#050510', `${meta.color}10`]} style={StyleSheet.absoluteFill} />
      <Animated.View style={{ alignItems: 'center', gap: 16, opacity: anim, transform: [{ scale: anim }] }}>
        <View style={[T.iconWrap, { borderColor: meta.color, backgroundColor: `${meta.color}18` }]}>
          <Ionicons name={meta.icon} size={56} color={meta.color} />
        </View>
        <Text style={[T.title, { color: meta.color }]}>{meta.title}</Text>
        <Text style={[T.sub, { color: colors.mutedForeground }]}>{meta.sub}</Text>
        <ActivityIndicator color={meta.color} style={{ marginTop: 8 }} />
      </Animated.View>
    </View>
  );
}
const T = StyleSheet.create({
  iconWrap: { width: 120, height: 120, borderRadius: 60, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 42, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  sub: { fontSize: 15, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 24 },
});

// ── Round 1: Turn-based — 3 Qs, 3 strikes per question ────────────────────────
//
// Per spec (Task 4):
// • Players take turns on the SAME question.
// • ALL typed answers are broadcast to BOTH players via game:round1Answer.
// • Each player has 3 strikes PER QUESTION (tracked in question.questionStrikes).
// • Correct answer → winner gets point, next question.
// • 3 strikes for one player → other player wins point.

function Round1AnswerFeed() {
  const { state } = useOnlineGame();
  const answers = state.round1Answers;
  if (!answers || answers.length === 0) return null;
  // Show last 5 answers (most recent at top)
  const recent = [...answers].slice(-5).reverse();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: '#FFFFFF55', fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.2, textAlign: 'right' }}>
        سجل الإجابات
      </Text>
      {recent.map((a, i) => {
        const pColor = PLAYER_COLORS[
          (state.room?.players.findIndex(p => p.userId === a.userId) ?? 0) % PLAYER_COLORS.length
        ] ?? '#7B2FFF';
        const pName = playerName(state.room, a.userId);
        const icon  = a.skipped ? '⏭' : a.correct ? '✅' : '❌';
        const color = a.skipped ? '#FF6B00' : a.correct ? '#00C853' : '#FF3B3B';
        return (
          <View key={i} style={[R1.feedRow, { borderColor: `${color}33`, backgroundColor: `${color}09`, opacity: i === 0 ? 1 : 0.55 + 0.1 * (5 - i) }]}>
            <Text style={{ fontSize: 14 }}>{icon}</Text>
            <Text style={[R1.feedName, { color: pColor }]}>{pName}</Text>
            <Text style={[R1.feedText, { color: a.correct ? '#00C853' : '#FFFFFF99' }]} numberOfLines={1}>{a.text}</Text>
          </View>
        );
      })}
    </View>
  );
}

function PerQuestionStrikes() {
  const { state } = useOnlineGame();
  const questionStrikes = state.question?.questionStrikes ?? {};
  if (!state.room) return null;
  return (
    <View style={R1.strikesRow}>
      {state.room.players.map((p, i) => {
        const pc = PLAYER_COLORS[i % PLAYER_COLORS.length] ?? '#7B2FFF';
        const strikes = questionStrikes[p.userId] ?? 0;
        return (
          <View key={p.userId} style={[R1.strikeChip, { borderColor: `${pc}55` }]}>
            <Text style={R1.strikeAvatar}>{p.avatar || '🎮'}</Text>
            <View style={{ flexDirection: 'row', gap: 3 }}>
              {[0, 1, 2].map(j => (
                <Ionicons
                  key={j}
                  name={j < strikes ? 'close-circle' : 'ellipse-outline'}
                  size={14}
                  color={j < strikes ? '#FF3B3B' : `${pc}66`}
                />
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function Round1UI() {
  const { state, myUserId, submitAnswer, skip } = useOnlineGame();
  const colors = useColors();
  const [text, setText]           = useState('');
  const [submitted, setSubmitted] = useState(false);
  const secs = useCountdown(state.deadlineTs);

  const isMyTurn  = state.turnUserId === myUserId;
  const turnColor = playerColor(state.room, state.turnUserId ?? '');
  const turnName  = playerName(state.room, state.turnUserId ?? '');
  const myPlayer  = state.room?.players.find(p => p.userId === myUserId);
  const canSkip   = isMyTurn && !submitted && !myPlayer?.skipUsed;
  const qIndex    = (state.question?.questionIndex ?? 0) + 1;
  const qTotal    = 3;

  // Reset input on new TURN (turnUserId changes) or new question ID
  useEffect(() => {
    setText('');
    setSubmitted(false);
  }, [state.question?.id, state.turnUserId]);

  const handleSubmit = () => {
    if (!text.trim() || !isMyTurn || submitted) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    submitAnswer(text.trim());
    setSubmitted(true);
  };

  const handleSkip = () => {
    if (!canSkip) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    skip();
    setSubmitted(true);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={[R1.content]} keyboardShouldPersistTaps="handled">

        {/* Question progress */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          {Array.from({ length: qTotal }).map((_, i) => (
            <View key={i} style={{ width: 24, height: 5, borderRadius: 3, backgroundColor: i < (qIndex - 1) ? '#7B2FFF' : i === qIndex - 1 ? '#A569FF' : '#FFFFFF18' }} />
          ))}
        </View>

        {/* Turn indicator */}
        <View style={[R1.turnBanner, { borderColor: turnColor, backgroundColor: `${turnColor}14` }]}>
          <Ionicons name="person" size={16} color={turnColor} />
          <Text style={[R1.turnTxt, { color: turnColor }]}>
            {isMyTurn ? '⚡ دورك! أجب بسرعة' : `⏳ دور ${turnName}`}
          </Text>
          <CountdownRing secs={secs} maxSecs={20} color={turnColor} />
        </View>

        {/* Question */}
        <View style={[R1.qCard, { backgroundColor: colors.card, borderColor: '#7B2FFF' }]}>
          <Text style={[R1.qLabel, { color: '#7B2FFF' }]}>السؤال {qIndex} من {qTotal}</Text>
          <Text style={[R1.qTxt, { color: colors.foreground }]}>{state.question?.question ?? '...'}</Text>
        </View>

        {/* Per-question strikes */}
        <PerQuestionStrikes />

        {/* Live answer feed (all answers broadcast to both players) */}
        <Round1AnswerFeed />

        {/* My turn: input */}
        {isMyTurn && !submitted && (
          <View style={{ gap: 10 }}>
            <TextInput
              style={[R1.input, { color: colors.foreground, borderColor: '#7B2FFF', backgroundColor: 'rgba(123,47,255,0.06)' }]}
              placeholder="اكتب إجابتك..."
              placeholderTextColor="rgba(123,47,255,0.4)"
              value={text}
              onChangeText={setText}
              onSubmitEditing={handleSubmit}
              returnKeyType="send"
              autoFocus
              textAlign="right"
            />
            <TouchableOpacity onPress={handleSubmit} activeOpacity={0.85} disabled={!text.trim()}>
              <LinearGradient
                colors={text.trim() ? ['#7B2FFF', '#5A1FCC'] : ['#2A2A2A', '#1A1A1A']}
                style={R1.submitBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Ionicons name="send" size={18} color="#FFF" />
                <Text style={R1.submitBtnTxt}>إرسال</Text>
              </LinearGradient>
            </TouchableOpacity>
            {canSkip && (
              <TouchableOpacity onPress={handleSkip} activeOpacity={0.8}>
                <View style={[R1.skipBtn, { borderColor: '#FF6B0066' }]}>
                  <Ionicons name="play-skip-forward" size={16} color="#FF6B00" />
                  <Text style={R1.skipBtnTxt}>تخطي (مرة واحدة)</Text>
                </View>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* My turn: submitted */}
        {isMyTurn && submitted && (
          <View style={[R1.waitBanner, { borderColor: '#7B2FFF44' }]}>
            <ActivityIndicator color="#7B2FFF" size="small" />
            <Text style={[R1.waitTxt, { color: '#7B2FFF' }]}>جارٍ التصحيح...</Text>
          </View>
        )}

        {/* Not my turn: watch */}
        {!isMyTurn && (
          <View style={[R1.watchBanner, { borderColor: `${turnColor}44`, backgroundColor: `${turnColor}08` }]}>
            <Ionicons name="eye" size={18} color={turnColor} />
            <Text style={[R1.watchTxt, { color: turnColor }]}>{turnName} يفكر...</Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// Legacy StrikesRow kept but not used in Round1 anymore (used outside if needed)
function StrikesRow() {
  const { state } = useOnlineGame();
  if (!state.room) return null;
  return (
    <View style={R1.strikesRow}>
      {state.room.players.map((p, i) => {
        const pc = PLAYER_COLORS[i % PLAYER_COLORS.length] ?? '#7B2FFF';
        const strikes = p.strikes ?? 0;
        return (
          <View key={p.userId} style={[R1.strikeChip, { borderColor: `${pc}55` }]}>
            <Text style={R1.strikeAvatar}>{p.avatar || '🎮'}</Text>
            <View style={{ flexDirection: 'row', gap: 2 }}>
              {[0, 1, 2].map(j => (
                <Ionicons key={j} name={j < strikes ? 'close-circle' : 'ellipse-outline'} size={12} color={j < strikes ? '#FF3B3B' : `${pc}88`} />
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

const R1 = StyleSheet.create({
  content:    { padding: 16, gap: 14 },
  turnBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 16, borderWidth: 1.5, paddingVertical: 12, paddingHorizontal: 16 },
  turnTxt:    { fontSize: 15, fontFamily: 'Inter_700Bold', flex: 1, marginHorizontal: 8 },
  qCard:      { borderRadius: 20, borderWidth: 1.5, padding: 20, gap: 8, alignItems: 'flex-end' },
  qLabel:     { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5 },
  qTxt:       { fontSize: 22, fontFamily: 'Inter_600SemiBold', textAlign: 'right', lineHeight: 34 },
  strikesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  strikeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, borderWidth: 1, paddingVertical: 6, paddingHorizontal: 10 },
  strikeAvatar: { fontSize: 18 },
  // Answer feed
  feedRow:    { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, paddingVertical: 7, paddingHorizontal: 10 },
  feedName:   { fontSize: 12, fontFamily: 'Inter_700Bold', minWidth: 60 },
  feedText:   { fontSize: 12, fontFamily: 'Inter_500Medium', flex: 1, textAlign: 'right' },
  // Input
  input:      { borderWidth: 1.5, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 18, fontSize: 18, fontFamily: 'Inter_600SemiBold', textAlign: 'right' },
  submitBtn:  { paddingVertical: 16, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  submitBtnTxt: { fontSize: 18, fontFamily: 'Inter_700Bold', color: '#FFF' },
  skipBtn:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderWidth: 1, paddingVertical: 10 },
  skipBtnTxt: { fontSize: 14, fontFamily: 'Inter_600SemiBold', color: '#FF6B00' },
  waitBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 14, borderWidth: 1, paddingVertical: 16 },
  waitTxt:    { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  watchBanner:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 14, borderWidth: 1.5, paddingVertical: 16 },
  watchTxt:   { fontSize: 15, fontFamily: 'Inter_700Bold' },
});

// ── Round 2: Auction ───────────────────────────────────────────────────────────

function Round2UI() {
  const { state, myUserId, placeBid, submitAnswer, withdraw } = useOnlineGame();
  const colors = useColors();
  const [bidAmount, setBidAmount] = useState(1);
  const [text, setText]           = useState('');
  const secs     = useCountdown(
    state.phase === 'round2_bidding' ? state.biddingDeadline
      : state.phase === 'round2_countdown' ? state.deadlineTs
      : state.phase === 'round2_answer' ? state.deadlineTs
      : null
  );

  const myScore  = (state.scores[myUserId ?? ''] ?? 0);
  const maxBid   = Math.max(myScore, 10);
  const minBid   = (state.currentBid?.amount ?? 0) + 1;
  const isBidding   = state.phase === 'round2_bidding';
  const isCountdown = state.phase === 'round2_countdown';
  const isAnswer    = state.phase === 'round2_answer';
  const isRoundEnd  = state.phase === 'round_end' && !!state.round2Result;
  const amWinner    = state.auctionWonBy?.winnerUserId === myUserId;
  const opponent    = state.room?.players.find(p => p.userId !== myUserId);
  const amOnlyBidder = isBidding && !!state.currentBid && state.currentBid.userId === myUserId;

  useEffect(() => {
    if (isBidding) { setBidAmount(Math.min(Math.max(minBid, bidAmount), maxBid)); }
  }, [state.currentBid?.amount]);

  useEffect(() => { setText(''); }, [state.question?.id, state.round2Answers.length]);

  const handleBid = () => {
    if (bidAmount < minBid || bidAmount > maxBid) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    placeBid(bidAmount);
  };

  const handleWithdraw = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    withdraw();
  };

  const handleSubmit = () => {
    if (!text.trim() || !amWinner) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    submitAnswer(text.trim());
    setText('');
  };

  const winnerColor = state.auctionWonBy ? playerColor(state.room, state.auctionWonBy.winnerUserId) : '#FFD700';
  const winnerName  = state.auctionWonBy ? playerName(state.room, state.auctionWonBy.winnerUserId) : '';
  const bidderName  = state.currentBid ? playerName(state.room, state.currentBid.userId) : null;
  const needed      = state.auctionWonBy?.amount ?? 0;
  const correctCount = state.round2Answers.length > 0 ? state.round2Answers[state.round2Answers.length - 1]!.correctCount : 0;
  const wrongCount   = state.round2Answers.length > 0 ? state.round2Answers[state.round2Answers.length - 1]!.wrongCount : 0;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={A.content} keyboardShouldPersistTaps="handled">
        {/* Topic card */}
        <View style={[A.topicCard, { backgroundColor: colors.card, borderColor: '#FFD700' }]}>
          <Text style={A.topicCategory}>{state.question?.category ?? '📂'}</Text>
          <Text style={[A.topicDesc, { color: colors.foreground }]}>{state.question?.description ?? '...'}</Text>
        </View>

        {/* Withdraw notice */}
        {state.withdrawInfo && (
          <View style={[A.winnerBanner, { borderColor: '#FF6B00', backgroundColor: '#FF6B0018' }]}>
            <Ionicons name="flag" size={18} color="#FF6B00" />
            <Text style={[A.winnerTxt, { color: '#FF6B00' }]}>
              {state.withdrawInfo.withdrawnBy === myUserId
                ? 'انسحبت من المزايدة'
                : `${playerName(state.room, state.withdrawInfo.withdrawnBy)} انسحب من المزايدة`}
            </Text>
          </View>
        )}

        {/* Bidding phase */}
        {isBidding && (
          <>
            <View style={[A.bidHeader, { justifyContent: 'space-between' }]}>
              <Text style={[A.bidLabel, { color: colors.mutedForeground }]}>
                {bidderName ? `${bidderName} زايد ${state.currentBid!.amount}` : 'لم يُزايَد بعد'}
              </Text>
              <CountdownRing secs={secs} maxSecs={6} color="#FFD700" />
            </View>

            {/* Bid stepper */}
            <View style={[A.stepperWrap, { backgroundColor: colors.card, borderColor: '#FFD700' }]}>
              <Text style={[A.stepperLabel, { color: colors.mutedForeground }]}>مزايدتي</Text>
              <View style={A.stepper}>
                <TouchableOpacity
                  onPress={() => setBidAmount(b => Math.max(minBid, b - 1))}
                  activeOpacity={0.8}
                  style={[A.stepBtn, { borderColor: '#FFD70066' }]}
                >
                  <Ionicons name="remove" size={22} color="#FFD700" />
                </TouchableOpacity>
                <Text style={A.stepVal}>{bidAmount}</Text>
                <TouchableOpacity
                  onPress={() => setBidAmount(b => Math.min(maxBid, b + 1))}
                  activeOpacity={0.8}
                  style={[A.stepBtn, { borderColor: '#FFD70066' }]}
                >
                  <Ionicons name="add" size={22} color="#FFD700" />
                </TouchableOpacity>
              </View>
              <Text style={[A.stepMax, { color: colors.mutedForeground }]}>الحد الأقصى: {maxBid}</Text>
              <TouchableOpacity onPress={handleBid} activeOpacity={0.85} disabled={bidAmount < minBid || bidAmount > maxBid}>
                <LinearGradient
                  colors={bidAmount >= minBid ? ['#FFD700', '#FFA500'] : ['#333', '#222']}
                  style={A.bidBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  <Ionicons name="cash" size={18} color="#050510" />
                  <Text style={A.bidBtnTxt}>زايد {bidAmount}</Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* Withdraw — only meaningful once someone else has the current bid */}
              {state.currentBid && !amOnlyBidder && (
                <TouchableOpacity onPress={handleWithdraw} activeOpacity={0.8} style={{ marginTop: 4 }}>
                  <View style={[A.withdrawBtn, { borderColor: '#FF3B3B66' }]}>
                    <Ionicons name="flag-outline" size={16} color="#FF3B3B" />
                    <Text style={A.withdrawBtnTxt}>
                      انسحب — {playerName(state.room, state.currentBid.userId)} يفوز بـ{state.currentBid.amount}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
            </View>
          </>
        )}

        {/* 3s "المزاد سيبدأ..." countdown */}
        {isCountdown && state.auctionWonBy && (
          <View style={[A.countdownWrap, { borderColor: winnerColor, backgroundColor: `${winnerColor}14` }]}>
            <Ionicons name="trophy" size={22} color={winnerColor} />
            <Text style={[A.winnerTxt, { color: winnerColor, textAlign: 'center' }]}>
              {amWinner ? `فزت بالمزاد بـ${state.auctionWonBy.amount}!` : `${winnerName} فاز بالمزاد بـ${state.auctionWonBy.amount}`}
            </Text>
            <Text style={[A.countdownLabel, { color: colors.mutedForeground }]}>المزاد سيبدأ...</Text>
            <CountdownRing secs={secs} maxSecs={3} color={winnerColor} />
          </View>
        )}

        {/* Answer phase — multi-guess quota */}
        {isAnswer && state.auctionWonBy && (
          <>
            <View style={[A.winnerBanner, { borderColor: winnerColor, backgroundColor: `${winnerColor}18` }]}>
              <Ionicons name="trophy" size={18} color={winnerColor} />
              <Text style={[A.winnerTxt, { color: winnerColor }]}>
                {amWinner ? `أجب بـ${needed} إجابة صحيحة` : `${winnerName} يجيب... (${needed} مطلوبة)`}
              </Text>
              <CountdownRing secs={secs} maxSecs={30} color={winnerColor} />
            </View>

            {/* Quota progress */}
            <View style={A.quotaRow}>
              <Text style={[A.quotaTxt, { color: '#00C853' }]}>✅ {correctCount}/{needed}</Text>
              {wrongCount > 0 && <Text style={[A.quotaTxt, { color: '#FF3B3B' }]}>❌ {wrongCount}</Text>}
            </View>

            {/* Live guess feed */}
            {state.round2Answers.length > 0 && (
              <View style={{ gap: 6 }}>
                {[...state.round2Answers].slice(-5).reverse().map((a, i) => (
                  <View key={i} style={[A.feedRow, { borderColor: a.correct ? '#00C85333' : '#FF3B3B33', backgroundColor: a.correct ? '#00C85309' : '#FF3B3B09' }]}>
                    <Text style={{ fontSize: 14 }}>{a.correct ? '✅' : '❌'}</Text>
                    <Text style={[A.feedTxt, { color: a.correct ? '#00C853' : '#FFFFFF99' }]} numberOfLines={1}>{a.text}</Text>
                  </View>
                ))}
              </View>
            )}

            {amWinner && (
              <View style={{ gap: 10 }}>
                <TextInput
                  style={[A.input, { color: colors.foreground, borderColor: winnerColor, backgroundColor: `${winnerColor}08` }]}
                  placeholder="اكتب إجابتك..."
                  placeholderTextColor={`${winnerColor}55`}
                  value={text}
                  onChangeText={setText}
                  onSubmitEditing={handleSubmit}
                  returnKeyType="send"
                  autoFocus
                  textAlign="right"
                />
                <TouchableOpacity onPress={handleSubmit} activeOpacity={0.85} disabled={!text.trim()}>
                  <LinearGradient
                    colors={text.trim() ? ['#FFD700', '#FFA500'] : ['#333', '#222']}
                    style={A.bidBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    <Ionicons name="send" size={18} color="#050510" />
                    <Text style={[A.bidBtnTxt, { color: '#050510' }]}>إرسال</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}
            {!amWinner && (
              <View style={[A.watchBanner, { borderColor: `${winnerColor}44`, backgroundColor: `${winnerColor}08` }]}>
                <Ionicons name="eye" size={18} color={winnerColor} />
                <Text style={[A.watchTxt, { color: winnerColor }]}>{winnerName} يكتب...</Text>
              </View>
            )}
          </>
        )}

        {/* Final result banner */}
        {isRoundEnd && state.round2Result && (
          <View style={[A.winnerBanner, { borderColor: state.round2Result.outcome === 'won' ? '#00C853' : '#FF3B3B', backgroundColor: state.round2Result.outcome === 'won' ? '#00C85318' : '#FF3B3B18' }]}>
            <Ionicons name={state.round2Result.outcome === 'won' ? 'trophy' : 'time'} size={18} color={state.round2Result.outcome === 'won' ? '#00C853' : '#FF3B3B'} />
            <Text style={[A.winnerTxt, { color: state.round2Result.outcome === 'won' ? '#00C853' : '#FF3B3B' }]}>
              {state.round2Result.outcome === 'won'
                ? `${playerName(state.room, state.round2Result.winnerUserId ?? '')} أكمل الحصة! +${state.round2Result.pointsAwarded}`
                : `انتهى الوقت — لم تكتمل الحصة`}
            </Text>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const A = StyleSheet.create({
  content: { padding: 16, gap: 14 },
  topicCard: { borderRadius: 20, borderWidth: 1.5, padding: 20, gap: 8, alignItems: 'center' },
  topicCategory: { fontSize: 28 },
  topicDesc: { fontSize: 18, fontFamily: 'Inter_600SemiBold', textAlign: 'center', lineHeight: 28 },
  bidHeader: { flexDirection: 'row', alignItems: 'center' },
  bidLabel: { fontSize: 14, fontFamily: 'Inter_600SemiBold', flex: 1 },
  stepperWrap: { borderRadius: 20, borderWidth: 1.5, padding: 20, gap: 12, alignItems: 'center' },
  stepperLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', letterSpacing: 1.5 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  stepBtn: { width: 48, height: 48, borderRadius: 12, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  stepVal: { fontSize: 42, fontFamily: 'Inter_700Bold', color: '#FFD700', minWidth: 70, textAlign: 'center' },
  stepMax: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  bidBtn: { paddingVertical: 16, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%' },
  bidBtnTxt: { fontSize: 18, fontFamily: 'Inter_700Bold', color: '#050510' },
  withdrawBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, borderWidth: 1, paddingVertical: 10, width: '100%' },
  withdrawBtnTxt: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#FF3B3B' },
  countdownWrap: { borderRadius: 20, borderWidth: 1.5, padding: 20, gap: 10, alignItems: 'center' },
  countdownLabel: { fontSize: 13, fontFamily: 'Inter_500Medium' },
  winnerBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, borderWidth: 1.5, paddingVertical: 12, paddingHorizontal: 16 },
  winnerTxt: { fontSize: 14, fontFamily: 'Inter_700Bold', flex: 1 },
  quotaRow: { flexDirection: 'row', gap: 14, justifyContent: 'center' },
  quotaTxt: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  feedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 10, borderWidth: 1, paddingVertical: 7, paddingHorizontal: 10 },
  feedTxt: { fontSize: 12, fontFamily: 'Inter_500Medium', flex: 1, textAlign: 'right' },
  input: { borderWidth: 1.5, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 18, fontSize: 18, fontFamily: 'Inter_600SemiBold', textAlign: 'right' },
  waitBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 14, borderWidth: 1, paddingVertical: 16 },
  waitTxt: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  watchBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 14, borderWidth: 1.5, paddingVertical: 16 },
  watchTxt: { fontSize: 15, fontFamily: 'Inter_700Bold' },
});

// ── Buzzer round (Round 3 only) ───────────────────────────────────────────────

function BuzzerUI({ accentColor }: { accentColor: string }) {
  const { state, myUserId, buzz: doBuzz, submitAnswer } = useOnlineGame();
  const colors = useColors();
  const [text, setText]           = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [hasBuzzed, setHasBuzzed] = useState(false);

  const isBuzzPhase   = state.phase === 'round3_buzz';
  const isAnswerPhase = state.phase === 'round3_answer';
  const amWinner      = state.buzzWinner?.userId === myUserId;
  const secs          = useCountdown(isBuzzPhase ? state.deadlineTs : (state.buzzWinner?.deadlineTs ?? null));
  const maxSecs       = isBuzzPhase ? 20 : 10;

  const winnerColor = state.buzzWinner ? playerColor(state.room, state.buzzWinner.userId) : accentColor;
  const winnerName  = state.buzzWinner ? playerName(state.room, state.buzzWinner.userId) : '';

  useEffect(() => { setText(''); setSubmitted(false); setHasBuzzed(false); }, [state.question?.id]);

  const handleBuzz = () => {
    if (hasBuzzed) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    doBuzz();
    setHasBuzzed(true);
  };

  const handleSubmit = () => {
    if (!text.trim() || !amWinner || submitted) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    submitAnswer(text.trim());
    setSubmitted(true);
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={BZ.content} keyboardShouldPersistTaps="handled">
        <View style={[BZ.qCard, { backgroundColor: colors.card, borderColor: accentColor }]}>
          <Text style={[BZ.qLabel, { color: accentColor }]}>السؤال</Text>
          <Text style={[BZ.qTxt, { color: colors.foreground }]}>{state.question?.question ?? '...'}</Text>
        </View>

        {/* Buzz phase */}
        {isBuzzPhase && (
          <>
            <View style={BZ.timerRow}>
              <Text style={[BZ.timerLabel, { color: colors.mutedForeground }]}>وقت الجرس</Text>
              <CountdownRing secs={secs} maxSecs={maxSecs} color={accentColor} />
            </View>
            <TouchableOpacity onPress={handleBuzz} activeOpacity={0.7} disabled={hasBuzzed}>
              <LinearGradient
                colors={hasBuzzed ? ['#333', '#222'] : [accentColor, `${accentColor}BB`]}
                style={[BZ.buzzBtn, { opacity: hasBuzzed ? 0.5 : 1 }]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                <Ionicons name="radio-button-on" size={52} color={hasBuzzed ? '#555' : '#FFF'} />
                <Text style={[BZ.buzzBtnTxt, { color: hasBuzzed ? '#555' : '#FFF' }]}>
                  {hasBuzzed ? 'جارٍ الانتظار...' : 'اضغط!'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </>
        )}

        {/* Answer phase */}
        {isAnswerPhase && (
          <>
            <View style={[BZ.winnerBanner, { borderColor: winnerColor, backgroundColor: `${winnerColor}14` }]}>
              <Ionicons name="mic" size={18} color={winnerColor} />
              <Text style={[BZ.winnerTxt, { color: winnerColor }]}>
                {amWinner ? '⚡ أنت ضغطت أول — اكتب إجابتك!' : `${winnerName} ضغط أول...`}
              </Text>
              <CountdownRing secs={secs} maxSecs={10} color={winnerColor} />
            </View>

            {amWinner && !submitted && (
              <View style={{ gap: 10 }}>
                <TextInput
                  style={[BZ.input, { color: colors.foreground, borderColor: winnerColor, backgroundColor: `${winnerColor}08` }]}
                  placeholder="اكتب إجابتك..."
                  placeholderTextColor={`${winnerColor}55`}
                  value={text}
                  onChangeText={setText}
                  onSubmitEditing={handleSubmit}
                  returnKeyType="send"
                  autoFocus
                  textAlign="right"
                />
                <TouchableOpacity onPress={handleSubmit} activeOpacity={0.85} disabled={!text.trim()}>
                  <LinearGradient
                    colors={text.trim() ? [accentColor, `${accentColor}BB`] : ['#333', '#222']}
                    style={BZ.sendBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    <Ionicons name="send" size={18} color="#FFF" />
                    <Text style={BZ.sendBtnTxt}>إرسال</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}
            {amWinner && submitted && (
              <View style={[BZ.waitBanner, { borderColor: `${winnerColor}44` }]}>
                <ActivityIndicator color={winnerColor} size="small" />
                <Text style={[BZ.waitTxt, { color: winnerColor }]}>جارٍ التصحيح...</Text>
              </View>
            )}
            {!amWinner && (
              <View style={[BZ.watchBanner, { borderColor: `${winnerColor}44`, backgroundColor: `${winnerColor}08` }]}>
                <Ionicons name="eye" size={18} color={winnerColor} />
                <Text style={[BZ.watchTxt, { color: winnerColor }]}>{winnerName} يكتب...</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const BZ = StyleSheet.create({
  content: { padding: 16, gap: 14 },
  qCard: { borderRadius: 20, borderWidth: 1.5, padding: 20, gap: 8, alignItems: 'flex-end' },
  qLabel: { fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5 },
  qTxt: { fontSize: 22, fontFamily: 'Inter_600SemiBold', textAlign: 'right', lineHeight: 34 },
  chainCard: { borderRadius: 20, borderWidth: 1.5, padding: 16, gap: 10 },
  chainLabel: { fontSize: 10, fontFamily: 'Inter_500Medium', letterSpacing: 1.5, textAlign: 'center' },
  chainScroll: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 4 },
  questionBadge: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 12, borderWidth: 1.5, paddingVertical: 10 },
  questionBadgeTxt: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  timerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  timerLabel: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  buzzBtn: { height: 180, borderRadius: 24, alignItems: 'center', justifyContent: 'center', gap: 10 },
  buzzBtnTxt: { fontSize: 24, fontFamily: 'Inter_700Bold' },
  winnerBanner: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, borderWidth: 1.5, paddingVertical: 12, paddingHorizontal: 16 },
  winnerTxt: { fontSize: 14, fontFamily: 'Inter_700Bold', flex: 1 },
  input: { borderWidth: 1.5, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 18, fontSize: 18, fontFamily: 'Inter_600SemiBold', textAlign: 'right' },
  sendBtn: { paddingVertical: 16, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  sendBtnTxt: { fontSize: 18, fontFamily: 'Inter_700Bold', color: '#FFF' },
  waitBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 14, borderWidth: 1, paddingVertical: 16 },
  waitTxt: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  watchBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 14, borderWidth: 1.5, paddingVertical: 16 },
  watchTxt: { fontSize: 15, fontFamily: 'Inter_700Bold' },
});

// ── Puzzle buzzer round (Round 5 / Tiebreaker) ────────────────────────────────
//
// Same buzz-lock mechanic as Round 3: buzz → exclusive answer window → wrong
// answer excludes only that player → first correct answer wins. Tiebreaker
// additionally allows skipping the current puzzle (only pre-buzz), which
// draws a different one from the pool and never causes a stall/draw.

function PuzzleBuzzerUI({ round, accentColor }: { round: 'round5' | 'tiebreaker'; accentColor: string }) {
  const { state, myUserId, buzz: doBuzz, submitAnswer, skipPuzzle } = useOnlineGame();
  const colors = useColors();
  const [text, setText]           = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [hasBuzzed, setHasBuzzed] = useState(false);

  const isBuzzPhase   = state.phase === `${round}_buzz`;
  const isAnswerPhase = state.phase === `${round}_answer`;
  const amWinner      = state.buzzWinner?.userId === myUserId;
  const secs          = useCountdown(isBuzzPhase ? state.deadlineTs : (state.buzzWinner?.deadlineTs ?? null));
  const maxSecs       = isBuzzPhase ? (round === 'tiebreaker' ? 30 : 25) : 12;

  const winnerColor = state.buzzWinner ? playerColor(state.room, state.buzzWinner.userId) : accentColor;
  const winnerName  = state.buzzWinner ? playerName(state.room, state.buzzWinner.userId) : '';

  useEffect(() => { setText(''); setSubmitted(false); setHasBuzzed(false); }, [state.question?.id]);

  const handleBuzz = () => {
    if (hasBuzzed) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    doBuzz();
    setHasBuzzed(true);
  };

  const handleSkip = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    skipPuzzle();
  };

  const handleSubmit = () => {
    if (!text.trim() || !amWinner || submitted) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    submitAnswer(text.trim());
    setSubmitted(true);
  };

  const transfers = state.question?.transfers ?? [];
  const displayChain = [...transfers].reverse();

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={BZ.content} keyboardShouldPersistTaps="handled">
        <View style={[BZ.chainCard, { backgroundColor: colors.card, borderColor: accentColor }]}>
          <Text style={[BZ.chainLabel, { color: colors.mutedForeground }]}>مسار الانتقالات ← الأحدث أولاً</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={BZ.chainScroll}>
            {displayChain.map((club, i) => (
              <React.Fragment key={i}>
                {i > 0 && <Ionicons name="arrow-back" size={14} color={accentColor} style={{ opacity: 0.55 }} />}
                <ClubChip clubRaw={club} isNewest={i === 0} />
              </React.Fragment>
            ))}
          </ScrollView>
          <View style={[BZ.questionBadge, { borderColor: accentColor, backgroundColor: `${accentColor}10` }]}>
            <Ionicons name="help-circle" size={18} color={accentColor} />
            <Text style={[BZ.questionBadgeTxt, { color: accentColor }]}>من هو هذا اللاعب؟</Text>
          </View>
        </View>

        {/* Someone skipped this puzzle */}
        {state.puzzleSkippedBy && (
          <View style={[BZ.winnerBanner, { borderColor: '#FF6B00', backgroundColor: '#FF6B0018' }]}>
            <Ionicons name="play-skip-forward" size={16} color="#FF6B00" />
            <Text style={[BZ.winnerTxt, { color: '#FF6B00' }]}>
              {state.puzzleSkippedBy === myUserId ? 'تخطيت هذا اللغز' : `${playerName(state.room, state.puzzleSkippedBy)} تخطّى هذا اللغز`}
            </Text>
          </View>
        )}

        {/* Buzz phase */}
        {isBuzzPhase && (
          <>
            <View style={BZ.timerRow}>
              <Text style={[BZ.timerLabel, { color: colors.mutedForeground }]}>وقت الجرس</Text>
              <CountdownRing secs={secs} maxSecs={maxSecs} color={accentColor} />
            </View>
            <TouchableOpacity onPress={handleBuzz} activeOpacity={0.7} disabled={hasBuzzed}>
              <LinearGradient
                colors={hasBuzzed ? ['#333', '#222'] : [accentColor, `${accentColor}BB`]}
                style={[BZ.buzzBtn, { opacity: hasBuzzed ? 0.5 : 1 }]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                <Ionicons name="radio-button-on" size={52} color={hasBuzzed ? '#555' : '#FFF'} />
                <Text style={[BZ.buzzBtnTxt, { color: hasBuzzed ? '#555' : '#FFF' }]}>
                  {hasBuzzed ? 'جارٍ الانتظار...' : 'اضغط!'}
                </Text>
              </LinearGradient>
            </TouchableOpacity>
            {round === 'tiebreaker' && !hasBuzzed && (
              <TouchableOpacity onPress={handleSkip} activeOpacity={0.8}>
                <View style={[R1.skipBtn, { borderColor: '#FF6B0066' }]}>
                  <Ionicons name="shuffle" size={16} color="#FF6B00" />
                  <Text style={R1.skipBtnTxt}>تخطي هذا اللغز</Text>
                </View>
              </TouchableOpacity>
            )}
          </>
        )}

        {/* Answer phase */}
        {isAnswerPhase && (
          <>
            <View style={[BZ.winnerBanner, { borderColor: winnerColor, backgroundColor: `${winnerColor}14` }]}>
              <Ionicons name="mic" size={18} color={winnerColor} />
              <Text style={[BZ.winnerTxt, { color: winnerColor }]}>
                {amWinner ? '⚡ أنت ضغطت أول — اكتب اسم اللاعب!' : `${winnerName} ضغط أول...`}
              </Text>
              <CountdownRing secs={secs} maxSecs={12} color={winnerColor} />
            </View>

            {amWinner && !submitted && (
              <View style={{ gap: 10 }}>
                <TextInput
                  style={[BZ.input, { color: colors.foreground, borderColor: winnerColor, backgroundColor: `${winnerColor}08` }]}
                  placeholder="اكتب اسم اللاعب..."
                  placeholderTextColor={`${winnerColor}55`}
                  value={text}
                  onChangeText={setText}
                  onSubmitEditing={handleSubmit}
                  returnKeyType="send"
                  autoFocus
                  textAlign="right"
                />
                <TouchableOpacity onPress={handleSubmit} activeOpacity={0.85} disabled={!text.trim()}>
                  <LinearGradient
                    colors={text.trim() ? [accentColor, `${accentColor}BB`] : ['#333', '#222']}
                    style={BZ.sendBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    <Ionicons name="send" size={18} color="#FFF" />
                    <Text style={BZ.sendBtnTxt}>إرسال</Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}
            {amWinner && submitted && (
              <View style={[BZ.waitBanner, { borderColor: `${winnerColor}44` }]}>
                <ActivityIndicator color={winnerColor} size="small" />
                <Text style={[BZ.waitTxt, { color: winnerColor }]}>جارٍ التصحيح...</Text>
              </View>
            )}
            {!amWinner && (
              <View style={[BZ.watchBanner, { borderColor: `${winnerColor}44`, backgroundColor: `${winnerColor}08` }]}>
                <Ionicons name="eye" size={18} color={winnerColor} />
                <Text style={[BZ.watchTxt, { color: winnerColor }]}>{winnerName} يكتب...</Text>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Round-end summary (synced popup shown to all players) ─────────────────────

function RoundEndOverlay() {
  const { state } = useOnlineGame();
  const colors = useColors();
  const re = state.roundEnd;
  if (!re) return null;
  const meta = ROUND_META[re.round] ?? { title: re.round, color: '#7B2FFF' };

  const sorted = (state.room?.players ?? [])
    .map(p => ({ ...p, score: re.scores[p.userId] ?? 0 }))
    .sort((a, b) => b.score - a.score);

  return (
    <View style={RE.overlay} pointerEvents="auto">
      <View style={[RE.card, { backgroundColor: colors.card, borderColor: meta.color }]}>
        <Ionicons name="checkmark-done-circle" size={40} color={meta.color} />
        <Text style={[RE.title, { color: meta.color }]}>انتهت جولة {meta.title}</Text>
        <View style={{ width: '100%', gap: 8, marginTop: 4 }}>
          {sorted.map((p, i) => (
            <View key={p.userId} style={[RE.row, { borderColor: `${meta.color}44` }]}>
              <Text style={RE.rowAvatar}>{p.avatar || '🎮'}</Text>
              <Text style={[RE.rowName, { color: colors.foreground }]}>{p.username}</Text>
              <Text style={[RE.rowScore, { color: i === 0 ? meta.color : colors.mutedForeground }]}>{p.score}</Text>
            </View>
          ))}
        </View>
        <ActivityIndicator color={meta.color} style={{ marginTop: 10 }} />
      </View>
    </View>
  );
}
const RE = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,5,16,0.92)', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 24 },
  card: { width: '100%', maxWidth: 380, borderRadius: 22, borderWidth: 1.5, padding: 24, gap: 10, alignItems: 'center' },
  title: { fontSize: 20, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, borderWidth: 1, paddingVertical: 8, paddingHorizontal: 12, width: '100%' },
  rowAvatar: { fontSize: 18 },
  rowName: { flex: 1, fontSize: 14, fontFamily: 'Inter_600SemiBold' },
  rowScore: { fontSize: 18, fontFamily: 'Inter_700Bold' },
});

// ── Game Over ──────────────────────────────────────────────────────────────────

function GameOverUI() {
  const { state, myUserId, disconnect } = useOnlineGame();
  const router  = useRouter();
  const colors  = useColors();
  const insets  = useSafeAreaInsets();
  const [saved, setSaved]   = useState(false);
  const [saving, setSaving] = useState(false);
  const [isNewRecord, setIsNewRecord] = useState(false);

  const go = state.gameOver!;
  const room = state.room;
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const scaleAnim = useRef(new Animated.Value(0.5)).current;
  const opacAnim  = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, tension: 60, friction: 7, useNativeDriver: true }),
      Animated.timing(opacAnim,  { toValue: 1, duration: 600, useNativeDriver: true }),
    ]).start();
  }, []);

  const winnerName  = go.winnerUserId ? playerName(room, go.winnerUserId) : null;
  const winnerColor = go.winnerUserId ? playerColor(room, go.winnerUserId) : '#FFD700';
  const amWinner    = go.winnerUserId === myUserId;

  // Sort players by score descending
  const sorted = (room?.players ?? [])
    .map(p => ({ ...p, score: go.scores[p.userId] ?? 0 }))
    .sort((a, b) => b.score - a.score);

  const handleSave = async () => {
    if (saving || saved || !go.winnerUserId) return;
    const wScore = go.scores[go.winnerUserId] ?? 0;
    const wName  = playerName(room, go.winnerUserId);
    setSaving(true);
    try {
      const res = await addLeaderboardEntry(wName.slice(0, 20), wScore);
      if (res) { setSaved(true); setIsNewRecord(res.isNewRecord); }
    } catch { /* silent */ } finally { setSaving(false); }
  };

  const handleBack = () => {
    disconnect();
    router.replace('/');
  };

  return (
    <View style={{ flex: 1 }}>
      <LinearGradient colors={[`${winnerColor}18`, '#050510', `${winnerColor}10`]} style={StyleSheet.absoluteFill} />
      <ScrollView contentContainerStyle={[GO.content, { paddingTop: topPad + 20, paddingBottom: botPad + 30 }]}>
        {/* Trophy */}
        {go.winnerUserId && (
          <Animated.View style={[GO.trophyWrap, { transform: [{ scale: scaleAnim }], opacity: opacAnim }]}>
            <View style={[GO.trophyCircle, { borderColor: winnerColor }]}>
              <Ionicons name="trophy" size={60} color={winnerColor} />
            </View>
          </Animated.View>
        )}

        {/* Winner */}
        <Animated.View style={[GO.resultBox, { opacity: opacAnim }]}>
          {winnerName ? (
            <>
              <Text style={[GO.congratsTxt, { color: colors.mutedForeground }]}>🏆 {amWinner ? 'فزت!' : 'الفائز هو'}</Text>
              <Text style={[GO.winnerName, { color: winnerColor }]}>{winnerName}</Text>
              {go.decidedByTiebreaker && <Text style={[GO.tieSub, { color: '#FFD700' }]}>الهدف الذهبي ⚡</Text>}
            </>
          ) : (
            <>
              <Text style={[GO.congratsTxt, { color: '#FFD700' }]}>🤝 تعادل!</Text>
              <Text style={[GO.tieSub, { color: colors.mutedForeground }]}>استنفدت لعب الفاصل دون حسم</Text>
            </>
          )}
        </Animated.View>

        {/* Scores */}
        <Animated.View style={[GO.breakdown, { opacity: opacAnim, backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[GO.breakdownTitle, { color: colors.mutedForeground }]}>النتيجة النهائية</Text>
          {sorted.map((p, rank) => {
            const pc = playerColor(room, p.userId);
            const isWin = p.userId === go.winnerUserId;
            return (
              <View key={p.userId} style={[GO.row, { borderColor: isWin ? pc : `${pc}44` }]}>
                <Text style={[GO.rank, { color: isWin ? '#FFD700' : colors.mutedForeground }]}>
                  {rank === 0 ? '🥇' : rank === 1 ? '🥈' : rank === 2 ? '🥉' : `${rank + 1}.`}
                </Text>
                <Text style={GO.rowAvatar}>{p.avatar || '🎮'}</Text>
                <Text style={[GO.rowName, { color: isWin ? pc : colors.foreground }]}>{p.username}</Text>
                <Text style={[GO.rowScore, { color: pc }]}>{p.score}</Text>
              </View>
            );
          })}
        </Animated.View>

        {/* Leaderboard save */}
        {go.winnerUserId && (
          <Animated.View style={[GO.lbCard, { opacity: opacAnim, borderColor: '#FFD700', backgroundColor: 'rgba(255,215,0,0.06)' }]}>
            {saved ? (
              <View style={GO.savedRow}>
                <Ionicons name="checkmark-circle" size={22} color="#00C853" />
                <Text style={[GO.savedTxt, { color: '#00C853' }]}>
                  {isNewRecord ? '🏆 رقم قياسي جديد!' : '✅ تم التسجيل على عرش الأبطال!'}
                </Text>
              </View>
            ) : (
              <>
                <Text style={[GO.lbLabel, { color: '#FFD700' }]}>🏆 سجّل الفائز على عرش الأبطال</Text>
                <TouchableOpacity onPress={handleSave} activeOpacity={0.85} disabled={saving}>
                  <LinearGradient colors={['#FFD700', '#FFA500']} style={GO.saveBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                    {saving ? <ActivityIndicator color="#050510" /> : <>
                      <Ionicons name="trophy" size={18} color="#050510" />
                      <Text style={GO.saveBtnTxt}>أضف إلى لوحة الصدارة</Text>
                    </>}
                  </LinearGradient>
                </TouchableOpacity>
              </>
            )}
          </Animated.View>
        )}

        <TouchableOpacity onPress={handleBack} activeOpacity={0.85}>
          <LinearGradient colors={['#FFD700', '#FFA500']} style={GO.backBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <Ionicons name="home" size={22} color="#050510" />
            <Text style={GO.backBtnTxt}>العودة للقائمة</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}
const GO = StyleSheet.create({
  content: { paddingHorizontal: 22, gap: 18, alignItems: 'center' },
  trophyWrap: { alignItems: 'center' },
  trophyCircle: { width: 120, height: 120, borderRadius: 60, borderWidth: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0A0A22' },
  resultBox: { alignItems: 'center', gap: 6 },
  congratsTxt: { fontSize: 15, fontFamily: 'Inter_500Medium', letterSpacing: 1 },
  winnerName: { fontSize: 40, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  tieSub: { fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  breakdown: { width: '100%', borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  breakdownTitle: { fontSize: 11, fontFamily: 'Inter_500Medium', textAlign: 'center', letterSpacing: 1.5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 14 },
  rank: { fontSize: 18, fontFamily: 'Inter_700Bold', width: 30, textAlign: 'center' },
  rowAvatar: { fontSize: 20 },
  rowName: { flex: 1, fontSize: 15, fontFamily: 'Inter_600SemiBold' },
  rowScore: { fontSize: 24, fontFamily: 'Inter_700Bold' },
  lbCard: { width: '100%', borderRadius: 18, borderWidth: 1.5, padding: 16, gap: 12 },
  lbLabel: { fontSize: 14, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  savedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 4 },
  savedTxt: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14 },
  saveBtnTxt: { fontSize: 15, fontFamily: 'Inter_700Bold', color: '#050510' },
  backBtn: { width: '100%', paddingVertical: 18, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  backBtnTxt: { fontSize: 20, fontFamily: 'Inter_700Bold', color: '#050510' },
});

// ── Root Screen ────────────────────────────────────────────────────────────────

export default function OnlineGameScreen() {
  const { state, myUserId, leaveRoom, disconnect } = useOnlineGame();
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const colors  = useColors();
  const topPad  = Platform.OS === 'web' ? 67 : insets.top;
  const sounds  = useSoundContext();

  // ── Task 5: Sound effects tied to socket events ──────────────────────────
  // Correct / wrong on every answer result (round1Answer & answerResult)
  const lastResultRef = useRef(state.lastResult);
  useEffect(() => {
    const r = state.lastResult;
    if (!r || r === lastResultRef.current) return;
    lastResultRef.current = r;
    if (r.correct) {
      try { sounds?.correctPlayer?.play(); } catch (_) {}
    } else if (!r.skipped) {
      try { sounds?.wrongPlayer?.play(); } catch (_) {}
    }
  }, [state.lastResult]);

  // Sound on every Round 1 answer attempt (not just conclusive ones)
  const lastR1AnswerRef = useRef<typeof state.round1Answers[0] | null>(null);
  useEffect(() => {
    const answers = state.round1Answers;
    if (answers.length === 0) return;
    const latest = answers[answers.length - 1]!;
    if (latest === lastR1AnswerRef.current) return;
    lastR1AnswerRef.current = latest;
    if (latest.correct) {
      try { sounds?.correctPlayer?.play(); } catch (_) {}
    } else if (!latest.skipped) {
      try { sounds?.wrongPlayer?.play(); } catch (_) {}
    }
  }, [state.round1Answers]);

  // Fanfare on round transition
  useEffect(() => {
    if (!state.transitionRound) return;
    try { sounds?.fanfarePlayer?.play(); } catch (_) {}
  }, [state.transitionRound]);

  // Buzz click
  const lastBuzzRef = useRef(state.buzzWinner);
  useEffect(() => {
    if (!state.buzzWinner || state.buzzWinner === lastBuzzRef.current) return;
    lastBuzzRef.current = state.buzzWinner;
    try { sounds?.clickPlayer?.play(); } catch (_) {}
  }, [state.buzzWinner]);

  // Fanfare on game over
  useEffect(() => {
    if (!state.gameOver) return;
    try { sounds?.fanfarePlayer?.play(); } catch (_) {}
  }, [state.gameOver]);

  // Leave if no room and no game over (user left externally)
  useEffect(() => {
    if (!state.room && !state.gameOver) {
      router.replace('/online-lobby');
    }
  }, [state.room, state.gameOver]);

  const handleLeave = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    leaveRoom();
    disconnect();
    router.replace('/');
  };

  if (state.gameOver) {
    return (
      <View style={[S.root, { backgroundColor: colors.background }]}>
        <GameOverUI />
      </View>
    );
  }

  return (
    <View style={[S.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={['#050510', '#08082A', '#050510']} style={StyleSheet.absoluteFill} />

      {/* Top bar */}
      <View style={[S.topBar, { paddingTop: topPad + 4 }]}>
        <ScoreHeader round={state.currentRound} />
        <TouchableOpacity onPress={handleLeave} style={[S.leaveBtn, { borderColor: '#FF3B3B44' }]}>
          <Ionicons name="exit-outline" size={18} color="#FF3B3B" />
        </TouchableOpacity>
      </View>

      {/* Main content */}
      <View style={{ flex: 1 }}>
        {/* Round transition */}
        {state.transitionRound && <RoundTransition round={state.transitionRound} />}

        {/* Round UIs */}
        {!state.transitionRound && state.currentRound === 'round1' && <Round1UI />}
        {!state.transitionRound && state.currentRound === 'round2' && <Round2UI />}
        {!state.transitionRound && state.currentRound === 'round3' && <BuzzerUI accentColor="#FF6B00" />}
        {!state.transitionRound && state.currentRound === 'round4' && <Round4UI />}
        {!state.transitionRound && state.currentRound === 'round5' && <RaceUI accentColor="#00E5FF" />}
        {!state.transitionRound && state.currentRound === 'tiebreaker' && <RaceUI accentColor="#FFD700" />}

        {/* Loading / between phases */}
        {!state.transitionRound && !state.currentRound && (
          <View style={S.loadingWrap}>
            <ActivityIndicator color="#7B2FFF" size="large" />
            <Text style={[S.loadingTxt, { color: colors.mutedForeground }]}>جارٍ تحضير اللعبة...</Text>
          </View>
        )}
      </View>

      {/* Overlays */}
      <ResultOverlay />
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1 },
  topBar: { flexDirection: 'row', alignItems: 'stretch' },
  leaveBtn: { width: 44, alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderBottomWidth: 1, borderColor: '#FF3B3B44' },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  loadingTxt: { fontSize: 15, fontFamily: 'Inter_500Medium' },
});
