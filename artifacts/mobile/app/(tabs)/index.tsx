import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  Platform, ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useGame, Difficulty } from '@/contexts/GameContext';
import { useMultiplayer, PLAYER_COLORS, PLAYER_DEFAULTS } from '@/contexts/MultiplayerContext';
import { useAuth } from '@/contexts/AuthContext';
import { MaterialCommunityIcons, Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSounds } from '@/hooks/useSounds';

const ROUNDS = [
  { n: '١', label: 'ماذا تعرف', color: '#7B2FFF' },
  { n: '٢', label: 'المزاد', color: '#FFD700' },
  { n: '٣', label: 'الجرس', color: '#FF6B00' },
  { n: '٤', label: 'تحدي الثلاثين', color: '#FF3B3B' },
  { n: '٥', label: 'خمّن اللاعب', color: '#00E5FF' },
];

const MP_ROUNDS = [
  { n: '١', label: 'ماذا تعرف', color: '#7B2FFF' },
  { n: '٢', label: 'المزاد', color: '#FFD700' },
  { n: '٣', label: 'الجرس', color: '#FF6B00' },
  { n: '٥', label: 'خمّن اللاعب', color: '#00E5FF' },
];

const DIFFICULTIES: { key: Difficulty; label: string; sub: string; color: string; icon: string }[] = [
  { key: 'easy',   label: 'سهل',    sub: 'أسئلة خفيفة ومسلية',     color: '#00C853', icon: 'star-outline' },
  { key: 'medium', label: 'متوسط',  sub: 'التوازن المثالي للعب',    color: '#FFD700', icon: 'star-half' },
  { key: 'hard',   label: 'صعب',    sub: 'للمتخصصين فقط!',         color: '#FF3B3B', icon: 'star' },
];

type GameMode = '1v1' | 'party';
type Step = 'mode' | 'names' | 'difficulty' | 'mp-names' | 'mp-difficulty';

