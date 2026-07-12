import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Platform, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useColors } from '@/hooks/useColors';
import { useSounds } from '@/hooks/useSounds';
import { useAuth } from '@/contexts/AuthContext';
import { PRESET_AVATARS } from '@/constants/avatars';

export default function AuthRegisterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { playClick } = useSounds(false);
  const { register } = useAuth();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [avatar, setAvatar] = useState<string>(PRESET_AVATARS[0]);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const handleBack = () => {
    playClick();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const handleSubmit = async () => {
    const name = username.trim();
    if (name.length < 3) {
      setError('اسم المستخدم يجب أن يكون 3 أحرف على الأقل');
      return;
    }
    if (password.length < 6) {
      setError('كلمة المرور يجب ألا تقل عن 6 أحرف');
      return;
    }
    if (password !== confirmPassword) {
      setError('كلمتا المرور غير متطابقتين');
      return;
    }

    playClick();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setError(null);
    setSubmitting(true);
    try {
      await register(name, password, avatar);
      router.replace('/friends');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشل إنشاء الحساب');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={[S.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={['#0D0025', '#050510', '#000D1A']} style={StyleSheet.absoluteFill} />
      <View style={S.glowCyan} />

      <ScrollView
        contentContainerStyle={[S.content, { paddingTop: topPad + 16, paddingBottom: botPad + 24 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={S.header}>
          <TouchableOpacity onPress={handleBack} activeOpacity={0.8} style={[S.backBtn, { borderColor: colors.border }]}>
            <Ionicons name="arrow-forward" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
          <View style={S.headerTitles}>
            <Text style={[S.headerTag, { color: colors.mutedForeground }]}>حسابي</Text>
            <Text style={[S.headerTitle, { color: '#00E5FF' }]}>إنشاء حساب</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        {/* Avatar picker */}
        <View style={[S.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[S.cardLabel, { color: colors.mutedForeground }]}>اختر صورتك الرمزية</Text>
          <View style={S.avatarGrid}>
            {PRESET_AVATARS.map((a) => {
              const selected = a === avatar;
              return (
                <TouchableOpacity
                  key={a}
                  onPress={() => { playClick(); Haptics.selectionAsync(); setAvatar(a); }}
                  activeOpacity={0.8}
                >
                  <View
                    style={[
                      S.avatarCell,
                      {
                        borderColor: selected ? '#FFD700' : colors.border,
                        backgroundColor: selected ? 'rgba(255,215,0,0.12)' : '#08082A',
                        borderWidth: selected ? 2 : 1,
                      },
                    ]}
                  >
                    <Text style={S.avatarEmoji}>{a}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={[S.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={[S.inputRow, { borderColor: '#7B2FFF' }]}>
            <MaterialCommunityIcons name="account" size={22} color="#7B2FFF" />
            <TextInput
              value={username}
              onChangeText={setUsername}
              placeholder="اسم المستخدم (3-20 حرفًا)"
              placeholderTextColor={colors.mutedForeground}
              style={[S.input, { color: colors.foreground }]}
              textAlign="right"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
              returnKeyType="next"
            />
          </View>
          <View style={[S.inputRow, { borderColor: '#00E5FF' }]}>
            <MaterialCommunityIcons name="lock" size={22} color="#00E5FF" />
            <TextInput
              value={password}
              onChangeText={setPassword}
              placeholder="كلمة المرور"
              placeholderTextColor={colors.mutedForeground}
              style={[S.input, { color: colors.foreground }]}
              textAlign="right"
              secureTextEntry
              returnKeyType="next"
            />
          </View>
          <View style={[S.inputRow, { borderColor: '#FF6B00' }]}>
            <MaterialCommunityIcons name="lock-check" size={22} color="#FF6B00" />
            <TextInput
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              placeholder="تأكيد كلمة المرور"
              placeholderTextColor={colors.mutedForeground}
              style={[S.input, { color: colors.foreground }]}
              textAlign="right"
              secureTextEntry
              returnKeyType="done"
              onSubmitEditing={handleSubmit}
            />
          </View>
        </View>

        {error && <Text style={S.errorTxt}>{error}</Text>}

        <TouchableOpacity onPress={handleSubmit} activeOpacity={0.85} disabled={submitting}>
          <LinearGradient
            colors={submitting ? ['#333', '#222'] : ['#FFD700', '#FFA500']}
            style={S.startBtn}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
          >
            <Text style={S.startBtnText}>{submitting ? 'جارٍ الإنشاء...' : 'إنشاء الحساب'}</Text>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => { playClick(); router.push('/auth-login'); }}
          activeOpacity={0.8}
          style={S.switchLink}
        >
          <Text style={[S.switchLinkTxt, { color: colors.mutedForeground }]}>
            لديك حساب بالفعل؟ <Text style={{ color: '#7B2FFF' }}>سجّل الدخول</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1 },
  glowCyan: {
    position: 'absolute', top: '8%', alignSelf: 'center',
    width: 240, height: 240, borderRadius: 120,
    backgroundColor: '#00E5FF', opacity: 0.1,
  },
  content: { paddingHorizontal: 22, gap: 18 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: {
    width: 40, height: 40, borderRadius: 14, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitles: { alignItems: 'center', gap: 2 },
  headerTag: { fontSize: 11, fontFamily: 'Inter_500Medium', letterSpacing: 2 },
  headerTitle: { fontSize: 20, fontFamily: 'Inter_700Bold' },
  card: { borderRadius: 20, borderWidth: 1, padding: 20, gap: 14 },
  cardLabel: { fontSize: 12, fontFamily: 'Inter_500Medium', textAlign: 'center', letterSpacing: 1.5 },
  avatarGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' },
  avatarCell: {
    width: 52, height: 52, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEmoji: { fontSize: 26 },
  inputRow: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 14, borderRadius: 14, borderWidth: 1.5, backgroundColor: '#08082A',
  },
  input: { flex: 1, fontSize: 16, fontFamily: 'Inter_600SemiBold' },
  errorTxt: { color: '#FF3B3B', fontSize: 13, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  startBtn: {
    alignItems: 'center', justifyContent: 'center', paddingVertical: 18, borderRadius: 20,
    shadowColor: '#FFD700', shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.55, shadowRadius: 24, elevation: 16,
  },
  startBtnText: { fontSize: 18, fontFamily: 'Inter_700Bold', color: '#050510' },
  switchLink: { alignItems: 'center', paddingVertical: 6 },
  switchLinkTxt: { fontSize: 13, fontFamily: 'Inter_500Medium' },
});
