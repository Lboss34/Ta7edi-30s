import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useGame } from '@/contexts/GameContext';
import { ScoreBoard } from '@/components/ScoreBoard';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSounds } from '@/hooks/useSounds';

const ROUNDS = [
  { num: 1, title: 'ماذا تعرف',      desc: '٤ أسئلة رياضية لكل لاعب\nنقطة لكل إجابة صحيحة',           color: '#7B2FFF', route: '/round1' as const },
  { num: 2, title: 'المزاد',          desc: '٣ مسابقات مزايدة\nكلما زاد رهانك زادت نقاطك',              color: '#FFD700', route: '/round2' as const },
  { num: 3, title: 'الجرس',           desc: 'من يضغط الجرس أولًا يجيب\nسؤال محروق إذا أخطأ الاثنان',   color: '#FF6B00', route: '/round3' as const },
  { num: 4, title: 'تحدي الثلاثين',  desc: '٣٠ ثانية من الأسئلة المتلاحقة\nالخطأ ينقص والصواب يضيف',   color: '#FF3B3B', route: '/round4' as const },
  { num: 5, title: 'خمّن اللاعب',     desc: 'مسيرة انتقالات — من اللاعب؟\nالأسرع في الصياح يحصد النقطة', color: '#00E5FF', route: '/round5' as const },
];

