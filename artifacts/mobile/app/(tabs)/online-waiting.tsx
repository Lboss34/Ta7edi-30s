/**
 * Online Waiting Room — lobby where players wait before the game starts.
 * - Shows room code prominently (copyable).
 * - Host sees "ابدأ اللعبة" button.
 * - Guest sees "في انتظار المضيف...".
 * - Matchmaking mode shows a spinner.
 * - Navigates to online-game when the room status changes to 'playing'.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useOnlineGame, type OnlinePlayer } from '@/contexts/OnlineGameContext';

const PLAYER_COLORS = ['#7B2FFF', '#FFD700', '#00E5FF', '#FF6B00', '#00C853'];
const DIFF_LABELS: Record<string, string> = { easy: 'سهل', medium: 'متوسط', hard: 'صعب' };
const DIFF_COLORS: Record<string, string> = { easy: '#00C853', medium: '#FFD700', hard: '#FF3B3B' };

export default function OnlineWaitingScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const colors  = useColors();
  const { state, myUserId, leaveRoom, startGame, cancelMatchmaking } = useOnlineGame();

  const [copied, setCopied]   = useState(false);
  const [starting, setStarting] = useState(false);
  const [startErr, setStartErr] = useState<string | null>(null);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const room    = state.room;
  const isHost  = !!room && !!myUserId && room.hostUserId === myUserId;
  const canStart = !!room && room.players.filter(p => p.connected).length >= 2;

  // When the game starts, navigate to the game screen
  useEffect(() => {
    if (room?.status === 'playing') {
      router.replace('/online-game');
    }
  }, [room?.status]);

  // If neither room nor matchmaking: go back to lobby
  useEffect(() => {
    if (!room && !state.matchmaking) {
      router.replace('/online-lobby');
    }
  }, [room, state.matchmaking]);

  const handleCopyCode = async () => {
    if (!room) return;
    await Clipboard.setStringAsync(room.code);
    setCopied(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
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

  // ── Matchmaking waiting state ─────────────────────────────────────────────
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

  if (!room) return null;

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
            اللاعبون ({room.players.length}/10)
          </Text>
          {room.players.map((player, i) => (
            <PlayerRow key={player.userId} player={player} index={i} isMe={player.userId === myUserId} />
          ))}
          {/* Empty slot hint if < 10 */}
          {room.players.length < 10 && (
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

function PlayerRow({ player, index, isMe }: { player: OnlinePlayer; index: number; isMe: boolean }) {
  const colors = useColors();
  const pc = PLAYER_COLORS[index % PLAYER_COLORS.length] ?? '#7B2FFF';
  return (
    <View style={[S.playerRow, { borderColor: `${pc}55`, backgroundColor: `${pc}0A` }]}>
      <Text style={[S.playerAvatar]}>{player.avatar || '🎮'}</Text>
      <View style={{ flex: 1 }}>
        <Text style={[S.playerName, { color: pc }]}>
          {player.username}{isMe ? ' (أنت)' : ''}
          {player.isHost ? ' 👑' : ''}
        </Text>
      </View>
      <View style={[S.connDot, { backgroundColor: player.connected ? '#00C853' : '#FF3B3B' }]} />
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1 },
  glowPurple: { position: 'absolute', top: '8%', alignSelf: 'center', width: 260, height: 260, borderRadius: 130, backgroundColor: '#7B2FFF', opacity: 0.05 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, gap: 18 },
  content: { paddingHorizontal: 20, gap: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  headerTag: { fontSize: 10, fontFamily: 'Inter_500Medium', letterSpacing: 1.5 },
  headerTitle: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  backBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  diffBadge: { borderRadius: 10, borderWidth: 1, paddingVertical: 6, paddingHorizontal: 10 },
  diffBadgeTxt: { fontSize: 12, fontFamily: 'Inter_700Bold' },
  codeCard: { borderRadius: 20, borderWidth: 1.5, paddingVertical: 20, paddingHorizontal: 22, alignItems: 'center', gap: 8 },
  codeLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', letterSpacing: 2 },
  codeText: { fontSize: 48, fontFamily: 'Inter_700Bold', letterSpacing: 10 },
  copyBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, paddingVertical: 8, paddingHorizontal: 14 },
  copyTxt: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  codeHint: { fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  sectionLabel: { fontSize: 11, fontFamily: 'Inter_500Medium', letterSpacing: 1.5 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 14, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 16 },
  playerAvatar: { fontSize: 24 },
  playerName: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  connDot: { width: 9, height: 9, borderRadius: 5 },
  emptySlot: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, borderStyle: 'dashed', paddingVertical: 14, paddingHorizontal: 16 },
  emptySlotTxt: { fontSize: 13, fontFamily: 'Inter_400Regular' },
  errRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  errTxt: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#FF3B3B' },
  startBtn: { paddingVertical: 18, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  startBtnTxt: { fontSize: 20, fontFamily: 'Inter_700Bold', color: '#FFF' },
  guestWait: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, borderRadius: 16, borderWidth: 1, paddingVertical: 16 },
  guestWaitTxt: { fontSize: 15, fontFamily: 'Inter_500Medium' },
  pulseRing: { width: 120, height: 120, borderRadius: 60, borderWidth: 3, borderColor: '#FFD700', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,215,0,0.08)' },
  bigTitle: { fontSize: 30, fontFamily: 'Inter_700Bold' },
  subText: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  cancelBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 20 },
  cancelBtnTxt: { fontSize: 15, fontFamily: 'Inter_600SemiBold' },
});