const MIN_PLAYERS = 2;
const MAX_PLAYERS = 5;

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { startGame }             = useGame();
  const { startMultiplayerGame, state: mpState } = useMultiplayer();
  const { user }                  = useAuth();
  const { playClick }             = useSounds(false);

  const [step, setStep]           = useState<Step>('mode');
  const [mode, setMode]           = useState<GameMode>('1v1');

  // 1v1 state
  const [player1, setPlayer1]     = useState('');
  const [player2, setPlayer2]     = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');

  // Party state
  const [playerCount, setPlayerCount] = useState(2);
  const [partyNames, setPartyNames]   = useState<string[]>(['', '', '', '', '']);
  const [mpDifficulty, setMpDifficulty] = useState<Difficulty>('medium');

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const handleSelectMode = (m: GameMode) => {
    playClick();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMode(m);
    setStep(m === '1v1' ? 'names' : 'mp-names');
  };

  // ── 1v1 handlers ──────────────────────────────────────────────────────────
  const handleNext = () => {
    playClick();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStep('difficulty');
  };

  const handleStart = () => {
    playClick();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    startGame(player1.trim() || 'اللاعب ١', player2.trim() || 'اللاعب ٢', difficulty);
    router.push('/game');
  };

  // ── Party handlers ────────────────────────────────────────────────────────
  const handleMpNext = () => {
    playClick();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setStep('mp-difficulty');
  };

  const handleMpStart = () => {
    playClick();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    const players = partyNames.slice(0, playerCount).map((n, i) => n.trim() || PLAYER_DEFAULTS[i]);
    startMultiplayerGame(players, mpDifficulty);
    router.push('/mp-game');
  };

  const handleLeaderboard = () => {
    playClick();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/leaderboard');
  };

  const handleAccount = () => {
    playClick();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(user ? '/friends' : '/auth-login');
  };

  const handleProfile = () => {
    playClick();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(user ? '/profile' : '/auth-login');
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={[S.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={['#0D0025', '#050510', '#000D1A']} style={StyleSheet.absoluteFill} />
      <View style={[S.glowPurple, { top: topPad + 20 }]} />
      <View style={S.glowCyan} />

      <ScrollView
        contentContainerStyle={[S.content, { paddingTop: topPad + 24, paddingBottom: botPad + 30 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View style={S.logo}>
          <View style={S.numBadge}>
            <Text style={[S.numText, { color: colors.primary }]}>٣٠</Text>
          </View>
          <Text style={[S.title, { color: colors.foreground }]}>تحدي الثلاثين</Text>
          <Text style={[S.subtitle, { color: colors.accent }]}>بطولة الفوازير الرياضية</Text>
        </View>

        <View style={S.topBtnRow}>
          <TouchableOpacity onPress={handleLeaderboard} activeOpacity={0.85} style={{ flex: 1 }}>
            <View style={[S.leaderboardBtn, { borderColor: '#FFD700' }]}>
              <MaterialCommunityIcons name="crown" size={20} color="#FFD700" />
              <Text style={[S.leaderboardBtnTxt, { color: '#FFD700' }]}>لوحة الصدارة</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleAccount} activeOpacity={0.85} style={{ flex: 1 }}>
            <View style={[S.leaderboardBtn, { borderColor: '#7B2FFF' }]}>
              <MaterialCommunityIcons name={user ? 'account-group' : 'account-circle-outline'} size={20} color="#7B2FFF" />
              <Text style={[S.leaderboardBtnTxt, { color: '#7B2FFF' }]} numberOfLines={1}>
                {user ? user.username : 'تسجيل الدخول'}
              </Text>
            </View>
          </TouchableOpacity>
          {user && (
            <TouchableOpacity onPress={handleProfile} activeOpacity={0.85}>
              <View style={[S.leaderboardBtn, S.profileBtn, { borderColor: '#FFD700' }]}>
                <Ionicons name="person-circle-outline" size={22} color="#FFD700" />
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Step: mode ─────────────────────────────────────────────────── */}
        {step === 'mode' && (
          <>
            <View style={[S.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[S.cardLabel, { color: colors.mutedForeground }]}>اختر وضع اللعب</Text>

              {/* 1v1 mode */}
              <TouchableOpacity onPress={() => handleSelectMode('1v1')} activeOpacity={0.85}>
                <LinearGradient
                  colors={['#7B2FFF', '#5B1FDF']}
                  style={S.modeCard}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                >
                  <View style={S.modeIconRow}>
                    <MaterialCommunityIcons name="sword-cross" size={36} color="#FFF" />
                  </View>
                  <View style={S.modeTexts}>
                    <Text style={S.modeTitle}>١ ضد ١</Text>
                    <Text style={S.modeSub}>لاعبان — ٥ جولات — المنافسة الكلاسيكية</Text>
                  </View>
                  <Ionicons name="arrow-back" size={20} color="rgba(255,255,255,0.7)" />
                </LinearGradient>
              </TouchableOpacity>

              {/* Party mode */}
              <TouchableOpacity onPress={() => handleSelectMode('party')} activeOpacity={0.85}>
                <LinearGradient
                  colors={['#FFD700', '#FFA500']}
                  style={S.modeCard}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                >
                  <View style={S.modeIconRow}>
                    <MaterialCommunityIcons name="account-group" size={36} color="#050510" />
                  </View>
                  <View style={S.modeTexts}>
                    <Text style={[S.modeTitle, { color: '#050510' }]}>لعب جماعي</Text>
                    <Text style={[S.modeSub, { color: '#050510CC' }]}>٢–٥ لاعبين — ٤ جولات — مزاد وجرس وأكثر</Text>
                  </View>
                  <Ionicons name="arrow-back" size={20} color="rgba(0,0,0,0.5)" />
                </LinearGradient>
              </TouchableOpacity>

              {/* Online mode */}
              <TouchableOpacity
                onPress={() => {
                  playClick();
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                  router.push('/online-lobby');
                }}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={['#00C853', '#009624']}
                  style={S.modeCard}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
                >
                  <View style={S.modeIconRow}>
                    <Ionicons name="wifi" size={36} color="#FFF" />
                  </View>
                  <View style={S.modeTexts}>
                    <Text style={S.modeTitle}>🌐 أونلاين</Text>
                    <Text style={S.modeSub}>تحدّ لاعبين من كل مكان — ٥ جولات حقيقية!</Text>
                  </View>
                  <View style={[S.newBadge, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                    <Text style={S.newBadgeTxt}>جديد</Text>
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* Rounds preview */}
            <View style={S.roundsWrap}>
              {ROUNDS.map(r => (
                <View key={r.n} style={[S.roundPill, { borderColor: r.color }]}>
                  <Text style={[S.roundN, { color: r.color }]}>{r.n}</Text>
                  <Text style={[S.roundLabel, { color: colors.foreground }]}>{r.label}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Step: names (1v1) ──────────────────────────────────────────── */}
        {step === 'names' && (
          <>
            <View style={[S.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[S.cardLabel, { color: colors.mutedForeground }]}>أسماء اللاعبين</Text>
              <View style={[S.inputRow, { borderColor: '#7B2FFF' }]}>
                <MaterialCommunityIcons name="account-circle" size={24} color="#7B2FFF" />
                <TextInput
                  value={player1} onChangeText={setPlayer1}
                  placeholder="اللاعب الأول" placeholderTextColor={colors.mutedForeground}
                  style={[S.input, { color: colors.foreground }]}
                  textAlign="right" maxLength={20} returnKeyType="next"
                />
              </View>
              <View style={S.divRow}>
                <View style={[S.divLine, { backgroundColor: colors.border }]} />
                <Text style={[S.divVS, { color: colors.primary }]}>VS</Text>
                <View style={[S.divLine, { backgroundColor: colors.border }]} />
              </View>
              <View style={[S.inputRow, { borderColor: '#00E5FF' }]}>
                <MaterialCommunityIcons name="account-circle" size={24} color="#00E5FF" />
                <TextInput
                  value={player2} onChangeText={setPlayer2}
                  placeholder="اللاعب الثاني" placeholderTextColor={colors.mutedForeground}
                  style={[S.input, { color: colors.foreground }]}
                  textAlign="right" maxLength={20} returnKeyType="done"
                />
              </View>
            </View>

            <View style={S.btnRow}>
              <TouchableOpacity onPress={() => setStep('mode')} activeOpacity={0.85} style={{ flex: 0.35 }}>
                <View style={[S.backBtn, { borderColor: colors.border }]}>
                  <Ionicons name="arrow-forward" size={20} color={colors.mutedForeground} />
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleNext} activeOpacity={0.85} style={{ flex: 1 }}>
                <LinearGradient colors={['#FFD700', '#FFA500']} style={S.startBtn}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  <Text style={S.startBtnText}>التالي — اختر الصعوبة</Text>
                  <Ionicons name="arrow-back" size={22} color="#050510" />
                </LinearGradient>
              </TouchableOpacity>
            </View>

            <View style={S.roundsWrap}>
              {ROUNDS.map(r => (
                <View key={r.n} style={[S.roundPill, { borderColor: r.color }]}>
                  <Text style={[S.roundN, { color: r.color }]}>{r.n}</Text>
                  <Text style={[S.roundLabel, { color: colors.foreground }]}>{r.label}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Step: difficulty (1v1) ──────────────────────────────────────── */}
        {step === 'difficulty' && (
          <>
            <View style={[S.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[S.cardLabel, { color: colors.mutedForeground }]}>اختر مستوى الصعوبة</Text>
              {DIFFICULTIES.map(d => {
                const selected = difficulty === d.key;
                return (
                  <TouchableOpacity
                    key={d.key}
                    onPress={() => { playClick(); setDifficulty(d.key); Haptics.selectionAsync(); }}
                    activeOpacity={0.85}
                  >
                    <View style={[
                      S.diffRow,
                      {
                        borderColor: d.color,
                        backgroundColor: selected ? `${d.color}20` : '#08082A',
                        borderWidth: selected ? 2 : 1,
                      },
                    ]}>
                      <View style={S.diffLeft}>
                        <Ionicons name={d.icon as any} size={22} color={d.color} />
                        {selected && <View style={[S.selectedDot, { backgroundColor: d.color }]} />}
                      </View>
                      <View style={S.diffTexts}>
                        <Text style={[S.diffLabel, { color: d.color }]}>{d.label}</Text>
                        <Text style={[S.diffSub, { color: colors.mutedForeground }]}>{d.sub}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={[S.playersSummary, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={[S.playersSummaryTxt, { color: '#7B2FFF' }]}>{player1.trim() || 'اللاعب ١'}</Text>
              <Text style={[S.vsTxt, { color: colors.mutedForeground }]}>vs</Text>
              <Text style={[S.playersSummaryTxt, { color: '#00E5FF' }]}>{player2.trim() || 'اللاعب ٢'}</Text>
            </View>

            <View style={S.btnRow}>
              <TouchableOpacity onPress={() => { playClick(); setStep('names'); }} activeOpacity={0.85} style={{ flex: 0.35 }}>
                <View style={[S.backBtn, { borderColor: colors.border }]}>
                  <Ionicons name="arrow-forward" size={20} color={colors.mutedForeground} />
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleStart} activeOpacity={0.85} style={{ flex: 1 }}>
                <LinearGradient colors={['#FFD700', '#FFA500']} style={S.startBtn}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  <Ionicons name="play" size={24} color="#050510" />
                  <Text style={S.startBtnText}>ابدأ اللعبة</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── Step: mp-names (party) ─────────────────────────────────────── */}
        {step === 'mp-names' && (
          <>
            {/* Player count selector */}
            <View style={[S.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[S.cardLabel, { color: colors.mutedForeground }]}>عدد اللاعبين</Text>
              <View style={S.countRow}>
                <TouchableOpacity
                  onPress={() => { if (playerCount > MIN_PLAYERS) { setPlayerCount(c => c - 1); Haptics.selectionAsync(); } }}
                  activeOpacity={0.8}
                  disabled={playerCount <= MIN_PLAYERS}
                >
                  <View style={[S.countBtn, { borderColor: playerCount <= MIN_PLAYERS ? '#333' : '#FFD700', opacity: playerCount <= MIN_PLAYERS ? 0.35 : 1 }]}>
                    <Text style={[S.countBtnTxt, { color: '#FFD700' }]}>−</Text>
                  </View>
                </TouchableOpacity>
                <Text style={[S.countNum, { color: '#FFD700' }]}>{playerCount}</Text>
                <TouchableOpacity
                  onPress={() => { if (playerCount < MAX_PLAYERS) { setPlayerCount(c => c + 1); Haptics.selectionAsync(); } }}
                  activeOpacity={0.8}
                  disabled={playerCount >= MAX_PLAYERS}
                >
                  <View style={[S.countBtn, { borderColor: playerCount >= MAX_PLAYERS ? '#333' : '#FFD700', opacity: playerCount >= MAX_PLAYERS ? 0.35 : 1 }]}>
                    <Text style={[S.countBtnTxt, { color: '#FFD700' }]}>+</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>

            {/* Player name inputs */}
            <View style={[S.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[S.cardLabel, { color: colors.mutedForeground }]}>أسماء اللاعبين</Text>
              {Array.from({ length: playerCount }).map((_, i) => {
                const pc = PLAYER_COLORS[i] ?? '#FFD700';
                return (
                  <View key={i} style={[S.inputRow, { borderColor: pc }]}>
                    <View style={[S.playerDot, { backgroundColor: pc }]} />
                    <TextInput
                      value={partyNames[i]}
                      onChangeText={txt => {
                        const updated = [...partyNames];
                        updated[i] = txt;
                        setPartyNames(updated);
                      }}
                      placeholder={PLAYER_DEFAULTS[i]}
                      placeholderTextColor={colors.mutedForeground}
                      style={[S.input, { color: colors.foreground }]}
                      textAlign="right"
                      maxLength={20}
                      returnKeyType="next"
                    />
                  </View>
                );
              })}
            </View>

            {/* Round preview for party */}
            <View style={S.roundsWrap}>
              {MP_ROUNDS.map(r => (
                <View key={r.n} style={[S.roundPill, { borderColor: r.color }]}>
                  <Text style={[S.roundN, { color: r.color }]}>{r.n}</Text>
                  <Text style={[S.roundLabel, { color: colors.foreground }]}>{r.label}</Text>
                </View>
              ))}
            </View>

            <View style={S.btnRow}>
              <TouchableOpacity onPress={() => setStep('mode')} activeOpacity={0.85} style={{ flex: 0.35 }}>
                <View style={[S.backBtn, { borderColor: colors.border }]}>
                  <Ionicons name="arrow-forward" size={20} color={colors.mutedForeground} />
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleMpNext} activeOpacity={0.85} style={{ flex: 1 }}>
                <LinearGradient colors={['#FFD700', '#FFA500']} style={S.startBtn}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  <Text style={S.startBtnText}>التالي — الصعوبة</Text>
                  <Ionicons name="arrow-back" size={22} color="#050510" />
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── Step: mp-difficulty (party) ────────────────────────────────── */}
        {step === 'mp-difficulty' && (
          <>
            <View style={[S.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[S.cardLabel, { color: colors.mutedForeground }]}>اختر مستوى الصعوبة</Text>
              {DIFFICULTIES.map(d => {
                const selected = mpDifficulty === d.key;
                return (
                  <TouchableOpacity
                    key={d.key}
                    onPress={() => { playClick(); setMpDifficulty(d.key); Haptics.selectionAsync(); }}
                    activeOpacity={0.85}
                  >
                    <View style={[
                      S.diffRow,
                      {
                        borderColor: d.color,
                        backgroundColor: selected ? `${d.color}20` : '#08082A',
                        borderWidth: selected ? 2 : 1,
                      },
                    ]}>
                      <View style={S.diffLeft}>
                        <Ionicons name={d.icon as any} size={22} color={d.color} />
                        {selected && <View style={[S.selectedDot, { backgroundColor: d.color }]} />}
                      </View>
                      <View style={S.diffTexts}>
                        <Text style={[S.diffLabel, { color: d.color }]}>{d.label}</Text>
                        <Text style={[S.diffSub, { color: colors.mutedForeground }]}>{d.sub}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Players summary */}
            <View style={[S.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[S.cardLabel, { color: colors.mutedForeground }]}>اللاعبون</Text>
              <View style={S.mpPlayersSummary}>
                {Array.from({ length: playerCount }).map((_, i) => {
                  const pc = PLAYER_COLORS[i] ?? '#FFD700';
                  const name = partyNames[i].trim() || PLAYER_DEFAULTS[i];
                  return (
                    <View key={i} style={[S.mpPlayerChip, { borderColor: pc, backgroundColor: `${pc}15` }]}>
                      <View style={[S.playerDot, { backgroundColor: pc }]} />
                      <Text style={[S.mpPlayerName, { color: pc }]}>{name}</Text>
                    </View>
                  );
                })}
              </View>
            </View>

            <View style={S.btnRow}>
              <TouchableOpacity onPress={() => setStep('mp-names')} activeOpacity={0.85} style={{ flex: 0.35 }}>
                <View style={[S.backBtn, { borderColor: colors.border }]}>
                  <Ionicons name="arrow-forward" size={20} color={colors.mutedForeground} />
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleMpStart} activeOpacity={0.85} style={{ flex: 1 }}>
                <LinearGradient colors={['#FFD700', '#FFA500']} style={S.startBtn}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  <MaterialCommunityIcons name="account-group" size={22} color="#050510" />
                  <Text style={S.startBtnText}>ابدأ اللعبة الجماعية</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1 },
  glowPurple: {
    position: 'absolute', left: '25%',
    width: 200, height: 200, borderRadius: 100,
    backgroundColor: '#7B2FFF', opacity: 0.15,
  },
  glowCyan: {
    position: 'absolute', bottom: '15%', right: '5%',
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: '#00E5FF', opacity: 0.09,
  },
  content: { paddingHorizontal: 22, gap: 24 },
  logo: { alignItems: 'center', gap: 10 },
  numBadge: {
    width: 104, height: 104, borderRadius: 52, borderWidth: 3, borderColor: '#FFD700',
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,215,0,0.08)',
    shadowColor: '#FFD700', shadowOpacity: 0.7, shadowRadius: 28, shadowOffset: { width: 0, height: 0 }, elevation: 20,
  },
  numText: { fontSize: 54, fontFamily: 'Inter_700Bold', lineHeight: 62 },
  title: { fontSize: 30, fontFamily: 'Inter_700Bold', textAlign: 'center', letterSpacing: 1 },
  subtitle: { fontSize: 14, fontFamily: 'Inter_500Medium', textAlign: 'center', letterSpacing: 2 },
  card: { borderRadius: 20, borderWidth: 1, padding: 20, gap: 14 },
  cardLabel: { fontSize: 12, fontFamily: 'Inter_500Medium', textAlign: 'center', letterSpacing: 1.5 },
  modeCard: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 18, borderRadius: 16,
  },
  modeIconRow: { width: 44, alignItems: 'center' },
  modeTexts: { flex: 1, alignItems: 'flex-end', gap: 3 },
  modeTitle: { fontSize: 22, fontFamily: 'Inter_700Bold', color: '#FFF' },
  modeSub: { fontSize: 11, fontFamily: 'Inter_400Regular', color: 'rgba(255,255,255,0.75)', textAlign: 'right' },
  inputRow: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, backgroundColor: '#08082A',
  },
  input: { flex: 1, fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  playerDot: { width: 10, height: 10, borderRadius: 5 },
  divRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  divLine: { flex: 1, height: 1 },
  divVS: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 4 },
  countRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24 },
  countBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  countBtnTxt: { fontSize: 26, fontFamily: 'Inter_700Bold', lineHeight: 30 },
  countNum: { fontSize: 54, fontFamily: 'Inter_700Bold', minWidth: 60, textAlign: 'center' },
  diffRow: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 14,
    paddingHorizontal: 16, paddingVertical: 14, borderRadius: 16,
  },
  diffLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  selectedDot: { width: 8, height: 8, borderRadius: 4 },
  diffTexts: { flex: 1, alignItems: 'flex-end', gap: 2 },
  diffLabel: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  diffSub: { fontSize: 12, fontFamily: 'Inter_400Regular' },
  playersSummary: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    borderRadius: 16, borderWidth: 1, paddingVertical: 14, paddingHorizontal: 20,
  },
  playersSummaryTxt: { fontSize: 18, fontFamily: 'Inter_700Bold' },
  vsTxt: { fontSize: 12, fontFamily: 'Inter_500Medium', letterSpacing: 2 },
  mpPlayersSummary: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center' },
  mpPlayerChip: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, borderWidth: 1.5, paddingVertical: 8, paddingHorizontal: 12 },
  mpPlayerName: { fontSize: 14, fontFamily: 'Inter_700Bold' },
  newBadge: { borderRadius: 8, paddingVertical: 4, paddingHorizontal: 8 },
  newBadgeTxt: { fontSize: 10, fontFamily: 'Inter_700Bold', color: '#FFF', letterSpacing: 1 },
  btnRow: { flexDirection: 'row', gap: 12 },
  backBtn: {
    height: 58, borderRadius: 18, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 12, paddingVertical: 18, borderRadius: 20,
    shadowColor: '#FFD700', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55, shadowRadius: 24, elevation: 16,
  },
  startBtnText: { fontSize: 20, fontFamily: 'Inter_700Bold', color: '#050510' },
  roundsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  roundPill: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 9, paddingHorizontal: 14, borderRadius: 24, borderWidth: 1.5,
  },
  roundN: { fontSize: 16, fontFamily: 'Inter_700Bold' },
  roundLabel: { fontSize: 13, fontFamily: 'Inter_600SemiBold' },
  topBtnRow: { flexDirection: 'row', gap: 10 },
  leaderboardBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 14, borderWidth: 1.5, paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: 'rgba(255,215,0,0.06)',
  },
  leaderboardBtnTxt: { fontSize: 13, fontFamily: 'Inter_700Bold' },
  profileBtn: { width: 44, paddingHorizontal: 0 },
});
