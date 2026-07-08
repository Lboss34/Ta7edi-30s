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

const DIFFICULTIES: { key: Difficulty; label: string; sub: string; color: string; icon: string }[] = [
  { key: 'easy',   label: 'سهل',    sub: 'أسئلة خفيفة ومسلية',     color: '#00C853', icon: 'star-outline' },
  { key: 'medium', label: 'متوسط',  sub: 'التوازن المثالي للعب',    color: '#FFD700', icon: 'star-half' },
  { key: 'hard',   label: 'صعب',    sub: 'للمتخصصين فقط!',         color: '#FF3B3B', icon: 'star' },
];

type Step = 'names' | 'difficulty';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { startGame } = useGame();
  const { playClick } = useSounds(false);

  const [step, setStep]       = useState<Step>('names');
  const [player1, setPlayer1] = useState('');
  const [player2, setPlayer2] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

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

  const handleLeaderboard = () => {
    playClick();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/leaderboard');
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={['#0D0025', '#050510', '#000D1A']} style={StyleSheet.absoluteFill} />
      <View style={[styles.glowPurple, { top: topPad + 20 }]} />
      <View style={styles.glowCyan} />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topPad + 24, paddingBottom: botPad + 30 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View style={styles.logo}>
          <View style={styles.numBadge}>
            <Text style={[styles.numText, { color: colors.primary }]}>٣٠</Text>
          </View>
          <Text style={[styles.title, { color: colors.foreground }]}>تحدي الثلاثين</Text>
          <Text style={[styles.subtitle, { color: colors.accent }]}>بطولة الفوازير الرياضية</Text>
        </View>

        <TouchableOpacity onPress={handleLeaderboard} activeOpacity={0.85}>
          <View style={[styles.leaderboardBtn, { borderColor: '#FFD700' }]}>
            <MaterialCommunityIcons name="crown" size={20} color="#FFD700" />
            <Text style={[styles.leaderboardBtnTxt, { color: '#FFD700' }]}>لوحة الصدارة — ملك العرش</Text>
          </View>
        </TouchableOpacity>

        {step === 'names' ? (
          <>
            {/* Player name inputs */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>أسماء اللاعبين</Text>
              <View style={[styles.inputRow, { borderColor: '#7B2FFF' }]}>
                <MaterialCommunityIcons name="account-circle" size={24} color="#7B2FFF" />
                <TextInput
                  value={player1} onChangeText={setPlayer1}
                  placeholder="اللاعب الأول" placeholderTextColor={colors.mutedForeground}
                  style={[styles.input, { color: colors.foreground }]}
                  textAlign="right" maxLength={20} returnKeyType="next"
                />
              </View>
              <View style={styles.divRow}>
                <View style={[styles.divLine, { backgroundColor: colors.border }]} />
                <Text style={[styles.divVS, { color: colors.primary }]}>VS</Text>
                <View style={[styles.divLine, { backgroundColor: colors.border }]} />
              </View>
              <View style={[styles.inputRow, { borderColor: '#00E5FF' }]}>
                <MaterialCommunityIcons name="account-circle" size={24} color="#00E5FF" />
                <TextInput
                  value={player2} onChangeText={setPlayer2}
                  placeholder="اللاعب الثاني" placeholderTextColor={colors.mutedForeground}
                  style={[styles.input, { color: colors.foreground }]}
                  textAlign="right" maxLength={20} returnKeyType="done"
                />
              </View>
            </View>

            {/* Next button */}
            <TouchableOpacity onPress={handleNext} activeOpacity={0.85}>
              <LinearGradient colors={['#FFD700', '#FFA500']} style={styles.startBtn}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                <Text style={styles.startBtnText}>التالي — اختر الصعوبة</Text>
                <Ionicons name="arrow-back" size={22} color="#050510" />
              </LinearGradient>
            </TouchableOpacity>

            {/* Rounds preview */}
            <View style={styles.roundsWrap}>
              {ROUNDS.map(r => (
                <View key={r.n} style={[styles.roundPill, { borderColor: r.color }]}>
                  <Text style={[styles.roundN, { color: r.color }]}>{r.n}</Text>
                  <Text style={[styles.roundLabel, { color: colors.foreground }]}>{r.label}</Text>
                </View>
              ))}
            </View>
          </>
        ) : (
          <>
            {/* Difficulty selection */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.cardLabel, { color: colors.mutedForeground }]}>اختر مستوى الصعوبة</Text>
              {DIFFICULTIES.map(d => {
                const selected = difficulty === d.key;
                return (
                  <TouchableOpacity
                    key={d.key}
                    onPress={() => { playClick(); setDifficulty(d.key); Haptics.selectionAsync(); }}
                    activeOpacity={0.85}
                  >
                    <View style={[
                      styles.diffRow,
                      {
                        borderColor: d.color,
                        backgroundColor: selected ? `${d.color}20` : '#08082A',
                        borderWidth: selected ? 2 : 1,
                      },
                    ]}>
                      <View style={styles.diffLeft}>
                        <Ionicons name={d.icon as any} size={22} color={d.color} />
                        {selected && (
                          <View style={[styles.selectedDot, { backgroundColor: d.color }]} />
                        )}
                      </View>
                      <View style={styles.diffTexts}>
                        <Text style={[styles.diffLabel, { color: d.color }]}>{d.label}</Text>
                        <Text style={[styles.diffSub, { color: colors.mutedForeground }]}>{d.sub}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Players summary */}
            <View style={[styles.playersSummary, { borderColor: colors.border, backgroundColor: colors.card }]}>
              <Text style={[styles.playersSummaryTxt, { color: '#7B2FFF' }]}>
                {player1.trim() || 'اللاعب ١'}
              </Text>
              <Text style={[styles.vsTxt, { color: colors.mutedForeground }]}>vs</Text>
              <Text style={[styles.playersSummaryTxt, { color: '#00E5FF' }]}>
                {player2.trim() || 'اللاعب ٢'}
              </Text>
            </View>

            <View style={styles.btnRow}>
              <TouchableOpacity onPress={() => { playClick(); setStep('names'); }} activeOpacity={0.85} style={{ flex: 0.35 }}>
                <View style={[styles.backBtn, { borderColor: colors.border }]}>
                  <Ionicons name="arrow-forward" size={20} color={colors.mutedForeground} />
                </View>
              </TouchableOpacity>
              <TouchableOpacity onPress={handleStart} activeOpacity={0.85} style={{ flex: 1 }}>
                <LinearGradient colors={['#FFD700', '#FFA500']} style={styles.startBtn}
                  start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
                  <Ionicons name="play" size={24} color="#050510" />
                  <Text style={styles.startBtnText}>ابدأ اللعبة</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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
  inputRow: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, backgroundColor: '#08082A',
  },
  input: { flex: 1, fontSize: 18, fontFamily: 'Inter_600SemiBold' },
  divRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  divLine: { flex: 1, height: 1 },
  divVS: { fontSize: 13, fontFamily: 'Inter_700Bold', letterSpacing: 4 },
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
  leaderboardBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 14, borderWidth: 1.5, paddingVertical: 10, paddingHorizontal: 16,
    backgroundColor: 'rgba(255,215,0,0.06)', alignSelf: 'center',
  },
  leaderboardBtnTxt: { fontSize: 13, fontFamily: 'Inter_700Bold' },
});
