import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, ActivityIndicator, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useColors } from '@/hooks/useColors';
import { useMultiplayer, PLAYER_COLORS } from '@/contexts/MultiplayerContext';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useSounds } from '@/hooks/useSounds';

const MP_ROUNDS = [
  { num: 1, title: 'ماذا تعرف',   desc: 'دور بدوري بين اللاعبين\n٣ إنذارات لكل لاعب — الأقل إنذاراً يفوز',       color: '#7B2FFF', route: '/mp-round1' as const },
  { num: 2, title: 'المزاد',       desc: 'مزايدة متسلسلة — من يزايد أعلى يتحدى نفسه\nالوفاء بالرهان = نقاطك',       color: '#FFD700', route: '/mp-round2' as const },
  { num: 3, title: 'الجرس',        desc: 'من ينادي أولاً يجيب\nسؤال محروق إذا أخطأ الجميع',                        color: '#FF6B00', route: '/mp-round3' as const },
  { num: 5, title: 'خمّن اللاعب', desc: 'مسيرة الانتقالات — الجميع يحزر معاً\nأول من يصيح يفوز بالنقطة',          color: '#00E5FF', route: '/mp-round5' as const },
];

function getRoundInfo(currentRound: number) {
  return MP_ROUNDS.find(r => r.num === currentRound) ?? null;
}

function getDisplayIndex(currentRound: number) {
  return MP_ROUNDS.findIndex(r => r.num === currentRound);
}

