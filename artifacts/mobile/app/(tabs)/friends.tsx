import React, { useCallback, useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity, Platform, FlatList, ActivityIndicator,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useColors } from '@/hooks/useColors';
import { useSounds } from '@/hooks/useSounds';
import { useAuth } from '@/contexts/AuthContext';
import {
  listFriends, listIncomingRequests, respondToRequest, sendFriendRequest,
  removeFriend, FriendProfile, FriendRequest, FriendsError,
} from '@/lib/friends';

export default function FriendsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const { playClick } = useSounds(false);
  const { user, token, isLoading: authLoading, onlineFriendIds, logout } = useAuth();

  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [requests, setRequests] = useState<FriendRequest[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [searchId, setSearchId] = useState('');
  const [message, setMessage] = useState<{ text: string; kind: 'error' | 'success' } | null>(null);
  const [busy, setBusy] = useState(false);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const botPad = Platform.OS === 'web' ? 34 : insets.bottom;

  const loadData = useCallback(async () => {
    if (!token) return;
    try {
      const [friendsList, requestsList] = await Promise.all([
        listFriends(token),
        listIncomingRequests(token),
      ]);
      setFriends(friendsList);
      setRequests(requestsList);
    } catch (err) {
      console.warn('[friends] load failed:', err);
    } finally {
      setLoaded(true);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      setLoaded(false);
      loadData();
    }, [loadData]),
  );

  const handleBack = () => {
    playClick();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.back();
  };

  const handleCopyId = async () => {
    if (!user) return;
    playClick();
    await Clipboard.setStringAsync(user.uniqueId);
    setMessage({ text: 'تم نسخ رقمك التعريفي', kind: 'success' });
  };

  const handleSearch = async () => {
    if (!token) return;
    const id = searchId.trim();
    if (!/^\d{6}$/.test(id)) {
      setMessage({ text: 'الرقم التعريفي يجب أن يكون 6 أرقام', kind: 'error' });
      return;
    }
    playClick();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBusy(true);
    setMessage(null);
    try {
      const status = await sendFriendRequest(token, id);
      setSearchId('');
      setMessage({
        text: status === 'accepted' ? 'أصبحتما صديقين!' : 'تم إرسال طلب الصداقة',
        kind: 'success',
      });
      await loadData();
    } catch (err) {
      setMessage({ text: err instanceof FriendsError ? err.message : 'حدث خطأ ما', kind: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const handleRespond = async (requestId: string, action: 'accept' | 'decline') => {
    if (!token) return;
    playClick();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await respondToRequest(token, requestId, action);
      await loadData();
    } catch (err) {
      setMessage({ text: err instanceof FriendsError ? err.message : 'حدث خطأ ما', kind: 'error' });
    }
  };

  const handleRemoveFriend = async (friendId: string) => {
    if (!token) return;
    playClick();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await removeFriend(token, friendId);
      await loadData();
    } catch (err) {
      setMessage({ text: err instanceof FriendsError ? err.message : 'حدث خطأ ما', kind: 'error' });
    }
  };

  const handleLogout = async () => {
    playClick();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await logout();
  };

  // ── Not logged in ──────────────────────────────────────────────────────
  if (!authLoading && !user) {
    return (
      <View style={[S.root, { backgroundColor: colors.background }]}>
        <LinearGradient colors={['#0D0025', '#050510', '#000D1A']} style={StyleSheet.absoluteFill} />
        <View style={[S.content, { paddingTop: topPad + 16, paddingBottom: botPad + 24, justifyContent: 'center', alignItems: 'center', flex: 1 }]}>
          <MaterialCommunityIcons name="account-group-outline" size={64} color={colors.mutedForeground} />
          <Text style={[S.emptyTitle, { color: colors.foreground, marginTop: 16 }]}>سجّل الدخول لإضافة الأصدقاء</Text>
          <TouchableOpacity onPress={() => router.replace('/auth-login')} activeOpacity={0.85} style={{ marginTop: 20 }}>
            <LinearGradient colors={['#FFD700', '#FFA500']} style={S.startBtn} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}>
              <Text style={S.startBtnText}>تسجيل الدخول</Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[S.root, { backgroundColor: colors.background }]}>
      <LinearGradient colors={['#0D0025', '#050510', '#000D1A']} style={StyleSheet.absoluteFill} />
      <View style={S.glowPurple} />

      <View style={[S.content, { paddingTop: topPad + 16, paddingBottom: botPad + 24 }]}>
        <View style={S.header}>
          <TouchableOpacity onPress={handleBack} activeOpacity={0.8} style={[S.backBtn, { borderColor: colors.border }]}>
            <Ionicons name="arrow-forward" size={20} color={colors.mutedForeground} />
          </TouchableOpacity>
          <View style={S.headerTitles}>
            <Text style={[S.headerTag, { color: colors.mutedForeground }]}>القائمة الاجتماعية</Text>
            <Text style={[S.headerTitle, { color: '#7B2FFF' }]}>الأصدقاء</Text>
          </View>
          <TouchableOpacity onPress={handleLogout} activeOpacity={0.8} style={[S.backBtn, { borderColor: colors.border }]}>
            <Ionicons name="log-out-outline" size={20} color="#FF3B3B" />
          </TouchableOpacity>
        </View>

        {authLoading || !loaded ? (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <FlatList
            data={friends}
            keyExtractor={(item) => item.id}
            ListHeaderComponent={
              <View style={{ gap: 16 }}>
                {/* Profile / my ID */}
                {user && (
                  <TouchableOpacity onPress={handleCopyId} activeOpacity={0.85}>
                    <View style={[S.profileCard, { borderColor: colors.border, backgroundColor: colors.card }]}>
                      <Text style={S.profileAvatar}>{user.avatar}</Text>
                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <Text style={[S.profileName, { color: colors.foreground }]}>{user.username}</Text>
                        <Text style={[S.profileId, { color: colors.mutedForeground }]}>رقمك: {user.uniqueId} (اضغط للنسخ)</Text>
                      </View>
                      <Ionicons name="copy-outline" size={20} color={colors.mutedForeground} />
                    </View>
                  </TouchableOpacity>
                )}

                {/* Add friend */}
                <View style={[S.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
                  <Text style={[S.cardLabel, { color: colors.mutedForeground }]}>إضافة صديق بالرقم التعريفي</Text>
                  <View style={S.searchRow}>
                    <TouchableOpacity onPress={handleSearch} activeOpacity={0.85} disabled={busy}>
                      <View style={[S.searchBtn, { backgroundColor: busy ? '#333' : '#7B2FFF' }]}>
                        <Ionicons name="person-add" size={20} color="#FFF" />
                      </View>
                    </TouchableOpacity>
                    <TextInput
                      value={searchId}
                      onChangeText={(t) => setSearchId(t.replace(/[^0-9]/g, '').slice(0, 6))}
                      placeholder="٦ أرقام"
                      placeholderTextColor={colors.mutedForeground}
                      style={[S.searchInput, { color: colors.foreground, borderColor: colors.border }]}
                      textAlign="center"
                      keyboardType="number-pad"
                      maxLength={6}
                      returnKeyType="done"
                      onSubmitEditing={handleSearch}
                    />
                  </View>
                  {message && (
                    <Text style={[S.messageTxt, { color: message.kind === 'error' ? '#FF3B3B' : '#00E676' }]}>
                      {message.text}
                    </Text>
                  )}
                </View>

                {/* Incoming requests */}
                {requests.length > 0 && (
                  <View style={{ gap: 10 }}>
                    <Text style={[S.sectionTitle, { color: colors.mutedForeground }]}>طلبات الصداقة ({requests.length})</Text>
                    {requests.map((r) => (
                      <View key={r.id} style={[S.requestRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
                        <View style={S.rowRight}>
                          <Text style={S.rowAvatar}>{r.from.avatar}</Text>
                          <Text style={[S.rowName, { color: colors.foreground }]}>{r.from.username}</Text>
                        </View>
                        <View style={S.requestActions}>
                          <TouchableOpacity onPress={() => handleRespond(r.id, 'decline')} activeOpacity={0.8}>
                            <View style={[S.actionBtn, { borderColor: '#FF3B3B' }]}>
                              <Ionicons name="close" size={18} color="#FF3B3B" />
                            </View>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={() => handleRespond(r.id, 'accept')} activeOpacity={0.8}>
                            <View style={[S.actionBtn, { borderColor: '#00E676' }]}>
                              <Ionicons name="checkmark" size={18} color="#00E676" />
                            </View>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                <Text style={[S.sectionTitle, { color: colors.mutedForeground }]}>
                  أصدقائي ({friends.length})
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const online = onlineFriendIds.has(item.id) || item.online;
              return (
                <View style={[S.requestRow, { borderColor: colors.border, backgroundColor: colors.card }]}>
                  <View style={S.rowRight}>
                    <View>
                      <Text style={S.rowAvatar}>{item.avatar}</Text>
                      <View style={[S.onlineDot, { backgroundColor: online ? '#00E676' : '#555' }]} />
                    </View>
                    <Text style={[S.rowName, { color: colors.foreground }]}>{item.username}</Text>
                  </View>
                  <TouchableOpacity onPress={() => handleRemoveFriend(item.id)} activeOpacity={0.8}>
                    <View style={[S.actionBtn, { borderColor: colors.border }]}>
                      <Ionicons name="person-remove-outline" size={18} color={colors.mutedForeground} />
                    </View>
                  </TouchableOpacity>
                </View>
              );
            }}
            ListEmptyComponent={
              <View style={S.emptyWrap}>
                <Ionicons name="people-outline" size={48} color={colors.mutedForeground} />
                <Text style={[S.emptySub, { color: colors.mutedForeground }]}>لا يوجد أصدقاء بعد — شارك رقمك التعريفي!</Text>
              </View>
            }
            contentContainerStyle={{ gap: 10, paddingBottom: 12 }}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    </View>
  );
}

const S = StyleSheet.create({
  root: { flex: 1 },
  glowPurple: {
    position: 'absolute', top: '5%', alignSelf: 'center',
    width: 260, height: 260, borderRadius: 130,
    backgroundColor: '#7B2FFF', opacity: 0.09,
  },
  content: { flex: 1, paddingHorizontal: 20, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: {
    width: 40, height: 40, borderRadius: 14, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  headerTitles: { alignItems: 'center', gap: 2 },
  headerTag: { fontSize: 11, fontFamily: 'Inter_500Medium', letterSpacing: 2 },
  headerTitle: { fontSize: 22, fontFamily: 'Inter_700Bold' },
  profileCard: {
    flexDirection: 'row-reverse', alignItems: 'center', gap: 12,
    borderRadius: 16, borderWidth: 1, padding: 14,
  },
  profileAvatar: { fontSize: 36 },
  profileName: { fontSize: 17, fontFamily: 'Inter_700Bold' },
  profileId: { fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 },
  card: { borderRadius: 20, borderWidth: 1, padding: 18, gap: 10 },
  cardLabel: { fontSize: 12, fontFamily: 'Inter_500Medium', textAlign: 'center', letterSpacing: 1 },
  searchRow: { flexDirection: 'row-reverse', gap: 10, alignItems: 'center' },
  searchInput: {
    flex: 1, fontSize: 20, fontFamily: 'Inter_700Bold', letterSpacing: 4,
    borderWidth: 1.5, borderRadius: 14, paddingVertical: 12,
  },
  searchBtn: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  messageTxt: { fontSize: 12, fontFamily: 'Inter_500Medium', textAlign: 'center' },
  sectionTitle: { fontSize: 12, fontFamily: 'Inter_600SemiBold', letterSpacing: 1, textAlign: 'right' },
  requestRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderRadius: 16, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 14,
  },
  rowRight: { flexDirection: 'row-reverse', alignItems: 'center', gap: 12, flex: 1 },
  rowAvatar: { fontSize: 28 },
  rowName: { fontSize: 15, fontFamily: 'Inter_700Bold' },
  onlineDot: {
    position: 'absolute', bottom: -1, left: -1,
    width: 10, height: 10, borderRadius: 5, borderWidth: 1.5, borderColor: '#0A0A22',
  },
  requestActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    width: 34, height: 34, borderRadius: 12, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  emptyWrap: { alignItems: 'center', gap: 10, paddingVertical: 24 },
  emptyTitle: { fontSize: 18, fontFamily: 'Inter_700Bold', textAlign: 'center' },
  emptySub: { fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' },
  startBtn: {
    alignItems: 'center', justifyContent: 'center', paddingVertical: 16, paddingHorizontal: 32, borderRadius: 20,
  },
  startBtnText: { fontSize: 16, fontFamily: 'Inter_700Bold', color: '#050510' },
});
