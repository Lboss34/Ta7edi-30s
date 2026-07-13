/**
 * Online Lobby — entry point for online multiplayer.
 * Options: Create Room | Quick Match | Join by Code
 * Requires the user to be logged in.
 */
import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, Platform, ActivityIndicator,
  KeyboardAvoidingView, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useAuth } from '@/contexts/AuthContext';
import { useOnlineGame } from '@/contexts/OnlineGameContext';

type Difficulty = 'easy' | 'medium' | 'hard';
type Mode = 'menu' | 'join';

const DIFFS: { key: Difficulty; label: string; color: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'easy',   label: 'سهل',   color: '#00C853', icon: 'star-outline' },
  { key: 'medium', label: 'متوسط', color: '#FFD700', icon: 'star-half'    },
  { key: 'hard',   label: 'صعب',   color: '#FF3B3B', icon: 'star'         },
];

export default function OnlineLobbyScreen() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const colors  = useColors();
  const { user, token } = useAuth();
  const { state, connect, createRoom, joinMatchmaking, joinRoom, cancelMatchmaking } = useOnlineGame();

  const [mode, setMode]           = useState<Mode>('menu');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [joinCode, setJoinCode]   = useState('');
  const [busy, setBusy]           = useState(false);
  const [error, setError]         = useState<string | null>(null);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  // Connect socket once on mount
  useEffect(() => {
    if (token && user) connect(token, user.id);
  }, [token, user]);

  // Navigate to waiting room once we have a room
  useEffect(() => {
    if (state.room || state.matchmaking) {
      router.push('/online-waiting');
    }
  }, [state.room, state.matchmaking]);

  if (!user) {
    return (
      <View style={[S.root, { backgroundColor: colors.background }]}>
        <LinearGradient colors={['#0D0025', '#050510', '#000D1A']} style={StyleSheet.absoluteFill} />
        <View style={[S.center, { paddingTop: topPad, paddingBottom: botPad }]}>
          <Ionicons name="wifi" size={60} color={colors.mutedForeground} />
          <Text style={[S.emptyTitle, { color: colors.foreground }]}>سجّل الدخول للعب أونلاين</Text>
          <TouchableOpacity onPress={() => router.push('/auth-login')} activeOpacity={0.85} style={{ width: '100%' }}>
            <LinearGradient colors={['#7B2FFF', '#5A1FCC']} style={S.bigBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Text style={S.bigBtnTxt}>تسجيل الدخول</Text>
            </LinearGradient>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={{ marginTop: 12 }}>
            <Text style={[S.backTxt, { color: colors.mutedForeground }]}>رجوع</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Difficulty picker row ─────────────────────────────────────────────────
  const DiffRow = () => (
    <View style={S.diffRow}>
      {DIFFS.map(({ key, label, color, icon }) => (
        <TouchableOpacity
          key={key}
          onPress={() => { Haptics.selectionAsync(); setDifficulty(key); }}
          activeOpacity={0.8}
          style={{ flex: 1 }}
        >
          <View style={[S.diffBtn, {
            borderColor: difficulty === key ? color : `${color}44`,
            backgroundColor: difficulty === key ? `${color}18` : 'transparent',
          }]}>
            <Ionicons name={icon} size={18} color={color} />
            <Text style={[S.diffTxt, { color: difficulty === key ? color : `${color}99` }]}>{label}</Text>
          </View>
        </TouchableOpacity>
      ))}
    </View>
  );

  // ── Join by code mode ─────────────────────────────────────────────────────
  if (mode === 'join') {
    const handleJoin = async () => {
      const code = joinCode.trim().toUpperCase();
      if (code.length < 4) { setError('أدخل رمز الغرفة'); return; }
      setError(null);
      setBusy(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const res = await joinRoom(code);
      setBusy(false);
      if (!res.ok) setError(res.error ?? 'رمز غير صحيح');
    };

    return (
      <View style={[S.root, { backgroundColor: colors.background }]}>
        <LinearGradient colors={['#0D0025', '#050510', '#000D1A']} style={StyleSheet.absoluteFill} />
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={[S.center, { paddingTop: topPad + 16, paddingBottom: botPad + 24 }]}>
            <View style={S.header}>
              <TouchableOpacity onPress={() => { setMode('menu'); setError(null); }} style={[S.backBtn, { borderColor: colors.border }]}>
                <Ionicons name="arrow-forward" size={20} color={colors.mutedForeground} />
              </TouchableOpacity>
              <Text style={[S.headerTitle, { color: '#7B2FFF' }]}>انضم برمز</Text>
              <View style={{ width: 40 }} />
            </View>

            <Ionicons name="key" size={64} color="#7B2FFF" style={{ marginVertical: 12 }} />
            <Text style={[S.subLabel, { color: colors.mutedForeground }]}>أدخل رمز الغرفة المكوّن من 4 أحرف</Text>

            <TextInput
              style={[S.codeInput, { color: '#7B2FFF', borderColor: '#7B2FFF', backgroundColor: 'rgba(123,47,255,0.08)' }]}
              placeholder="XXXX"
              placeholderTextColor="rgba(123,47,255,0.4)"
              value={joinCode}
              onChangeText={(t) => setJoinCode(t.toUpperCase())}
              maxLength={6}
              autoCapitalize="characters"
              autoCorrect={false}
              textAlign="center"
            />

            {error && (
              <View style={S.errorRow}>
                <Ionicons name="alert-circle" size={15} color="#FF3B3B" />
                <Text style={S.errorTxt}>{error}</Text>
              </View>
            )}

            <TouchableOpacity onPress={handleJoin} activeOpacity={0.85} disabled={busy} style={{ width: '100%' }}>
              <LinearGradient colors={busy ? ['#333', '#222'] : ['#7B2FFF', '#5A1FCC']} style={S.bigBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                {busy
                  ? <ActivityIndicator color="#FFF" />
                  : <Text style={S.bigBtnTxt}>انضم إلى الغرفة</Text>}
              </LinearGradient>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // ── Main menu ─────────────────────────────────────────────────────────────
  const handleCreate = async () => {
    setError(null);
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const res = await createRoom(difficulty);
    setBusy(false);
    if (!res.ok) setError(res.error ?? 'فشل إنشاء الغرفة');
  };

  const handleQuickMatch = async () => {
    setError(null);
    setBusy(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const res = await joinMatchmaking(difficulty);
    setBusy(false);
    if (!res.ok) setError(res.error ?? 'فشل البحث');
    // If ok + not matched: matchmaking=true → useEffect will navigate
  };

  return (
    <View style={[S.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={['#0D0025', '#050510', '#000D1A']} style={StyleSheet.absoluteFill} />
      <View style={S.glowPurple} />

      <ScrollView contentContainerStyle={[S.center, { paddingTop: topPad + 8, paddingBottom: botPad + 24 }]}>
        {/* Header */}
        <View style={S.header}>
          <TouchableOpacity onPress={() => router.back()} style={[S.backBtn, { borderColor: colors.border }]}>
            <Ionicons name="arrow-forward" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
          <View>
            <Text style={[S.headerTag, { color: colors.mutedForeground }]}>تنافس مع اللاعبين</Text>
            <Text style={[S.headerTitle, { color: '#7B2FFF' }]}>أونلاين</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Profile badge */}
        <View style={[S.profileBadge, { borderColor: '#7B2FFF', backgroundColor: 'rgba(123,47,255,0.1)' }]}>
          <Text style={[S.profileAvatar, { fontSize: 28 }]}>{user.avatar}</Text>
          <View>
            <Text style={[S.profileName, { color: colors.foreground }]}>{user.username}</Text>
            <Text style={[S.profileId, { color: colors.mutedForeground }]}>#{user.uniqueId}</Text>
          </View>
          <View style={[S.onlineDot, { backgroundColor: state.connected ? '#00C853' : '#FF3B3B' }]} />
        </View>

        {/* Connection status */}
        {!state.connected && (
          <View style={[S.errorRow, { borderColor: '#FF3B3B55', borderWidth: 1, borderRadius: 10, padding: 10 }]}>
            <ActivityIndicator size="small" color="#FFD700" />
            <Text style={[S.errorTxt, { color: '#FFD700' }]}>جارٍ الاتصال...</Text>
          </View>
        )}

        {/* Difficulty */}
        <View style={{ width: '100%', gap: 8 }}>
          <Text style={[S.sectionLabel, { color: colors.mutedForeground }]}>مستوى الأسئلة</Text>
          <DiffRow />
        </View>

        {error && (
          <View style={S.errorRow}>
            <Ionicons name="alert-circle" size={15} color="#FF3B3B" />
            <Text style={S.errorTxt}>{error}</Text>
          </View>
        )}

        {/* Action buttons */}
        <TouchableOpacity onPress={handleCreate} activeOpacity={0.85} disabled={busy || !state.connected} style={{ width: '100%' }}>
          <LinearGradient
            colors={(busy || !state.connected) ? ['#333', '#222'] : ['#7B2FFF', '#5A1FCC']}
            style={S.bigBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            {busy
              ? <ActivityIndicator color="#FFF" />
              : <>
                  <Ionicons name="add-circle" size={22} color="#FFF" />
                  <Text style={S.bigBtnTxt}>إنشاء غرفة</Text>
                </>}
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity onPress={handleQuickMatch} activeOpacity={0.85} disabled={busy || !state.connected} style={{ width: '100%' }}>
          <LinearGradient
            colors={(busy || !state.connected) ? ['#333', '#222'] : ['#FFD700', '#FFA500']}
            style={S.bigBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            {busy
              ? <ActivityIndicator color="#050510" />
              : <>
                  <Ionicons name="flash" size={22} color="#050510" />
                  <Text style={[S.bigBtnTxt, { color: '#050510' }]}>بحث سريع عن خصم</Text>
                </>}
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => { Haptics.selectionAsync(); setMode('join'); setError(null); }}
          activeOpacity={0.85}
          disabled={!state.connected}
          style={{ width: '100%' }}
        >
          <View style={[S.outlineBtn, { borderColor: state.connected ? '#7B2FFF' : '#333' }]}>
            <Ionicons name="key" size={20} color={state.connected ? '#7B2FFF' : '#555'} />
            <Text style={[S.outlineBtnTxt, { color: state.connected ? '#7B2FFF' : '#555' }]}>انضم برمز الغرفة</Text>
          </View>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1 },
  glowPurple: { position: 'absolute', top: '10%', alignSelf: 'center', width: 280, height: 280, borderRadius: 140, backgroundColor: '#7B2FFF', opacity: 0.06 },
  center: { paddingHorizontal: 22, gap: 16, alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' },
  headerTag: { fontSize: 11, fontFamily: 'Inter_500Medium', letterSpacing: 1.5, textAlign: 'center' },
  headerTitle: { fontSize: 26, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  backBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  profileBadge: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 18, borderWidth: 1.5, paddingVertical: 14, paddingHorizontal: 18, width: '100%' },
  profileAvatar: { textAlign: 'center' },
  profileName: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  profileId: { fontSize: 12, fontFamily: 'Inter_500Medium' },
  onlineDot: { width: 10, height: 10, borderRadius: 5, marginLeft: 'auto' },
  sectionLabel: { fontSize: 12, fontFamily: 'Inter_500Medium', letterSpacing: 1.5 },
  diffRow: { flexDirection: 'row', gap: 8 },
  diffBtn: { borderRadius: 14, borderWidth: 1.5, paddingVertical: 12, alignItems: 'center', gap: 6 },
  diffTxt: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  bigBtn: { paddingVertical: 18, borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  bigBtnTxt: { fontSize: 18, fontFamily: 'Inter_700Bold', color: '#FFF' },
  outlineBtn: { paddingVertical: 16, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderWidth: 1.5 },
  outlineBtnTxt: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  errorTxt: { fontSize: 13, fontFamily: 'Inter_600SemiBold', color: '#FF3B3B' },
  subLabel: { fontSize: 14, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  codeInput: { fontSize: 36, fontFamily: 'Inter_700Bold', borderWidth: 2, borderRadius: 18, paddingVertical: 18, paddingHorizontal: 24, width: '100%', textAlign: 'center', letterSpacing: 10 },
  emptyTitle: { fontSize: 20, fontFamily: 'Inter_700Bold', textAlign: 'center', marginTop: 16, marginBottom: 8 },
  backTxt: { fontSize: 14, fontFamily: 'Inter_500Medium' },
});