export default function MpGameHub() {
  const router  = useRouter();
  const insets  = useSafeAreaInsets();
  const colors  = useColors();
  const { state, toggleMute } = useMultiplayer();
  const { playClick } = useSounds(state.isMuted);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const isOver  = state.currentRound > 5;
  const info    = getRoundInfo(state.currentRound);
  const dispIdx = getDisplayIndex(state.currentRound);

  const handleAction = () => {
    playClick();
    if (isOver) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.push('/mp-results');
    } else if (info) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      router.push(info.route);
    }
  };

  if (state.isLoading) {
    return (
      <View style={[S.root, S.centered, { backgroundColor: colors.background }]}>
        <LinearGradient colors={['#050510', '#08082A', '#050510']} style={StyleSheet.absoluteFill} />
        <ActivityIndicator size="large" color="#FFD700" />
        <Text style={[S.loadText, { color: colors.mutedForeground }]}>جاري تحميل الأسئلة…</Text>
      </View>
    );
  }

  if (state.loadError) {
    return (
      <View style={[S.root, S.centered, { backgroundColor: colors.background }]}>
        <LinearGradient colors={['#050510', '#08082A', '#050510']} style={StyleSheet.absoluteFill} />
        <Ionicons name="cloud-offline-outline" size={52} color="#FF3B3B" />
        <Text style={[S.errorTitle, { color: '#FF3B3B' }]}>تعذّر تحميل الأسئلة</Text>
        <Text style={[S.errorMsg, { color: colors.mutedForeground }]}>{state.loadError}</Text>
        <TouchableOpacity onPress={() => router.replace('/')} activeOpacity={0.8}>
          <LinearGradient colors={['#FFD700', '#FFA500']} style={S.backBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
            <Ionicons name="arrow-forward" size={20} color="#050510" />
            <Text style={S.backBtnText}>العودة للرئيسية</Text>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[S.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={['#050510', '#08082A', '#050510']} style={StyleSheet.absoluteFill} />

      <View style={[S.content, { paddingTop: topPad + 16, paddingBottom: botPad + 24 }]}>
        {/* Top bar */}
        <View style={S.topBar}>
          <Text style={[S.header, { color: colors.mutedForeground }]}>تحدي الثلاثين — جماعي</Text>
          <TouchableOpacity onPress={() => { playClick(); toggleMute(); }} activeOpacity={0.7}>
            <Ionicons
              name={state.isMuted ? 'volume-mute' : 'volume-high'}
              size={20}
              color={state.isMuted ? '#555' : colors.mutedForeground}
            />
          </TouchableOpacity>
        </View>

        {/* All Players Scores */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={S.scoresRow}>
          {state.players.map((name, i) => (
            <View key={i} style={[S.playerScore, { borderColor: PLAYER_COLORS[i] ?? '#FFD700', backgroundColor: `${PLAYER_COLORS[i] ?? '#FFD700'}12` }]}>
              <Text style={[S.playerScoreName, { color: PLAYER_COLORS[i] ?? '#FFD700' }]} numberOfLines={1}>{name}</Text>
              <Text style={[S.playerScorePts, { color: PLAYER_COLORS[i] ?? '#FFD700' }]}>{state.scores[i]}</Text>
            </View>
          ))}
        </ScrollView>

        {/* Progress dots */}
        <View style={S.dots}>
          {MP_ROUNDS.map((r, idx) => (
            <View
              key={r.num}
              style={[
                S.dot,
                {
                  backgroundColor: idx <= dispIdx ? r.color : colors.border,
                  opacity: idx <= dispIdx ? 1 : 0.3,
                  width: idx === dispIdx && !isOver ? 36 : 12,
                },
              ]}
            />
          ))}
        </View>

        {/* Round card */}
        <View style={[S.roundCard, { backgroundColor: colors.card, borderColor: isOver ? '#FFD700' : (info?.color ?? '#FFD700') }]}>
          {isOver ? (
            <>
              <Text style={[S.roundTitle, { color: '#FFD700' }]}>انتهت جميع الجولات!</Text>
              <Text style={[S.roundDesc, { color: colors.mutedForeground }]}>استعد لاكتشاف الفائز النهائي</Text>
            </>
          ) : info ? (
            <>
              <Text style={[S.roundNum, { color: info.color }]}>
                الجولة {dispIdx + 1} من ٤ {info.num === 5 ? '(يُتخطى تحدي الثلاثين)' : ''}
              </Text>
              <Text style={[S.roundTitle, { color: colors.foreground }]}>{info.title}</Text>
              <Text style={[S.roundDesc, { color: colors.mutedForeground }]}>{info.desc}</Text>
            </>
          ) : null}
        </View>

        {/* Round list */}
        {!isOver && (
          <View style={S.miniList}>
            {MP_ROUNDS.map((r, idx) => (
              <View
                key={r.num}
                style={[
                  S.miniItem,
                  {
                    backgroundColor: idx < dispIdx ? `${r.color}20` : colors.card,
                    borderColor: idx === dispIdx ? r.color : colors.border,
                    opacity: idx > dispIdx ? 0.4 : 1,
                  },
                ]}
              >
                {idx < dispIdx ? (
                  <Ionicons name="checkmark-circle" size={18} color={r.color} />
                ) : (
                  <View style={[S.numCircle, { borderColor: r.color }]}>
                    <Text style={[S.numCircleText, { color: r.color }]}>{r.num}</Text>
                  </View>
                )}
                <Text style={[S.miniText, { color: idx === dispIdx ? r.color : colors.mutedForeground }]}>
                  {r.title}
                </Text>
                {r.num === 5 && <Text style={[S.skipTag, { color: '#FF6B00' }]}>٤ محذوف</Text>}
              </View>
            ))}
          </View>
        )}

        <View style={{ flex: 1 }} />

        {/* CTA */}
        <TouchableOpacity onPress={handleAction} activeOpacity={0.85}>
          <LinearGradient
            colors={isOver ? ['#FFD700', '#FFA500'] : [info?.color ?? '#FFD700', `${info?.color ?? '#FFD700'}BB`]}
            style={S.cta}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={[S.ctaText, { color: isOver ? '#050510' : '#FFFFFF' }]}>
              {isOver ? 'عرض النتائج النهائية' : `ابدأ: ${info?.title}`}
            </Text>
            <Ionicons name={isOver ? 'trophy' : 'play-circle'} size={26} color={isOver ? '#050510' : '#FFFFFF'} />
          </LinearGradient>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1 },
  centered: { alignItems: 'center', justifyContent: 'center', gap: 16, padding: 32 },
  loadText: { fontSize: 16, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  errorTitle: { fontSize: 22, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  errorMsg: { fontSize: 14, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 22 },
  backBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 28, borderRadius: 18, marginTop: 8 },
  backBtnText: { fontSize: 17, fontFamily: 'Inter_700Bold', color: '#050510' },
  content: { flex: 1, paddingHorizontal: 20, gap: 14 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  header: { fontSize: 13, fontFamily: 'Inter_600SemiBold', textAlign: 'center', letterSpacing: 1.5 },
  scoresRow: { flexDirection: 'row', gap: 10, paddingHorizontal: 2 },
  playerScore: { borderRadius: 14, borderWidth: 1.5, paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center', gap: 4, minWidth: 80 },
  playerScoreName: { fontSize: 11, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  playerScorePts: { fontSize: 26, fontFamily: 'Inter_700Bold' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6, alignItems: 'center' },
  dot: { height: 8, borderRadius: 4 },
  roundCard: { borderRadius: 20, borderWidth: 1.5, padding: 22, gap: 8, alignItems: 'center' },
  roundNum: { fontSize: 12, fontFamily: 'Inter_600SemiBold', letterSpacing: 1, textAlign: 'center' },
  roundTitle: { fontSize: 26, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  roundDesc: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 22 },
  miniList: { gap: 8 },
  miniItem: { flexDirection: 'row-reverse', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1 },
  numCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center' },
  numCircleText: { fontSize: 11, fontFamily: 'Inter_700Bold' },
  miniText: { fontSize: 14, fontFamily: 'Inter_500Medium', flex: 1 },
  skipTag: { fontSize: 10, fontFamily: 'Inter_600SemiBold' },
  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingVertical: 18, borderRadius: 20, shadowColor: '#FFD700', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.5, shadowRadius: 24, elevation: 16 },
  ctaText: { fontSize: 20, fontFamily: 'Inter_700Bold' },
});
