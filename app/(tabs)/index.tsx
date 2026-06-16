// HOME DASHBOARD — Premium dark/light design with flat header, separate stat cards, 
// nested view borders, and structured feature hierarchies.
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, StyleSheet,
  RefreshControl, Platform, Dimensions, Pressable, Animated, Easing,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme, useAuth } from '../../lib/context';
import { useT } from '../../lib/translations';
import { getStudentProfile, StudentProfile } from '../../lib/adaptiveEngine';
import { readQuery } from '../../lib/neo4j';
import { computeStressVerdict } from '../../lib/stressDetection';
import { getGamificationStats, GamificationStats } from '../../lib/gamification';
import { getActiveMissions, Mission } from '../../lib/missions';
import { MoodCheckIn } from '../../components/MoodCheckIn';
import { AdaptiveNudgeCard } from '../../components/AdaptiveNudgeCard';
import { CrisisCard } from '../../components/CrisisCard';
import { ScreenSkeleton } from '../../components/LoadingSkeleton';
import { WeeklyTimetableCard } from '../../components/WeeklyTimetableCard';
import { SubjectColors } from '../../constants/colors';
import { getSubjectStates, SubjectState } from '../../lib/adaptiveEngine';
import { Fonts } from '../../constants/fonts';
import { LinearGradient } from 'expo-linear-gradient';

const { width: SW } = Dimensions.get('window');

