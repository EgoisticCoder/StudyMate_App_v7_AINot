// QUIZ SCREEN — Redesigned with premium chips, difficulty options, question counts,
// custom chapter dots, and chapter counters.
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { View, Text, ScrollView, StyleSheet, Animated, Easing, Pressable, Platform } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useAuth } from '../../lib/context';
import { useT } from '../../lib/translations';
import { getStudentProfile } from '../../lib/adaptiveEngine';
import { readQuery } from '../../lib/neo4j';
import { SUBJECTS } from '../../constants/subjects';
import { getChaptersForSubject } from '../../constants/chapters';
import { ScreenHero, SectionLabel, PrimaryButton, Chip, AnimatedScreenWrapper } from '../../components/ui/premium';
import { Fonts } from '../../constants/fonts';
import { SubjectColors } from '../../constants/colors';

export default function QuizScreen() {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  const tr = useT();
  const [subject, setSubject] = useState<string | null>(null);
  const [chapter, setChapter] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  const [count, setCount] = useState(5);
  const [chapters, setChapters] = useState<string[]>([]);
  const [board, setBoard] = useState('ICSE');
  const [classNum, setClassNum] = useState(10);
  const [patternFilter, setPatternFilter] = useState<string>('all');
  const [detectedWeakPatterns, setDetectedWeakPatterns] = useState<string[]>([]);

  // Animations
  const chapterFade = useRef(new Animated.Value(0)).current;
  const chapterSlide = useRef(new Animated.Value(16)).current;

  const PATTERN_OPTIONS = useMemo(() => [
    { key: 'all', labelKey: 'pattern_all', icon: 'grid-outline' as const },
    { key: 'weak', labelKey: 'pattern_weak', icon: 'alert-circle-outline' as const },
    { key: 'recall', labelKey: 'pattern_recall', icon: 'book-outline' as const },
    { key: 'conceptual', labelKey: 'pattern_conceptual', icon: 'bulb-outline' as const },
    { key: 'application', labelKey: 'pattern_application', icon: 'flask-outline' as const },
  ], []);

  const DIFFICULTIES = useMemo(() => [
    { key: 'Easy' as const, labelKey: 'easy' },
    { key: 'Medium' as const, labelKey: 'medium' },
    { key: 'Hard' as const, labelKey: 'hard' },
  ], []);

  useEffect(() => {
    (async () => {
      if (!studentId) return;
      const profile = await getStudentProfile(studentId);
      if (profile) { setBoard(profile.board); setClassNum(profile.class); }
      try {
        const recs = await readQuery(
          `MATCH (s:Student {id: $studentId})-[:TOOK_DIAGNOSTIC]->(r:DiagnosticRun)
           WHERE r.weak_patterns_json IS NOT NULL
           RETURN r.weak_patterns_json AS wp ORDER BY r.completed_at DESC LIMIT 1`,
          { studentId }
        );
        if (recs.length > 0) setDetectedWeakPatterns(JSON.parse(recs[0].get('wp') || '[]'));
      } catch {}
    })();
  }, [studentId]);

  useEffect(() => {
    if (subject) {
      setChapters(getChaptersForSubject(subject, board, classNum));
      setChapter(null);
      // Animate chapter list in
      chapterFade.setValue(0);
      chapterSlide.setValue(16);
      Animated.parallel([
        Animated.timing(chapterFade, { toValue: 1, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(chapterSlide, { toValue: 0, duration: 350, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }
  }, [subject, board, classNum]);

  const canStart = subject && chapter;
  const handleStart = () => {
    if (!canStart) return;
    router.push({
      pathname: '/screens/QuizPlayScreen',
      params: {
        subject: subject!, chapter: chapter!, difficulty, count: String(count), board, classNum: String(classNum),
        patternFilter: patternFilter === 'weak' ? detectedWeakPatterns.join(',') : patternFilter === 'all' ? '' : patternFilter,
      },
    });
  };

  const selectedChapterIndex = chapter ? chapters.indexOf(chapter) : -1;
  const counterText = selectedChapterIndex >= 0
    ? `${selectedChapterIndex + 1} of ${chapters.length} chapters selected`
    : `${chapters.length} chapters available`;

  const subjectColor = subject
    ? (isDark ? SubjectColors[subject]?.dark : SubjectColors[subject]?.light) || colors.accent
    : colors.accent;

  return (
    <AnimatedScreenWrapper>
      <ScrollView style={[st.container, { backgroundColor: colors.background }]} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
        <ScreenHero title={tr('take_quiz')} subtitle={tr('quiz_sub')} />

        <View style={st.body}>
          {/* Subject Selector */}
          <SectionLabel text={tr('select_subject')} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.horizontalScroll}>
            <View style={st.pillRow}>
              {SUBJECTS.map(s => (
                <Chip
                  key={s.name}
                  label={s.name}
                  selected={subject === s.name}
                  onPress={() => setSubject(s.name)}
                />
              ))}
            </View>
          </ScrollView>

          {/* Chapter Selector */}
          {subject && (
            <Animated.View style={{ opacity: chapterFade, transform: [{ translateY: chapterSlide }] }}>
              <SectionLabel text={tr('target_chapter')} />
              <View style={[st.chapterList, { borderColor: colors.borderSubtle, backgroundColor: colors.surface1 }]}>
                <ScrollView style={{ maxHeight: 200 }} nestedScrollEnabled>
                  {chapters.map((ch, i) => (
                    <Pressable
                      key={ch}
                      style={({ pressed }) => [
                        st.chapterItem,
                        {
                          backgroundColor: chapter === ch ? colors.surface2 : 'transparent',
                          borderBottomColor: colors.borderSubtle,
                          opacity: pressed ? 0.8 : 1,
                        }
                      ]}
                      onPress={() => setChapter(ch)}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                        <View style={[st.chapterIndex, { backgroundColor: chapter === ch ? colors.accent : colors.surface3 }]}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: chapter === ch ? colors.textInverse : colors.textTertiary, fontFamily: Fonts.bodyMedium }}>
                            {i + 1}
                          </Text>
                        </View>
                        {chapter === ch && (
                          <View style={[st.chapterDot, { backgroundColor: subjectColor }]} />
                        )}
                        <Text style={[st.chapterText, { color: chapter === ch ? colors.textPrimary : colors.textSecondary, fontFamily: Fonts.body }]} numberOfLines={1}>
                          {ch}
                        </Text>
                      </View>
                      {chapter === ch && <Ionicons name="checkmark-circle" size={20} color={colors.accent} />}
                    </Pressable>
                  ))}
                </ScrollView>
              </View>
              <Text style={[st.chapterCounter, { color: colors.textTertiary, fontFamily: Fonts.body }]}>
                {counterText}
              </Text>
            </Animated.View>
          )}

          {/* Difficulty Selector */}
          <SectionLabel text={tr('difficulty')} style={{ marginTop: 20 }} />
          <View style={st.diffRow}>
            {DIFFICULTIES.map(d => (
              <View key={d.key} style={{ flex: 1 }}>
                <Chip
                  label={tr(d.labelKey)}
                  selected={difficulty === d.key}
                  onPress={() => setDifficulty(d.key)}
                />
              </View>
            ))}
          </View>

          {/* Question Count */}
          <SectionLabel text={tr('questions')} style={{ marginTop: 20 }} />
          <View style={st.countRow}>
            {[5, 10, 15, 20].map(n => (
              <View key={n} style={{ flex: 1 }}>
                <Chip
                  label={String(n)}
                  selected={count === n}
                  onPress={() => setCount(n)}
                />
              </View>
            ))}
          </View>

          {/* Pattern Selector */}
          <SectionLabel text={tr('pattern')} style={{ marginTop: 20 }} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.horizontalScroll}>
            <View style={st.pillRow}>
              {PATTERN_OPTIONS.map(p => {
                const isActive = patternFilter === p.key;
                const isDisabled = p.key === 'weak' && detectedWeakPatterns.length === 0;
                return (
                  <Chip
                    key={p.key}
                    label={tr(p.labelKey)}
                    selected={isActive}
                    onPress={() => setPatternFilter(p.key)}
                    disabled={isDisabled}
                    icon={<Ionicons name={p.icon} size={14} color={isActive ? colors.accentHover : colors.textTertiary} />}
                  />
                );
              })}
            </View>
          </ScrollView>

          <PrimaryButton
            label={tr('start_quiz')}
            onPress={handleStart}
            disabled={!canStart}
            icon={<Ionicons name="play" size={20} color={colors.textInverse} />}
          />
        </View>
      </ScrollView>
    </AnimatedScreenWrapper>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: Platform.OS === 'ios' ? 100 : 80 },
  body: { padding: 20 },
  horizontalScroll: { paddingBottom: 4 },
  pillRow: { flexDirection: 'row', gap: 8 },
  chapterList: { borderWidth: StyleSheet.hairlineWidth, borderRadius: 14, overflow: 'hidden' },
  chapterItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  chapterText: { fontSize: 14, flex: 1 },
  chapterIndex: { width: 24, height: 24, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  chapterDot: { width: 6, height: 6, borderRadius: 3, marginRight: -4 },
  chapterCounter: { fontSize: 12, marginTop: 8, paddingLeft: 4 },
  diffRow: { flexDirection: 'row', gap: 8 },
  countRow: { flexDirection: 'row', gap: 8 },
});
