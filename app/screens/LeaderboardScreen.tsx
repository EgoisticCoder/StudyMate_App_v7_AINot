// COMPETITION & LEADERBOARD SCREEN — Redesigned ranked rows, sub-screen back header,
// and premium social settings.
import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, ActivityIndicator, Alert, RefreshControl, Platform, Animated, Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, router } from 'expo-router';
import { useTheme, useAuth } from '../../lib/context';
import { useT } from '../../lib/translations';
import { getGamificationStats, GamificationStats } from '../../lib/gamification';
import {
  getFriendsList, getLeaderboard, FriendProfile,
  sendFriendRequest, acceptFriendRequest,
} from '../../lib/social';
import { EmptyState, SurfaceCard, Chip } from '../../components/ui/premium';
import { Fonts } from '../../constants/fonts';
import { ScreenSkeleton } from '../../components/LoadingSkeleton';

export default function LeaderboardScreen() {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  const tr = useT();

  const [activeTab, setActiveTab] = useState<'leaderboard' | 'friends'>('leaderboard');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState<GamificationStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<FriendProfile[]>([]);
  const [friends, setFriends] = useState<{
    accepted: FriendProfile[];
    pendingIn: FriendProfile[];
    pendingOut: FriendProfile[];
  }>({ accepted: [], pendingIn: [], pendingOut: [] });

  const [friendEmail, setFriendEmail] = useState('');
  const [addingFriend, setAddingFriend] = useState(false);

  const fetchData = useCallback(async (silent = false) => {
    if (!studentId) return;
    if (!silent) setLoading(true);
    try {
      const [gamification, friendsData, leaderboardData] = await Promise.all([
        getGamificationStats(studentId),
        getFriendsList(studentId),
        getLeaderboard(studentId),
      ]);
      setStats(gamification);
      setFriends(friendsData);
      setLeaderboard(leaderboardData);
    } catch (err) {
      console.error('Error fetching social stats:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [studentId]);

  const isFirstFocus = React.useRef(true);
  useFocusEffect(
    useCallback(() => {
      fetchData(!isFirstFocus.current);
      isFirstFocus.current = false;
    }, [fetchData])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData(true);
  };

  const handleAddFriend = async () => {
    if (!friendEmail.trim() || !studentId) return;
    setAddingFriend(true);
    try {
      const res = await sendFriendRequest(studentId, friendEmail);
      if (res.success) {
        Alert.alert(tr('success'), res.message);
        setFriendEmail('');
        await fetchData(true);
      } else {
        Alert.alert(tr('notice'), res.message);
      }
    } catch {
      Alert.alert(tr('error'), tr('request_failed'));
    } finally {
      setAddingFriend(false);
    }
  };

  const handleAcceptRequest = async (fromId: string) => {
    if (!studentId) return;
    try {
      await acceptFriendRequest(studentId, fromId);
      await fetchData(true);
    } catch {
      Alert.alert(tr('error'), tr('accept_failed'));
    }
  };

  // Entrance animation
  const screenFade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(screenFade, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);

  if (loading && !refreshing) return <ScreenSkeleton />;

  const renderPendingOut = () =>
    friends.pendingOut.length > 0 ? (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
          {tr('sent_requests')}
        </Text>
        {friends.pendingOut.map(f => (
          <SurfaceCard key={`out-${f.id}`} style={styles.pendingRowContainer}>
            <View style={styles.friendInfo}>
              <Text style={[styles.friendName, { color: colors.textPrimary, fontFamily: Fonts.bodyMedium }]}>{f.name}</Text>
              <Text style={[styles.friendEmail, { color: colors.textSecondary, fontFamily: Fonts.body }]}>{f.email}</Text>
            </View>
            <View style={[styles.pendingBadge, { backgroundColor: colors.surface3 }]}>
              <Ionicons name="time-outline" size={12} color={colors.textTertiary} />
              <Text style={{ color: colors.textTertiary, fontSize: 11, fontWeight: '600', marginLeft: 4, fontFamily: Fonts.bodyMedium }}>
                {tr('pending')}
              </Text>
            </View>
          </SurfaceCard>
        ))}
      </View>
    ) : null;

  const renderPendingIn = () =>
    friends.pendingIn.length > 0 ? (
      <View style={styles.section}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
          {tr('pending_requests')}
        </Text>
        {friends.pendingIn.map(f => (
          <SurfaceCard key={`in-${f.id}`} style={styles.pendingRowContainer}>
            <View style={styles.friendInfo}>
              <Text style={[styles.friendName, { color: colors.textPrimary, fontFamily: Fonts.bodyMedium }]}>{f.name}</Text>
              <Text style={[styles.friendEmail, { color: colors.textSecondary, fontFamily: Fonts.body }]}>{f.email}</Text>
            </View>
            <TouchableOpacity
              style={[styles.acceptBtn, { backgroundColor: colors.accent }]}
              onPress={() => handleAcceptRequest(f.id)}
            >
              <Text style={{ color: colors.textInverse, fontSize: 12, fontWeight: '700', fontFamily: Fonts.display }}>
                {tr('accept')}
              </Text>
            </TouchableOpacity>
          </SurfaceCard>
        ))}
      </View>
    ) : null;

  return (
    <Animated.View style={[styles.container, { backgroundColor: colors.background, opacity: screenFade }]}>
      {/* Custom Sub-screen Header with Back Navigation */}
      <View style={[styles.headerRow, { borderBottomColor: colors.borderSubtle }]}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
          {tr('competition')}
        </Text>
      </View>

      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />
        }
      >
        {/* Flat Gamification Stats Panel */}
        <View style={[styles.statsHeader, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
          <View style={styles.statItem}>
            <Ionicons name="star-outline" size={18} color={colors.accent} />
            <Text style={[styles.statValue, { color: colors.textPrimary, fontFamily: Fonts.display }]}>{stats?.level || 1}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary, fontFamily: Fonts.bodyMedium }]}>{tr('level')}</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.borderSubtle }]} />
          <View style={styles.statItem}>
            <Ionicons name="flash-outline" size={18} color={colors.accent} />
            <Text style={[styles.statValue, { color: colors.textPrimary, fontFamily: Fonts.display }]}>{stats?.xp || 0}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary, fontFamily: Fonts.bodyMedium }]}>XP</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.borderSubtle }]} />
          <View style={styles.statItem}>
            <Ionicons name="flame-outline" size={18} color={colors.xpGold} />
            <Text style={[styles.statValue, { color: colors.textPrimary, fontFamily: Fonts.display }]}>{stats?.streak || 0}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary, fontFamily: Fonts.bodyMedium }]}>{tr('streak')}</Text>
          </View>
        </View>

        {/* Tab Buttons */}
        <View style={[styles.tabs, { borderBottomColor: colors.borderSubtle }]}>
          {(['leaderboard', 'friends'] as const).map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.tabBtn, activeTab === tab && { borderBottomColor: colors.accent, borderBottomWidth: 2 }]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, { color: activeTab === tab ? colors.accent : colors.textSecondary, fontFamily: Fonts.bodyMedium }]}>
                {tr(tab)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {activeTab === 'leaderboard' ? (
          <View style={{ marginTop: 16 }}>
            {renderPendingIn()}
            {renderPendingOut()}

            {leaderboard.length === 0 ? (
              <EmptyState
                icon={<Ionicons name="trophy-outline" size={40} color={colors.textTertiary} />}
                heading="No leaderboard data"
                body="Complete a quiz to make it onto the board!"
              />
            ) : (
              <View style={{ marginBottom: 16 }}>
                {leaderboard.map((user, index) => {
                  const rank = index + 1;
                  const isMe = user.id === studentId;
                  const borderLeftColor = rank === 1 ? '#D4AF37' : rank === 2 ? '#A8A8A8' : rank === 3 ? '#CD7F32' : 'transparent';
                  const hasBorderLeft = rank <= 3;

                  const initials = user.name
                    ? user.name.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase()
                    : '?';

                  return (
                    <View
                      key={user.id}
                      style={[styles.lbWrapper, { borderColor: isMe ? colors.accentBorder : colors.borderSubtle }]}
                    >
                      <View
                        style={[
                          styles.lbItem,
                          {
                            borderLeftWidth: hasBorderLeft ? 3 : 0,
                            borderLeftColor: borderLeftColor,
                            backgroundColor: isMe ? colors.accentMuted : colors.surface1,
                          }
                        ]}
                      >
                        {/* Rank # */}
                        <Text style={[styles.rankText, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
                          #{rank}
                        </Text>

                        {/* Avatar initials */}
                        <View style={[styles.avatarCircle, { backgroundColor: colors.accent + '33' }]}>
                          <Text style={[styles.avatarInitials, { color: colors.accent, fontFamily: Fonts.display }]}>
                            {initials}
                          </Text>
                        </View>

                        {/* Name & level */}
                        <View style={styles.lbInfo}>
                          <Text style={[styles.lbName, { color: colors.textPrimary, fontFamily: Fonts.bodyMedium }]} numberOfLines={1}>
                            {user.name} {isMe ? `(${tr('you')})` : ''}
                          </Text>
                          <View style={[styles.levelBadge, { backgroundColor: colors.surface3 }]}>
                            <Text style={[styles.levelBadgeText, { color: colors.textTertiary, fontFamily: Fonts.body }]}>
                              {tr('level')} {user.level}
                            </Text>
                          </View>
                        </View>

                        {/* XP */}
                        <Text style={[styles.lbXp, { color: colors.accent, fontFamily: Fonts.display }]}>
                          {user.xp} XP
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            {stats && stats.badges.length > 0 && (
              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>{tr('your_badges')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingBottom: 4 }}>
                  {stats.badges.map(b => (
                    <SurfaceCard key={b.id} style={styles.badgeCard}>
                      <Ionicons name={b.icon as keyof typeof Ionicons.glyphMap} size={28} color={colors.accent} />
                      <Text style={[styles.badgeName, { color: colors.textPrimary, fontFamily: Fonts.bodyMedium }]} numberOfLines={1}>{b.name}</Text>
                    </SurfaceCard>
                  ))}
                </ScrollView>
              </View>
            )}
          </View>
        ) : (
          <View style={{ marginTop: 16 }}>
            {/* Add Friend Card */}
            <SurfaceCard style={styles.addFriendCard}>
              <Text style={[styles.addFriendTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
                {tr('add_friend')}
              </Text>
              <View style={styles.addInputRow}>
                <TextInput
                  style={[styles.addInput, {
                    backgroundColor: colors.surface2,
                    color: colors.textPrimary,
                    borderColor: colors.borderSubtle,
                    fontFamily: Fonts.body,
                  }]}
                  placeholder={tr('friend_email')}
                  placeholderTextColor={colors.textTertiary}
                  value={friendEmail}
                  onChangeText={setFriendEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                />
                <TouchableOpacity
                  style={[styles.addBtn, { backgroundColor: colors.accent }]}
                  onPress={handleAddFriend}
                  disabled={addingFriend}
                >
                  {addingFriend
                    ? <ActivityIndicator color={colors.textInverse} size="small" />
                    : <Ionicons name="person-add" size={20} color={colors.textInverse} />}
                </TouchableOpacity>
              </View>
            </SurfaceCard>

            {renderPendingIn()}
            {renderPendingOut()}

            {/* Friends list */}
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>{tr('friends')}</Text>
              {friends.accepted.length === 0 ? (
                <EmptyState
                  icon={<Ionicons name="people-outline" size={40} color={colors.textTertiary} />}
                  heading="No friends yet"
                  body="Add friends by email above to see them in your list."
                />
              ) : (
                friends.accepted.map(f => (
                  <SurfaceCard key={f.id} style={styles.friendCard}>
                    <View style={styles.friendInfo}>
                      <Text style={[styles.friendName, { color: colors.textPrimary, fontFamily: Fonts.bodyMedium }]}>{f.name}</Text>
                      <Text style={[styles.friendEmail, { color: colors.textSecondary, fontFamily: Fonts.body }]}>
                        {tr('level')} {f.level} • {f.xp} {tr('xp')}
                      </Text>
                    </View>
                  </SurfaceCard>
                ))
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 16,
    paddingHorizontal: 20,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    marginRight: 12,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '600',
    letterSpacing: -0.4,
  },
  content: { flex: 1, paddingHorizontal: 20 },
  statsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 16,
  },
  statItem: { alignItems: 'center', gap: 4 },
  statDivider: { width: 1, alignSelf: 'stretch', marginVertical: 4 },
  statValue: { fontSize: 20, fontWeight: '600' },
  statLabel: { fontSize: 11, fontWeight: '500' },
  tabs: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, marginTop: 16 },
  tabBtn: { flex: 1, paddingVertical: 14, alignItems: 'center' },
  tabText: { fontSize: 14, fontWeight: '600' },
  section: { marginBottom: 24, marginTop: 12 },
  sectionTitle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.88, textTransform: 'uppercase', marginBottom: 12 },
  
  // Ranked list rows
  lbWrapper: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  lbItem: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 64,
    paddingHorizontal: 16,
  },
  rankText: { width: 32, fontSize: 15, fontWeight: '700' },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarInitials: { fontSize: 13, fontWeight: '600' },
  lbInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  lbName: { fontSize: 15, fontWeight: '500' },
  levelBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  levelBadgeText: { fontSize: 11 },
  lbXp: { fontSize: 14, fontWeight: '600' },

  // Badges
  badgeCard: { padding: 16, borderRadius: 14, alignItems: 'center', width: 104, justifyContent: 'center' },
  badgeName: { fontSize: 11, fontWeight: '600', marginTop: 8, textAlign: 'center' },

  // Add friend
  addFriendCard: { padding: 16, marginBottom: 16 },
  addFriendTitle: { fontSize: 11, fontWeight: '600', letterSpacing: 0.88, textTransform: 'uppercase', marginBottom: 12 },
  addInputRow: { flexDirection: 'row', gap: 8 },
  addInput: { flex: 1, height: 44, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 14, fontSize: 14 },
  addBtn: { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  
  // Pending and list cards
  pendingRowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginBottom: 8,
  },
  friendCard: {
    padding: 16,
    marginBottom: 8,
  },
  friendInfo: { flex: 1 },
  friendName: { fontSize: 15, fontWeight: '500', marginBottom: 2 },
  friendEmail: { fontSize: 12 },
  acceptBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  pendingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
});
