// LEARN SCREEN — Stitch design: animated subject grid with staggered entrance
import React, { useState, useEffect } from 'react';
import { View, ScrollView, StyleSheet, Animated, Easing, Platform } from 'react-native';
import { router } from 'expo-router';
import { useTheme, useAuth } from '../../lib/context';
import { useT } from '../../lib/translations';
import { getSubjectStates, SubjectState } from '../../lib/adaptiveEngine';
import { SUBJECTS } from '../../constants/subjects';
import { SubjectCard } from '../../components/SubjectCard';
import { ScreenSkeleton } from '../../components/LoadingSkeleton';
import { ScreenHero, AnimatedScreenWrapper } from '../../components/ui/premium';

export default function LearnScreen() {
  const { colors } = useTheme();
  const { studentId } = useAuth();
  const tr = useT();
  const [states, setStates] = useState<SubjectState[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (!studentId) return;
      try { setStates(await getSubjectStates(studentId)); }
      catch (err) { console.error('Failed to load subject states:', err); }
      finally { setLoading(false); }
    })();
  }, [studentId]);

  if (loading) return <ScreenSkeleton />;

  const getSubjectState = (name: string) => states.find(s => s.subject === name);

  return (
    <AnimatedScreenWrapper>
      <ScrollView
        style={[st.container, { backgroundColor: colors.background }]}
        contentContainerStyle={st.content}
        showsVerticalScrollIndicator={false}
      >
        <ScreenHero title={tr('subjects')} subtitle={tr('subjects_sub')} />
        <View style={st.grid}>
          {SUBJECTS.map((subject, index) => {
            const state = getSubjectState(subject.name);
            return (
              <SubjectCard
                key={subject.name}
                name={subject.name}
                icon={subject.icon}
                index={index}
                state={state?.state}
                weighted_avg={state?.weighted_avg}
                onPress={() => router.push({ pathname: '/screens/ChapterDetailScreen', params: { subject: subject.name } })}
              />
            );
          })}
        </View>
      </ScrollView>
    </AnimatedScreenWrapper>
  );
}

const st = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: Platform.OS === 'ios' ? 100 : 80 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', padding: 16 },
});