export default function GameHub() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { state, toggleMute } = useGame();
  const { playClick } = useSounds(state.isMuted);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const isOver   = state.currentRound > 5;
  const roundIdx = Math.min(state.currentRound - 1, 4);
  const info     = ROUNDS[roundIdx];

  const handleAction = () => {
    playClick();
    if (isOver) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push('/results');
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      router.push(info.route);
    }
  };

  const handleToggleMute = () => {
    playClick();
    toggleMute();
  };

  // CTA text color: dark bg on bright (gold, orange, cyan), white on dark (purple, red)
  const ctaTextDark = isOver || info.num === 2 || info.num === 3 || info.num === 5;

  // ── Loading state ──────────────────────────────────────────────────────────
  if (state.isLoading) {
    return (
      <View style={[styles.root, styles.centered, { backgroundColor: colors.background }]}>
        <LinearGradient colors={['#050510', '#08082A', '#050510']} style={StyleSheet.absoluteFill} />
        <ActivityIndicator size="large" color="#FFD700" />
        <Text style={[styles.loadText, { color: colors.mutedForeground }]}>جاري تحميل الأسئلة…</Text>
      </View>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (state.loadError) {
    return (
      <View style={[styles.root, styles.centered, { backgroundColor: colors.background }]}>
        <LinearGradient colors={['#050510', '#08082A', '#050510']} style={StyleSheet.absoluteFill} />
        <Ionicons name="cloud-offline-outline" size={52} color="#FF3B3B" />
        <Text style={[styles.errorTitle, { color: '#FF3B3B' }]}>تعذّر تحميل الأسئلة</Text>
        <Text style={[styles.errorMsg, { color: colors.mutedForeground }]}>{state.loadError}</Text>
        <TouchableOpacity onPress={() => router.replace('/')} activeOpacity={0.8}>
          <LinearGradient colors={['#FFD700', '#FFA500']} style={styles.backBtn}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <Ionicons name="arrow-forward" size={20} color="#050510" />
            <Text style={styles.backBtnText}>العودة للرئيسية</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={['#050510', '#08082A', '#050510']} style={StyleSheet.absoluteFill} />

      <View style={[styles.content, { paddingTop: topPad + 16, paddingBottom: botPad + 24 }]}>
        <View style={styles.topBar}>
          <Text style={[styles.header, { color: colors.mutedForeground }]}>تحدي الثلاثين</Text>
          <TouchableOpacity onPress={handleToggleMute} activeOpacity={0.7}>
            <Ionicons
              name={state.isMuted ? 'volume-mute' : 'volume-high'}
              size={20}
              color={state.isMuted ? '#555' : colors.mutedForeground}
            />
          </TouchableOpacity>
        </View>

        <ScoreBoard
          players={state.players}
          scores={state.scores}
          currentRound={Math.min(state.currentRound, 5)}
        />

        {/* Progress dots */}
        <View style={styles.dots}>
          {ROUNDS.map(r => (
            <View
              key={r.num}
              style={[
                styles.dot,
                {
                  backgroundColor: r.num <= state.currentRound ? r.color : colors.border,
                  opacity: r.num <= state.currentRound ? 1 : 0.35,
                  width: r.num === state.currentRound && !isOver ? 36 : 12,
                },
              ]}
            />
          ))}
        </View>

        {/* Round Card */}
        <View style={[styles.roundCard, { backgroundColor: colors.card, borderColor: isOver ? '#FFD700' : info.color }]}>
          {isOver ? (
            <>
              <Text style={[styles.roundTitle, { color: '#FFD700' }]}>انتهت جميع الجولات!</Text>
              <Text style={[styles.roundDesc, { color: colors.mutedForeground }]}>
                استعد لاكتشاف الفائز النهائي
              </Text>
            </>
          ) : (
            <>
              <Text style={[styles.roundNum, { color: info.color }]}>الجولة {state.currentRound} من ٥</Text>
              <Text style={[styles.roundTitle, { color: colors.foreground }]}>{info.title}</Text>
              <Text style={[styles.roundDesc, { color: colors.mutedForeground }]}>{info.desc}</Text>
            </>
          )}
        </View>

        {/* Mini round list */}
        {!isOver && (
          <View style={styles.miniList}>
            {ROUNDS.map(r => (
              <View
                key={r.num}
                style={[
                  styles.miniItem,
                  {
                    backgroundColor: r.num < state.currentRound ? `${r.color}20` : colors.card,
                    borderColor: r.num === state.currentRound ? r.color : colors.border,
                    opacity: r.num > state.currentRound ? 0.45 : 1,
                  },
                ]}
              >
                {r.num < state.currentRound ? (
                  <Ionicons name="checkmark-circle" size={18} color={r.color} />
                ) : (
                  <View style={[styles.numCircle, { borderColor: r.color }]}>
                    <Text style={[styles.numCircleText, { color: r.color }]}>{r.num}</Text>
                  </View>
                )}
                <Text style={[styles.miniText, { color: r.num === state.currentRound ? r.color : colors.mutedForeground }]}>
                  {r.title}
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ flex: 1 }} />

        {/* CTA button */}
        <TouchableOpacity onPress={handleAction} activeOpacity={0.85}>
          <LinearGradient
            colors={isOver ? ['#FFD700', '#FFA500'] : [info.color, `${info.color}BB`]}
            style={styles.cta}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={[styles.ctaText, { color: ctaTextDark ? '#050510' : '#FFFFFF' }]}>
              {isOver ? 'عرض النتائج النهائية' : `ابدأ: ${info.title}`}
            </Text>
            <Ionicons name={isOver ? 'trophy' : 'play-circle'} size={26} color={ctaTextDark ? '#050510' : '#FFFFFF'} />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 },
  loadText: { fontSize: 16, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  errorTitle: { fontSize: 22, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  errorMsg: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 22 },
  backBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 10, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 18,
    marginTop: 8,
  },
  backBtnText: { fontSize: 17, fontFamily: 'Inter_700Bold', color: '#050510' },
  content: { flex: 1, paddingHorizontal: 20, gap: 16 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  header: { fontSize: 13, fontFamily: 'Inter_600SemiBold', textAlign: 'center', letterSpacing: 2 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, alignItems: 'center' },
  dot: { height: 8, borderRadius: 4 },
  roundCard: { borderRadius: 20, borderWidth: 1.5, padding: 22, gap: 8, alignItems: 'center' },
  roundNum: { fontSize: 13, fontFamily: 'Inter_600SemiBold', letterSpacing: 1 },
  roundTitle: { fontSize: 26, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  roundDesc: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 22 },
  miniList: { gap: 8 },
  miniItem: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1,
  },
  numCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  numCircleText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  miniText: { fontSize: 14, fontFamily: 'Inter_500Medium' },
  cta: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 12, paddingVertical: 18, borderRadius: 20,
    shadowColor: '#FFD700', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5, shadowRadius: 24, elevation: 16,
  },
  ctaText: { fontSize: 20, fontFamily: 'Inter_700Bold' },
});
