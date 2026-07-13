/**
 * online-waiting.tsx
 *
 * Three visual states:
 * 1. Matchmaking spinner  — state.matchmaking && !room
 * 2. Match-Found / Ready  — quick mode, room in lobby  (NEW Task 3)
 * 3. Normal waiting room  — group mode, room in lobby
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator, Animated, ScrollView, StyleSheet,
  Text, TouchableOpacity, View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOnlineGame } from '@/contexts/OnlineGameContext';
import { useColors } from '@/hooks/useColors';

const DIFF_COLORS: Record<string, string> = { easy: '#00C853', medium: '#FFB300', hard: '#FF3B3B' };
const DIFF_LABELS: Record<string, string> = { easy: 'سهل', medium: 'متوسط', hard: 'صعب' };

function AvatarCircle({ emoji, size = 72, glow }: { emoji: string; size?: number; glow?: string }) {
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: `${glow ?? '#7B2FFF'}22`,
      borderWidth: 2, borderColor: glow ?? '#7B2FFF',
      alignItems: 'center', justifyContent: 'center',
    }}>
      <Text style={{ fontSize: size * 0.5 }}>{emoji}</Text>
    </View>
  );
}

function LevelBadge({ level, wins }: { level: number; wins: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#FFD70022', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
        <Text style={{ fontSize: 10, color: '#FFD700' }}>⭐</Text>
        <Text style={{ fontSize: 10, color: '#FFD700', fontWeight: '700' }}>Lv.{level}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#00C85322', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 }}>
        <Text style={{ fontSize: 10, color: '#00C853' }}>🏆</Text>
        <Text style={{ fontSize: 10, color: '#00C853', fontWeight: '700' }}>{wins}</Text>
      </View>
    </View>
  );
}

function PlayerRow({ player, isMe }: { player: { userId: string; username: string; avatar: string; connected: boolean; score: number; isHost: boolean; level: number; totalWins: number }; isMe: boolean }) {
  return (
    <View style={[S.playerRow, { borderColor: isMe ? '#7B2FFF55' : '#FFFFFF10', backgroundColor: isMe ? 'rgba(123,47,255,0.08)' : 'rgba(255,255,255,0.03)' }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
        <Text style={{ fontSize: 28 }}>{player.avatar}</Text>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {player.isHost && <Text style={{ fontSize: 11, color: '#FFD700' }}>👑</Text>}
            <Text style={{ fontSize: 14, color: '#fff', fontWeight: '700' }} numberOfLines={1}>{player.username}</Text>
            {isMe && <View style={{ backgroundColor: '#7B2FFF33', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1 }}><Text style={{ fontSize: 10, color: '#A569FF' }}>أنت</Text></View>}
          </View>
          <LevelBadge level={player.level ?? 1} wins={player.totalWins ?? 0} />
        </View>
      </View>
      <View style={[S.connDot, { backgroundColor: player.connected ? '#00C853' : '#FF3B3B' }]} />
    </View>
  );
}

// ── Match-Found Ready Screen ───────────────────────────────────────────────────

function MatchFoundScreen() {
  const { state, myUserId, sendReady } = useOnlineGame();
  const { room, readyPlayers, readyCountdown } = state;
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [pulse] = useState(new Animated.Value(1));

  const me = room?.players.find((p) => p.userId === myUserId);
  const opponent = room?.players.find((p) => p.userId !== myUserId);
  const iAmReady = myUserId ? readyPlayers.includes(myUserId) : false;
  const opponentReady = opponent ? readyPlayers.includes(opponent.userId) : false;

  // Navigate to game when it starts
  useEffect(() => {
    if (room?.status === 'playing') {
      router.replace('/online-game');
    }
  }, [room?.status]);

  // Pulse the ready button
  useEffect(() => {
    if (!iAmReady) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulse, { toValue: 1.06, duration: 700, useNativeDriver: true }),
          Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
        ]),
      ).start();
    } else {
      pulse.setValue(1);
    }
  }, [iAmReady]);

  const handleReady = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    sendReady();
  };

  return (
    <View style={[S.root]}>
      <LinearGradient colors={['#0D0025', '#050510', '#000D1A']} style={StyleSheet.absoluteFill} />
      {/* Glow accents */}
      <View style={{ position: 'absolute', top: -80, alignSelf: 'center', width: 300, height: 300, borderRadius: 150, backgroundColor: '#7B2FFF15', opacity: 0.7 }} />

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: insets.top, paddingBottom: insets.bottom + 24, paddingHorizontal: 24 }}>

        {/* Title */}
        <View style={{ alignItems: 'center', marginBottom: 36 }}>
          <Text style={{ fontSize: 13, color: '#7B2FFF', fontWeight: '700', letterSpacing: 2, marginBottom: 6 }}>⚡ مباراة سريعة</Text>
          <Text style={{ fontSize: 30, color: '#FFD700', fontWeight: '900' }}>تم العثور على خصم!</Text>
          <Text style={{ fontSize: 14, color: '#FFFFFF66', marginTop: 6 }}>
            {readyCountdown != null
              ? `تبدأ اللعبة في ${readyCountdown}...`
              : 'كلا اللاعبين يجب أن يضغطا جاهز'}
          </Text>
        </View>

        {/* Players */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'center', gap: 24, width: '100%', marginBottom: 40 }}>
          {/* Me */}
          <View style={{ alignItems: 'center', flex: 1 }}>
            <AvatarCircle emoji={me?.avatar ?? '🎮'} size={80} glow='#7B2FFF' />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14, marginTop: 8 }} numberOfLines={1}>{me?.username ?? '...'}</Text>
            <LevelBadge level={me?.level ?? 1} wins={me?.totalWins ?? 0} />
            {iAmReady && (
              <View style={{ marginTop: 8, backgroundColor: '#00C85322', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ color: '#00C853', fontWeight: '700', fontSize: 12 }}>✓ جاهز</Text>
              </View>
            )}
          </View>

          {/* VS */}
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 28 }}>
            <Text style={{ fontSize: 22, color: '#FFD700', fontWeight: '900' }}>VS</Text>
          </View>

          {/* Opponent */}
          <View style={{ alignItems: 'center', flex: 1 }}>
            <AvatarCircle emoji={opponent?.avatar ?? '❓'} size={80} glow='#FF3B3B' />
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14, marginTop: 8 }} numberOfLines={1}>{opponent?.username ?? 'في الانتظار...'}</Text>
            <LevelBadge level={opponent?.level ?? 1} wins={opponent?.totalWins ?? 0} />
            {opponentReady && (
              <View style={{ marginTop: 8, backgroundColor: '#00C85322', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ color: '#00C853', fontWeight: '700', fontSize: 12 }}>✓ جاهز</Text>
              </View>
            )}
          </View>
        </View>

        {/* Countdown circle */}
        {readyCountdown != null && (
          <View style={{ marginBottom: 28, width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: '#FFD700', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFD70022' }}>
            <Text style={{ fontSize: 32, fontWeight: '900', color: '#FFD700' }}>{readyCountdown}</Text>
          </View>
        )}

        {/* Ready button */}
        {!iAmReady && readyCountdown == null && (
          <Animated.View style={{ transform: [{ scale: pulse }], width: '100%' }}>
            <TouchableOpacity onPress={handleReady} activeOpacity={0.85}>
              <LinearGradient
                colors={['#00C853', '#007A32']}
                style={S.readyBtn}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
              >
                <Ionicons name="checkmark-circle" size={24} color="#FFF" />
                <Text style={S.readyBtnTxt}>جاهز للعب!</Text>
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>
        )}

        {iAmReady && !opponentReady && readyCountdown == null && (
          <View style={{ alignItems: 'center', gap: 8 }}>
            <ActivityIndicator color="#7B2FFF" />
            <Text style={{ color: '#FFFFFF66', fontSize: 13 }}>في انتظار الخصم...</Text>
          </View>
        )}
      </View>
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function OnlineWaiting() {
  const { state, myUserId, cancelMatchmaking, leaveRoom, startGame } = useOnlineGame();
  const { room } = state;
  const colors = useThemeColors();
  const router = useRouter();
  const { top: topPad, bottom: botPad } = useSafeAreaInsets();
  const [copied, setCopied]   = useState(false);
  const [starting, setStarting] = useState(false);
  const [startErr, setStartErr] = useState<string | null>(null);

  const isHost = room?.players.find((p) => p.userId === myUserId)?.isHost ?? false;
  const canStart = !!room && room.players.filter((p) => p.connected).length >= 2;

  // Navigate to game when playing
  useEffect(() => {
    if (room?.status === 'playing') {
      router.replace('/online-game');
    }
  }, [room?.status]);

  const handleCopyCode = async () => {
    if (!room?.code) return;
    await Clipboard.setStringAsync(room.code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleLeave = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (state.matchmaking) cancelMatchmaking();
    else leaveRoom();
    router.replace('/online-lobby');
  };

  const handleStart = async () => {
    setStartErr(null);
    setStarting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const res = await startGame();
    setStarting(false);
    if (!res.ok) setStartErr(res.error ?? 'فشل بدء اللعبة');
  };

  // ── State 1: Matchmaking spinner ───────────────────────────────────────────
  if (state.matchmaking && !room) {
    return (
      <View style={[S.root, { backgroundColor: colors.background }]}>
        <LinearGradient colors={['#0D0025', '#050510', '#000D1A']} style={StyleSheet.absoluteFill} />
        <View style={[S.center, { paddingTop: topPad, paddingBottom: botPad }]}>
          <View style={S.pulseRing}>
            <Ionicons name="flash" size={52} color="#FFD700" />
          </View>
          <Text style={[S.bigTitle, { color: '#FFD700' }]}>بحث عن خصم...</Text>
          <Text style={[S.subText, { color: colors.mutedForeground }]}>جارٍ إيجاد لاعب بنفس مستواك</Text>
          <ActivityIndicator size="large" color="#FFD700" style={{ marginTop: 8 }} />
          <TouchableOpacity onPress={handleLeave} activeOpacity={0.8} style={{ marginTop: 24 }}>
            <View style={[S.cancelBtn, { borderColor: colors.border }]}>
              <Ionicons name="close" size={18} color={colors.mutedForeground} />
              <Text style={[S.cancelBtnTxt, { color: colors.mutedForeground }]}>إلغاء البحث</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── State 2: Quick match found — ready screen ──────────────────────────────
  if (room && room.mode === 'quick' && room.status === 'lobby') {
    return <MatchFoundScreen />;
  }

  if (!room) return null;

  // ── State 3: Normal group waiting room ────────────────────────────────────
  const diff = room.difficulty;

  return (
    <View style={[S.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={['#0D0025', '#050510', '#000D1A']} style={StyleSheet.absoluteFill} />
      <View style={S.glowPurple} />

      <ScrollView contentContainerStyle={[S.content, { paddingTop: topPad + 8, paddingBottom: botPad + 24 }]}>
        {/* Header */}
        <View style={S.headerRow}>
          <TouchableOpacity onPress={handleLeave} style={[S.backBtn, { borderColor: colors.border }]}>
            <Ionicons name="arrow-forward" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
          <View style={{ alignItems: 'center' }}>
            <Text style={[S.headerTag, { color: colors.mutedForeground }]}>غرفة الانتظار</Text>
            <Text style={[S.headerTitle, { color: '#7B2FFF' }]}>
              {room.mode === 'quick' ? '⚡ سريع' : '🏠 غرفة'}
            </Text>
          </View>
          <View style={[S.diffBadge, { borderColor: DIFF_COLORS[diff] ?? '#FFD700', backgroundColor: `${DIFF_COLORS[diff] ?? '#FFD700'}18` }]}>
            <Text style={[S.diffBadgeTxt, { color: DIFF_COLORS[diff] ?? '#FFD700' }]}>{DIFF_LABELS[diff] ?? diff}</Text>
          </View>
        </View>

        {/* Room code */}
        <TouchableOpacity onPress={handleCopyCode} activeOpacity={0.85} style={{ width: '100%' }}>
          <View style={[S.codeCard, { borderColor: '#7B2FFF', backgroundColor: 'rgba(123,47,255,0.08)' }]}>
            <Text style={[S.codeLabel, { color: colors.mutedForeground }]}>رمز الغرفة</Text>
            <Text style={[S.codeText, { color: '#7B2FFF' }]}>{room.code}</Text>
            <View style={[S.copyBadge, { backgroundColor: copied ? '#00C853' : 'rgba(123,47,255,0.18)' }]}>
              <Ionicons name={copied ? 'checkmark' : 'copy-outline'} size={16} color={copied ? '#FFF' : '#7B2FFF'} />
              <Text style={[S.copyTxt, { color: copied ? '#FFF' : '#7B2FFF' }]}>{copied ? 'تم النسخ!' : 'انسخ الرمز'}</Text>
            </View>
            <Text style={[S.codeHint, { color: colors.mutedForeground }]}>شارك الرمز مع أصدقائك للانضمام</Text>
          </View>
        </TouchableOpacity>

        {/* Players */}
        <View style={{ width: '100%', gap: 10 }}>
          <Text style={[S.sectionLabel, { color: colors.mutedForeground }]}>
            اللاعبون ({room.players.length}/8)
          </Text>
          {room.players.map((player) => (
            <PlayerRow key={player.userId} player={player} isMe={player.userId === myUserId} />
          ))}
          {room.players.length < 8 && (
            <View style={[S.emptySlot, { borderColor: `${colors.border}66` }]}>
              <Ionicons name="person-add-outline" size={16} color={colors.mutedForeground} />
              <Text style={[S.emptySlotTxt, { color: colors.mutedForeground }]}>في انتظار لاعبين آخرين...</Text>
            </View>
          )}
        </View>

        {/* Error */}
        {startErr && (
          <View style={S.errRow}>
            <Ionicons name="alert-circle" size={15} color="#FF3B3B" />
            <Text style={S.errTxt}>{startErr}</Text>
          </View>
        )}

        {/* Action */}
        {isHost ? (
          <TouchableOpacity
            onPress={handleStart}
            activeOpacity={0.85}
            disabled={starting || !canStart}
            style={{ width: '100%' }}
          >
            <LinearGradient
              colors={(!canStart || starting) ? ['#2A2A2A', '#1A1A1A'] : ['#7B2FFF', '#5A1FCC']}
              style={S.startBtn}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
            >
              {starting
                ? <ActivityIndicator color="#FFF" />
                : <>
                    <Ionicons name="play" size={22} color="#FFF" />
                    <Text style={S.startBtnTxt}>
                      {canStart ? 'ابدأ اللعبة' : 'في انتظار لاعب آخر...'}
                    </Text>
                  </>}
            </LinearGradient>
          </TouchableOpacity>
        ) : (
          <View style={[S.guestWait, { borderColor: '#7B2FFF55', backgroundColor: 'rgba(123,47,255,0.06)' }]}>
            <ActivityIndicator color="#7B2FFF" size="small" />
            <Text style={[S.guestWaitTxt, { color: colors.mutedForeground }]}>في انتظار المضيف ليبدأ...</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  root:         { flex: 1 },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  content:      { alignItems: 'center', gap: 16, paddingHorizontal: 16 },
  glowPurple:   { position: 'absolute', top: -60, right: -60, width: 200, height: 200, borderRadius: 100, backgroundColor: '#7B2FFF20' },

  // Header
  headerRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%', marginBottom: 4 },
  backBtn:      { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  headerTag:    { fontSize: 11, letterSpacing: 1 },
  headerTitle:  { fontSize: 16, fontWeight: '800' },
  diffBadge:    { borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  diffBadgeTxt: { fontSize: 11, fontWeight: '700' },

  // Code card
  codeCard:     { borderRadius: 16, borderWidth: 1.5, padding: 16, alignItems: 'center', gap: 6, width: '100%' },
  codeLabel:    { fontSize: 12 },
  codeText:     { fontSize: 28, fontWeight: '900', letterSpacing: 6 },
  copyBadge:    { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5 },
  copyTxt:      { fontSize: 12, fontWeight: '700' },
  codeHint:     { fontSize: 11 },

  // Players
  sectionLabel: { fontSize: 12, letterSpacing: 1, marginBottom: 2 },
  playerRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 10 },
  connDot:      { width: 8, height: 8, borderRadius: 4 },
  emptySlot:    { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', paddingHorizontal: 14, paddingVertical: 12 },
  emptySlotTxt: { fontSize: 13 },

  // Actions
  startBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 16, paddingVertical: 16 },
  startBtnTxt:  { color: '#FFF', fontSize: 17, fontWeight: '800' },
  guestWait:    { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 16, borderWidth: 1, paddingVertical: 16, paddingHorizontal: 20, width: '100%', justifyContent: 'center' },
  guestWaitTxt: { fontSize: 15, fontWeight: '600' },

  // Ready button
  readyBtn:     { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderRadius: 18, paddingVertical: 18 },
  readyBtnTxt:  { color: '#FFF', fontSize: 20, fontWeight: '900' },

  // Error
  errRow:       { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FF3B3B18', borderRadius: 10, padding: 10 },
  errTxt:       { color: '#FF3B3B', fontSize: 13 },

  // Matchmaking
  pulseRing:    { width: 100, height: 100, borderRadius: 50, backgroundColor: '#FFD70015', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#FFD70044' },
  bigTitle:     { fontSize: 24, fontWeight: '900' },
  subText:      { fontSize: 14, textAlign: 'center' },
  cancelBtn:    { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 12, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 10 },
  cancelBtnTxt: { fontSize: 14 },
});