export default function HomeScreen() {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  const tr = useT();
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showMoodCheck, setShowMoodCheck] = useState(true);
  const [moodReaction, setMoodReaction] = useState('');
  const [isCrisis, setIsCrisis] = useState(false);
  const [hasBaseline, setHasBaseline] = useState(true);
  const [baselineViewed, setBaselineViewed] = useState(false);
  const [weekStats, setWeekStats] = useState({ quizzes: 0, avgScore: 0, studyMins: 0 });
  const [focusHintKey, setFocusHintKey] = useState<'focus_hint_default' | 'focus_hint_stress' | 'focus_hint_steady'>('focus_hint_default');
  const [nextExam, setNextExam] = useState<{ name: string; days: number } | null>(null);
  const [timetableReload, setTimetableReload] = useState(0);
  const [gStats, setGStats] = useState<GamificationStats | null>(null);
  const [missions, setMissions] = useState<Mission[]>([]);
  const [subjectStates, setSubjectStates] = useState<SubjectState[]>([]);

  const fetchData = useCallback(async () => {
    if (!studentId) return;
    try {
      const p = await getStudentProfile(studentId);
      setProfile(p);

      const diagDone = await readQuery(
        `MATCH (s:Student {id: $studentId})-[:TOOK_DIAGNOSTIC]->() RETURN 1 LIMIT 1`,
        { studentId }
      );
      const legacyBaseline = await readQuery(
        `MATCH (s:Student {id: $studentId})-[:TOOK_BASELINE]->() RETURN 1 LIMIT 1`,
        { studentId }
      );
      const baselineDone = diagDone.length > 0 || legacyBaseline.length > 0;
      setHasBaseline(baselineDone);

      // Check if user has viewed results at least once (stored as flag)
      if (baselineDone) {
        const viewedRec = await readQuery(
          `MATCH (s:Student {id: $studentId}) RETURN s.baseline_viewed AS v`,
          { studentId }
        );
        setBaselineViewed(viewedRec[0]?.get('v') === true);
      }

      const stressRow = await readQuery(
        `MATCH (s:Student {id: $studentId})-[:LOGGED_MOOD]->(m:MoodLog)
         WHERE m.date > datetime() - duration('P7D')
         RETURN avg(toFloat(m.stress_level)) AS a`,
        { studentId }
      );
      const avgS = stressRow[0]?.get('a');
      if (avgS != null && !Number.isNaN(Number(avgS))) {
        const v = Number(avgS);
        if (v > 3.6) setFocusHintKey('focus_hint_stress');
        else if (v < 2.2) setFocusHintKey('focus_hint_steady');
        else setFocusHintKey('focus_hint_default');
      } else setFocusHintKey('focus_hint_default');

      const examRec = await readQuery(
        `MATCH (s:Student {id: $studentId})-[:HAS_EXAM]->(e:Exam)
         WHERE e.date > datetime()
         RETURN e.name AS name, e.date AS dt ORDER BY e.date ASC LIMIT 1`,
        { studentId }
      );
      if (examRec.length) {
        const rawName = examRec[0].get('name');
        const rawDt = examRec[0].get('dt');
        const name = typeof rawName === 'string' ? rawName : 'Exam';
        const examDate = rawDt ? new Date(String(rawDt)) : null;
        if (examDate && !Number.isNaN(examDate.getTime())) {
          const days = Math.max(0, Math.ceil((examDate.getTime() - Date.now()) / 86400000));
          setNextExam({ name, days });
        } else setNextExam(null);
      } else setNextExam(null);

      const moodToday = await readQuery(
        `MATCH (s:Student {id: $studentId})-[:LOGGED_MOOD]->(m:MoodLog)
         WHERE m.date > datetime() - duration('P1D') RETURN m LIMIT 1`,
        { studentId }
      );
      setShowMoodCheck(moodToday.length === 0);

      const recentMoods = await readQuery(
        `MATCH (s:Student {id: $studentId})-[:LOGGED_MOOD]->(m:MoodLog)
         WHERE m.date > datetime() - duration('P7D')
         RETURN m.stress_level AS stress_level, m.date AS date ORDER BY m.date DESC`,
        { studentId }
      );
      const quizzes = await readQuery(
        `MATCH (s:Student {id: $studentId})-[:ATTEMPTED]->(q:Quiz)
         WHERE q.date > datetime() - duration('P7D')
         RETURN count(q) AS count, avg(toFloat(q.score)/q.total) AS avg`,
        { studentId }
      );
      const sessions = await readQuery(
        `MATCH (s:Student {id: $studentId})-[:STUDIED]->(ss:StudySession)
         WHERE ss.date > datetime() - duration('P7D')
         RETURN count(ss) AS count`,
        { studentId }
      );

      const moods = recentMoods.map(r => ({
        stress_level: r.get('stress_level') || 0,
        date: r.get('date')?.toString() || '',
      }));
      const sessionCount = sessions[0]?.get('count') || 0;
      const quizCount = quizzes[0]?.get('count') || 0;
      const avgScore = quizzes[0]?.get('avg') || 0;

      const verdict = computeStressVerdict({
        recentMoods: moods, activeSessions7Days: sessionCount,
        quizzesAttempted7Days: quizCount, avgQuizScoreStable: true,
      });
      setIsCrisis(verdict === 'CRISIS_RISK');

      const studySessions = await readQuery(
        `MATCH (s:Student {id: $studentId})-[:STUDIED]->(ss:StudySession)
         WHERE ss.date > datetime() - duration('P7D')
         RETURN sum(ss.duration_mins) AS total`,
        { studentId }
      );
      setWeekStats({
        quizzes: quizCount,
        avgScore: Math.round(avgScore * 100) || 0,
        studyMins: studySessions[0]?.get('total') || 0,
      });

      const st2 = await getGamificationStats(studentId);
      setGStats(st2);
      const activeMs = await getActiveMissions(studentId);
      setMissions(activeMs);

      // Subject states for Current Focus section
      const sStates = await getSubjectStates(studentId);
      setSubjectStates(sStates.slice(0, 6)); // Show top 6
      
    } catch (err) {
      console.error('Home data fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [studentId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setTimetableReload(t => t + 1);
    setRefreshing(false);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return tr('good_morning');
    if (hour < 17) return tr('good_afternoon');
    return tr('good_evening');
  };

  const handleViewResults = async () => {
    if (studentId) {
      try {
        const { writeQuery } = require('../../lib/neo4j');
        await writeQuery(`MATCH (s:Student {id: $studentId}) SET s.baseline_viewed = true`, { studentId });
      } catch {}
    }
    setBaselineViewed(true);
    router.push({ pathname: '/screens/BaselineTestScreen', params: { viewResults: 'true' } });
  };

  // Entrance animation
  const screenFade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(screenFade, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);

  if (loading) return <ScreenSkeleton />;

  // Hierarchical Feature Lists
  const QUICK_ACTIONS = [
    { icon: 'chatbubble-ellipses-outline', labelKey: 'feature_ask_ai', route: '/screens/AskAIScreen', color: '#7C5CFC' },
    { icon: 'newspaper-outline', labelKey: 'feature_mock', route: '/screens/MockExamScreen', color: '#F472B6' },
    { icon: 'help-circle-outline', labelKey: 'tab_quiz', route: '/(tabs)/quiz', color: '#3B8EF3' },
    { icon: 'cart-outline', labelKey: 'XP Shop', route: '/screens/ShopScreen', color: '#F5A623' },
  ];

  const STUDY_TOOLS = [
    { icon: 'bulb-outline', labelKey: 'feature_concepts', route: '/screens/ConceptExplainerScreen', color: '#FBBF24' },
    { icon: 'albums-outline', labelKey: 'feature_review', route: '/screens/ReviewDeckScreen', color: '#FB923C' },
    { icon: 'today-outline', labelKey: 'feature_schedule', route: '/screens/StudyScheduleScreen', color: '#34D399' },
    { icon: 'calendar-outline', labelKey: 'feature_calendar', route: '/screens/CalendarScreen', color: '#10B981' },
    { icon: 'reader-outline', labelKey: 'feature_notes', route: '/screens/StudyNotesScreen', color: '#A78BFA' },
    { icon: 'mic-outline', labelKey: 'feature_voice', route: '/screens/VoiceModeScreen', color: '#38BDF8' },
  ];

  const CARE_COACHING = [
    { icon: 'heart-outline', labelKey: 'feature_wellness', route: '/screens/MoodHistoryScreen', color: '#F87171' },
    { icon: 'people-outline', labelKey: 'feature_parent', route: '/screens/ParentPortalScreen', color: '#C084FC' },
    { icon: 'timer-outline', labelKey: 'feature_focus', route: '/screens/FocusTimerScreen', color: '#2DD4BF' },
    { icon: 'document-text-outline', labelKey: 'feature_grade', route: '/screens/AnswerGraderScreen', color: '#60A5FA' },
  ];

  return (
    <LinearGradient
      colors={isDark ? ['#09090C', '#070235'] : ['#F3F3F8', '#E6E6F2']}
      style={{ flex: 1 }}
    >
      <Animated.ScrollView
        style={[st.container, { opacity: screenFade }]}
        contentContainerStyle={st.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
      >
        {/* Hero Header — Flat premium styling */}
        <View style={st.hero}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
          {/* Streak Badge */}
          <View style={[
            st.streakPill,
            {
              backgroundColor: 'rgba(245, 166, 35, 0.08)',
              borderColor: 'rgba(245, 166, 35, 0.2)',
              borderWidth: StyleSheet.hairlineWidth,
            }
          ]}>
            <Ionicons name="flame" size={14} color={colors.xpGold} />
            <Text style={[st.streakText, { color: colors.xpGold, fontFamily: Fonts.bodyMedium }]}>
              {gStats?.streak || 0} {tr('day_streak')}
            </Text>
          </View>
          {/* Level Badge */}
          <View style={[
            st.streakPill,
            {
              backgroundColor: colors.accentMuted,
              borderColor: colors.accentBorder,
              borderWidth: StyleSheet.hairlineWidth,
              marginLeft: 8,
            }
          ]}>
            <Ionicons name="star" size={14} color={colors.accent} />
            <Text style={[st.streakText, { color: colors.accent, fontFamily: Fonts.bodyMedium }]}>
              {tr('level')} {gStats?.level || 1} • {gStats?.xp || 0} {tr('xp')}
            </Text>
          </View>
        </View>

        <Text style={[st.greeting, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
          {getGreeting()}, {profile?.name?.split(' ')[0] || tr('student')}
        </Text>
        <Text style={[st.greetingSub, { color: colors.textSecondary, fontFamily: Fonts.body }]}>
          {tr(focusHintKey)}
        </Text>
      </View>

      {/* Stats Cards Row — 3 separate elevated cards */}
      <View style={st.statsContainer}>
        <View style={st.statsRow}>
          {/* Study Time */}
          <View style={[st.statCard, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
            <View style={st.statHeader}>
              <Ionicons name="time-outline" size={14} color={colors.textTertiary} />
              <Text style={[st.statLabel, { color: colors.textTertiary, fontFamily: Fonts.displayMedium }]}>
                {tr('stat_time')}
              </Text>
            </View>
            <Text style={[st.statValue, { color: colors.textPrimary, fontFamily: Fonts.display }]} numberOfLines={1}>
              {Math.floor(weekStats.studyMins / 60)}<Text style={st.statUnit}>h</Text> {weekStats.studyMins % 60}<Text style={st.statUnit}>m</Text>
            </Text>
          </View>

          {/* Average Score */}
          <View style={[st.statCard, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
            <View style={st.statHeader}>
              <Ionicons name="trophy-outline" size={14} color={colors.textTertiary} />
              <Text style={[st.statLabel, { color: colors.textTertiary, fontFamily: Fonts.displayMedium }]}>
                {tr('stat_avg_score')}
              </Text>
            </View>
            <Text style={[st.statValue, { color: colors.textPrimary, fontFamily: Fonts.display }]} numberOfLines={1}>
              {weekStats.avgScore}<Text style={st.statUnit}>%</Text>
            </Text>
          </View>

          {/* Quizzes Attempted */}
          <View style={[st.statCard, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
            <View style={st.statHeader}>
              <Ionicons name="checkmark-done-outline" size={14} color={colors.textTertiary} />
              <Text style={[st.statLabel, { color: colors.textTertiary, fontFamily: Fonts.displayMedium }]}>
                {tr('stat_quizzes')}
              </Text>
            </View>
            <Text style={[st.statValue, { color: colors.textPrimary, fontFamily: Fonts.display }]} numberOfLines={1}>
              {weekStats.quizzes}
            </Text>
          </View>
        </View>
      </View>

      {/* Current Focus — Subject Cards with nested View pattern for left borders */}
      {subjectStates.length > 0 && (
        <View style={st.sectionContainer}>
          <View style={st.sectionHeaderRow}>
            <Text style={[st.sectionTitle, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
              Current Focus
            </Text>
            <Pressable onPress={() => router.push('/(tabs)/progress')}>
              <Text style={{ fontSize: 13, fontFamily: Fonts.displayMedium, color: colors.accent }}>View All</Text>
            </Pressable>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingHorizontal: 20 }}>
            {subjectStates.map(s => {
              const subColor = isDark
                ? SubjectColors[s.subject]?.dark || colors.accent
                : SubjectColors[s.subject]?.light || colors.accent;
              const progressWidth = Math.max(s.weighted_avg, 8);
              return (
                <View
                  key={s.subject}
                  style={[st.subjectCardWrapper, { borderColor: colors.borderSubtle }]}
                >
                  <View style={[st.subjectCardInner, { borderLeftColor: subColor, backgroundColor: colors.surface1 }]}>
                    <Text style={[st.subjectName, { color: colors.textPrimary, fontFamily: Fonts.displayMedium }]} numberOfLines={1}>
                      {s.subject}
                    </Text>
                    <Text style={[st.subjectStateText, { color: colors.textTertiary, fontFamily: Fonts.body }]} numberOfLines={1}>
                      {s.state === 'EMPIRICALLY_WEAK' || s.state === 'AVOIDED_AND_WEAK' ? 'Needs focus' :
                       s.state === 'ACTIVE_AND_STRONG' ? 'Going strong' :
                       s.state === 'AVOIDED_BUT_STRONG' ? 'Review soon' : 'Getting started'}
                    </Text>
                    <View style={st.progressBarTrack}>
                      <View style={[st.progressBarFill, { backgroundColor: subColor, width: `${progressWidth}%` }]} />
                    </View>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* Missions — Redesigned with nested View pattern and accent left borders */}
      {missions.length > 0 && (
        <View style={st.sectionContainer}>
          <Text style={[st.sectionTitle, { color: colors.textPrimary, fontFamily: Fonts.display, paddingHorizontal: 20 }]}>
            {tr('todays_missions')}
          </Text>
          <View style={{ paddingHorizontal: 20 }}>
            {missions.map(m => (
              <View key={m.id} style={[st.missionCardWrapper, { borderColor: colors.borderSubtle }]}>
                <View style={[st.missionCardInner, { borderLeftColor: colors.accent, backgroundColor: colors.surface1 }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ fontSize: 15, fontFamily: Fonts.displayMedium, color: colors.textPrimary }}>{m.title}</Text>
                    <Text style={{ fontSize: 13, fontFamily: Fonts.display, color: colors.accent }}>+{m.rewardXP} XP</Text>
                  </View>
                  <Text style={{ fontSize: 13, fontFamily: Fonts.body, color: colors.textSecondary, marginTop: 4 }}>{m.description}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 12 }}>
                    <View style={{ flex: 1, height: 3, backgroundColor: colors.borderSubtle, borderRadius: 2, overflow: 'hidden' }}>
                      <View style={{ height: 3, backgroundColor: colors.accent, width: `${Math.min((m.progress / m.target) * 100, 100)}%` }} />
                    </View>
                    <Text style={{ fontSize: 12, fontFamily: Fonts.bodyMedium, color: colors.textSecondary }}>{m.progress} / {m.target}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Timetable */}
      {studentId ? (
        <View style={{ marginTop: 8 }}>
          <WeeklyTimetableCard studentId={studentId} reloadTick={timetableReload} />
        </View>
      ) : null}

      {/* Exam Banner */}
      {nextExam ? (
        <View style={{ marginHorizontal: 20, marginTop: 24, borderRadius: 14, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(245, 166, 35, 0.25)' }}>
          <View style={{ borderLeftWidth: 3, borderLeftColor: colors.warning, backgroundColor: colors.surface2, padding: 16 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.warning, letterSpacing: 0.5, fontFamily: Fonts.displayMedium, textTransform: 'uppercase' }}>
              {tr('upcoming_exam')}
            </Text>
            <Text style={{ fontSize: 16, fontFamily: Fonts.display, color: colors.textPrimary, marginTop: 4 }}>{nextExam.name}</Text>
            <Text style={{ fontSize: 13, fontFamily: Fonts.body, color: colors.textSecondary, marginTop: 4 }}>
              {nextExam.days === 0 ? tr('exam_today') : `${nextExam.days} ${tr('exam_days_left')}`}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Diagnostic Banner — Redesigned with nested View pattern */}
      {!hasBaseline && (
        <View style={st.bannerWrapper}>
          <View style={[st.bannerInner, { borderLeftColor: colors.warning, backgroundColor: colors.surface2 }]}>
            <Text style={{ fontSize: 16, fontFamily: Fonts.display, color: colors.warning, marginBottom: 6 }}>
              {tr('diagnostic_recommended')}
            </Text>
            <Text style={{ fontSize: 13, fontFamily: Fonts.body, color: colors.textSecondary, marginBottom: 16 }}>
              {tr('diagnostic_desc')}
            </Text>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                router.push('/screens/BaselineTestScreen');
              }}
              style={({ pressed }) => [
                st.bannerButton,
                {
                  backgroundColor: colors.warning,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                }
              ]}
            >
              <Text style={{ color: colors.textInverse, fontFamily: Fonts.displayMedium, fontSize: 14 }}>
                {tr('take_baseline')}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {hasBaseline && !baselineViewed && (
        <View style={st.bannerWrapper}>
          <View style={[st.bannerInner, { borderLeftColor: colors.success, backgroundColor: colors.surface2 }]}>
            <Text style={{ fontSize: 16, fontFamily: Fonts.display, color: colors.success, marginBottom: 6 }}>
              {tr('diagnostic_complete')}
            </Text>
            <Text style={{ fontSize: 13, fontFamily: Fonts.body, color: colors.textSecondary, marginBottom: 16 }}>
              {tr('view_results')}
            </Text>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
                handleViewResults();
              }}
              style={({ pressed }) => [
                st.bannerButton,
                {
                  backgroundColor: colors.success,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                }
              ]}
            >
              <Text style={{ color: colors.textInverse, fontFamily: Fonts.displayMedium, fontSize: 14 }}>
                {tr('view_results')}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {isCrisis && <View style={{ paddingHorizontal: 20, marginTop: 16 }}><CrisisCard /></View>}

      {/* Mood Check-in */}
      {showMoodCheck && !isCrisis && (
        <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
          <MoodCheckIn onComplete={(quote) => { setShowMoodCheck(false); setMoodReaction(quote); fetchData(); }} />
        </View>
      )}

      {moodReaction ? (
        <View style={[st.moodReactionCard, { backgroundColor: colors.surface2, borderColor: colors.borderSubtle }]}>
          <Text style={{ fontSize: 14, color: colors.textSecondary, fontStyle: 'italic', lineHeight: 22, textAlign: 'center', fontFamily: Fonts.body }}>
            "{moodReaction}"
          </Text>
        </View>
      ) : null}

      <View style={{ paddingHorizontal: 20, marginTop: 16 }}>
        <AdaptiveNudgeCard />
      </View>

      {/* Hierarchical Feature Sections */}
      
      {/* 1. Quick Actions */}
      <View style={st.sectionContainer}>
        <Text style={[st.sectionTitle, { color: colors.textPrimary, fontFamily: Fonts.display, paddingHorizontal: 20 }]}>
          Quick Actions
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 10, paddingHorizontal: 20, paddingBottom: 4 }}
        >
          {QUICK_ACTIONS.map(action => (
            <Pressable
              key={action.labelKey}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                router.push(action.route as any);
              }}
              style={({ pressed }) => [
                st.quickActionCard,
                {
                  borderColor: colors.borderSubtle,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                }
              ]}
            >
              <View style={[st.quickActionInner, { borderLeftColor: action.color, backgroundColor: colors.surface1 }]}>
                <Ionicons name={action.icon as any} size={20} color={action.color} style={st.quickActionIcon} />
                <Text style={[st.quickActionLabel, { color: colors.textPrimary, fontFamily: Fonts.displayMedium }]}>
                  {tr(action.labelKey)}
                </Text>
              </View>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* 2. Study Tools */}
      <View style={st.sectionContainer}>
        <Text style={[st.sectionTitle, { color: colors.textPrimary, fontFamily: Fonts.display, paddingHorizontal: 20 }]}>
          Study Tools
        </Text>
        <View style={st.studyToolsGrid}>
          {STUDY_TOOLS.map(action => (
            <Pressable
              key={action.labelKey}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                router.push(action.route as any);
              }}
              style={({ pressed }) => [
                st.studyToolCard,
                {
                  backgroundColor: colors.surface1,
                  borderColor: colors.borderSubtle,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                }
              ]}
            >
              <View style={[st.studyToolIconContainer, { backgroundColor: action.color + '14' }]}>
                <Ionicons name={action.icon as any} size={18} color={action.color} />
              </View>
              <Text style={[st.studyToolLabel, { color: colors.textPrimary, fontFamily: Fonts.bodyMedium }]}>
                {tr(action.labelKey)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* 3. Care & Coaching */}
      <View style={st.sectionContainer}>
        <Text style={[st.sectionTitle, { color: colors.textPrimary, fontFamily: Fonts.display, paddingHorizontal: 20 }]}>
          Care & Coaching
        </Text>
        <View style={{ paddingHorizontal: 20 }}>
          {CARE_COACHING.map(action => (
            <Pressable
              key={action.labelKey}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                router.push(action.route as any);
              }}
              style={({ pressed }) => [
                st.careRow,
                {
                  backgroundColor: colors.surface1,
                  borderColor: colors.borderSubtle,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                }
              ]}
            >
              <View style={[st.careIconContainer, { backgroundColor: action.color + '14' }]}>
                <Ionicons name={action.icon as any} size={18} color={action.color} />
              </View>
              <Text style={[st.careLabel, { color: colors.textPrimary, fontFamily: Fonts.bodyMedium }]}>
                {tr(action.labelKey)}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textTertiary} />
            </Pressable>
          ))}
        </View>
      </View>
    </Animated.ScrollView>
    </LinearGradient>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: Platform.OS === 'ios' ? 116 : 96 },
  hero: { padding: 24, paddingTop: Platform.OS === 'ios' ? 70 : 50, paddingBottom: 16 },
  streakPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  streakText: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5 },
  greeting: { fontSize: 28, fontWeight: '600', marginBottom: 10, letterSpacing: -0.5 },
  greetingSub: { fontSize: 14, lineHeight: 22, maxWidth: '95%' },
  
  // Stats
  statsContainer: { paddingHorizontal: SW < 365 ? 12 : 20, marginTop: 12 },
  statsRow: { flexDirection: 'row', gap: SW < 365 ? 6 : 8, justifyContent: 'space-between' },
  statCard: {
    flex: 1,
    padding: SW < 365 ? 10 : 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    justifyContent: 'space-between',
    minHeight: SW < 365 ? 78 : 88,
  },
  statHeader: { flexDirection: 'row', alignItems: 'center', gap: SW < 365 ? 4 : 6, marginBottom: 4 },
  statLabel: { fontSize: SW < 365 ? 8 : 10, fontWeight: '600', textTransform: 'uppercase', letterSpacing: SW < 365 ? 0.3 : 0.77 },
  statValue: { fontSize: SW < 365 ? 18 : 22, fontWeight: '600' },
  statUnit: { fontSize: SW < 365 ? 10 : 12, fontWeight: '500' },

  // Sections
  sectionContainer: { marginTop: 16 },
  sectionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.88,
    textTransform: 'uppercase',
    marginBottom: 12,
  },

  // Focus
  subjectCardWrapper: {
    width: 140,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  subjectCardInner: {
    borderLeftWidth: 3,
    padding: 14,
    flex: 1,
    height: 92,
    justifyContent: 'space-between',
  },
  subjectName: { fontSize: 14, fontWeight: '600' },
  subjectStateText: { fontSize: 11, marginTop: -2 },
  progressBarTrack: { height: 3, backgroundColor: 'rgba(255, 255, 255, 0.08)', borderRadius: 2, overflow: 'hidden' },
  progressBarFill: { height: 3, borderRadius: 2 },

  // Missions
  missionCardWrapper: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  missionCardInner: {
    borderLeftWidth: 3,
    padding: 16,
  },

  // Banners
  bannerWrapper: {
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  bannerInner: {
    borderLeftWidth: 3,
    padding: 16,
  },
  bannerButton: {
    padding: 12,
    borderRadius: 10,
    alignItems: 'center',
  },

  // Mood
  moodReactionCard: {
    padding: 16,
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
  },

  // Quick Actions
  quickActionCard: {
    width: SW * 0.35,
    height: 88,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  quickActionInner: {
    borderLeftWidth: 4,
    padding: 12,
    flex: 1,
    justifyContent: 'space-between',
  },
  quickActionIcon: { alignSelf: 'flex-start' },
  quickActionLabel: { fontSize: 13, fontWeight: '600', lineHeight: 16 },

  // Study Tools Grid
  studyToolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 20,
    gap: 8,
  },
  studyToolCard: {
    width: (SW - 48) / 2,
    height: 88,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  studyToolIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  studyToolLabel: { fontSize: 12, fontWeight: '500' },

  // Care Rows
  careRow: {
    height: 56,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  careIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  careLabel: { flex: 1, fontSize: 13, fontWeight: '500' },
});
