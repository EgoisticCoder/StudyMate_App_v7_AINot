// CONCEPT EXPLAINER — Student types any concept, AI explains with structure
import React, { useState, useEffect } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput, StyleSheet,
  Platform, ActivityIndicator, Animated, Easing,
} from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useAuth } from '../../lib/context';
import { buildStudentContext, getStudentProfile } from '../../lib/adaptiveEngine';
import { callGroq } from '../../lib/ai';
import { writeQuery } from '../../lib/neo4j';
import { SUBJECTS } from '../../constants/subjects';
import { v4 as uuidv4 } from 'uuid';
import { MarkdownView } from '../../components/MarkdownView';
import { Chip, SectionLabel } from '../../components/ui/premium';
import { Fonts } from '../../constants/fonts';

export default function ConceptExplainerScreen() {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  const [subject, setSubject] = useState('');
  const [concept, setConcept] = useState('');
  const [explanation, setExplanation] = useState('');
  const [practiceQuestions, setPracticeQuestions] = useState('');
  const [loading, setLoading] = useState(false);
  const [board, setBoard] = useState('ICSE');
  const [classNum, setClassNum] = useState(10);

  useEffect(() => {
    (async () => {
      if (!studentId) return;
      const profile = await getStudentProfile(studentId);
      if (profile) { setBoard(profile.board); setClassNum(profile.class); }
    })();
  }, [studentId]);

  const handleExplain = async () => {
    if (!concept.trim() || !studentId) return;
    setLoading(true);
    setExplanation('');
    setPracticeQuestions('');
    try {
      const context = await buildStudentContext(studentId);
      const result = await callGroq(
        [
          { role: 'system', content: `You are an expert ${board} tutor for Class ${classNum}. ${context}` },
          {
            role: 'user',
            content: `Explain the concept "${concept}" for ${subject || 'General'}, ${board} Class ${classNum}.

Format exactly as:
WHAT IS IT:
(Simple, age-appropriate definition in 2-3 sentences)

HOW IT WORKS:
(Step-by-step mechanism or process, numbered)

REAL-LIFE EXAMPLE (INDIA):
(One relatable Indian context example)

KEY FORMULA / RULE:
(The core formula or rule to memorize, if applicable)

COMMON EXAM MISTAKES:
(2-3 mistakes students make in board exams)

---
PRACTICE QUESTIONS:
1. (Application-based question)
2. (Conceptual question)
3. (Tricky board-style question)

Be concise. Reference the student's weak areas if this concept connects to them.`,
          },
        ],
        'concept_explainer'
      );

      // Split explanation and practice questions
      const parts = result.split('PRACTICE QUESTIONS:');
      setExplanation(parts[0]?.trim() || result);
      setPracticeQuestions(parts[1]?.trim() || '');

      // Log study session
      await writeQuery(
        `MATCH (s:Student {id: $studentId})
         CREATE (ss:StudySession {
           id: $id, subject: $subject, chapter: $concept,
           duration_mins: 5, session_type: 'concept_explainer', date: datetime()
         })
         CREATE (s)-[:STUDIED]->(ss)`,
        { studentId, id: uuidv4(), subject: subject || 'General', concept }
      );
    } catch (err: any) {
      setExplanation(err.message || 'Failed to explain concept');
    } finally {
      setLoading(false);
    }
  };

  // Animations
  const screenFade = React.useRef(new Animated.Value(0)).current;
  const resultFade = React.useRef(new Animated.Value(0)).current;
  const resultSlide = React.useRef(new Animated.Value(24)).current;

  React.useEffect(() => {
    Animated.timing(screenFade, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);

  React.useEffect(() => {
    if (explanation) {
      resultFade.setValue(0);
      resultSlide.setValue(24);
      Animated.parallel([
        Animated.timing(resultFade, { toValue: 1, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(resultSlide, { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]).start();
    }
  }, [explanation]);

  return (
    <Animated.ScrollView
      style={[styles.container, { backgroundColor: colors.background, opacity: screenFade }]}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      {/* Header back button */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary, fontFamily: Fonts.display }]}>Concept Explainer</Text>
        <View style={{ width: 32 }} />
      </View>

      <Text style={[styles.subtitle, { color: colors.textSecondary, fontFamily: Fonts.body }]}>
        Type any concept and get a structured explanation with practice questions
      </Text>

      {/* Subject selector */}
      <SectionLabel text="Subject (Optional)" style={{ marginBottom: 12 }} />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }} contentContainerStyle={{ gap: 8, paddingBottom: 4 }}>
        {SUBJECTS.map(s => (
          <Chip
            key={s.name}
            label={s.name}
            selected={subject === s.name}
            onPress={() => setSubject(subject === s.name ? '' : s.name)}
          />
        ))}
      </ScrollView>

      {/* Concept input area */}
      <View style={[styles.inputArea, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}>
        <TextInput
          style={[styles.conceptInput, { color: colors.textPrimary, fontFamily: Fonts.body }]}
          placeholder='e.g. "Photosynthesis", "Quadratic Equations", "Mughal Architecture"'
          placeholderTextColor={colors.textTertiary}
          value={concept}
          onChangeText={setConcept}
          multiline
        />
        <TouchableOpacity
          style={[
            styles.explainBtn, 
            { backgroundColor: concept.trim() ? colors.accent : colors.surface3 }
          ]}
          onPress={handleExplain}
          disabled={loading || !concept.trim()}
        >
          {loading ? (
            <ActivityIndicator color={colors.textInverse} size="small" />
          ) : (
            <>
              <Ionicons name="sparkles" size={16} color={concept.trim() ? colors.textInverse : colors.textTertiary} />
              <Text style={[styles.explainText, { color: concept.trim() ? colors.textInverse : colors.textTertiary, fontFamily: Fonts.display }]}>
                Explain
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Explanation Result Card */}
      {explanation ? (
        <Animated.View style={[styles.resultCard, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle, opacity: resultFade, transform: [{ translateY: resultSlide }] }]}>
          <View style={styles.resultHeader}>
            <Ionicons name="bulb-outline" size={18} color={colors.accent} />
            <Text style={[styles.resultTitle, { color: colors.accent, fontFamily: Fonts.display }]}>Explanation</Text>
          </View>
          <MarkdownView content={explanation} />
        </Animated.View>
      ) : null}

      {/* Practice Questions Result Card — left border accent styling */}
      {practiceQuestions ? (
        <Animated.View style={[styles.practiceWrapper, { borderColor: colors.borderSubtle, opacity: resultFade, transform: [{ translateY: resultSlide }] }]}>
          <View style={[styles.practiceInner, { borderLeftColor: colors.accent, backgroundColor: colors.surface1 }]}>
            <View style={styles.resultHeader}>
              <Ionicons name="help-circle-outline" size={18} color={colors.accent} />
              <Text style={[styles.resultTitle, { color: colors.accent, fontFamily: Fonts.display }]}>Practice Questions</Text>
            </View>
            <MarkdownView content={practiceQuestions} />
          </View>
        </Animated.View>
      ) : null}
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingTop: Platform.OS === 'ios' ? 60 : 40, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  backBtn: { padding: 4 },
  title: { fontSize: 22, fontWeight: '600', letterSpacing: -0.4 },
  subtitle: { fontSize: 14, marginBottom: 24, lineHeight: 22 },
  inputArea: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 16, marginBottom: 20 },
  conceptInput: { minHeight: 60, fontSize: 15, lineHeight: 22, marginBottom: 12 },
  explainBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 8, paddingVertical: 12, borderRadius: 12,
  },
  explainText: { fontSize: 14, fontWeight: '600' },
  resultCard: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 20, marginBottom: 16 },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
  resultTitle: { fontSize: 14, fontWeight: '600' },
  practiceWrapper: {
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    marginBottom: 16,
  },
  practiceInner: {
    borderLeftWidth: 3,
    padding: 20,
  },
});
