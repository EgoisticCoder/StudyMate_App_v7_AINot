// Enhanced Mood check-in — stress + sleep + energy with icons, premium press scaling, and haptic feedback
import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, TextInput, ActivityIndicator, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useTheme, useAuth } from '../lib/context';
import { writeQuery } from '../lib/neo4j';
import { callGroq } from '../lib/groq';
import { STRESS_SOURCES } from '../constants/subjects';
import { v4 as uuidv4 } from 'uuid';

interface MoodCheckInProps { onComplete: (quote: string) => void; }

const MOOD_OPTIONS = [
  { level: 1, icon: 'happy-outline' as const, label: 'Great', color: '#059669' },
  { level: 2, icon: 'thumbs-up-outline' as const, label: 'Good', color: '#34D399' },
  { level: 3, icon: 'remove-circle-outline' as const, label: 'Okay', color: '#F59E0B' },
  { level: 4, icon: 'sad-outline' as const, label: 'Stressed', color: '#F97316' },
  { level: 5, icon: 'alert-circle-outline' as const, label: 'Overwhelmed', color: '#EF4444' },
];

const SLEEP_OPTIONS = [
  { value: 'great', icon: 'moon-outline' as const, label: '8h+', color: '#059669' },
  { value: 'okay', icon: 'cloudy-night-outline' as const, label: '6-8h', color: '#F59E0B' },
  { value: 'poor', icon: 'thunderstorm-outline' as const, label: '<6h', color: '#EF4444' },
];

const ENERGY_OPTIONS = [
  { value: 'high', icon: 'flash-outline' as const, label: 'High', color: '#059669' },
  { value: 'medium', icon: 'remove-outline' as const, label: 'Medium', color: '#F59E0B' },
  { value: 'low', icon: 'battery-dead-outline' as const, label: 'Low', color: '#EF4444' },
];

export function MoodCheckIn({ onComplete }: MoodCheckInProps) {
  const { colors, isDark } = useTheme();
  const { studentId } = useAuth();
  const [stress, setStress] = useState<number | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [sleep, setSleep] = useState<string | null>(null);
  const [energy, setEnergy] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);

  // Entrance animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  // Detail expand
  const expandAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 450, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  useEffect(() => {
    Animated.timing(expandAnim, {
      toValue: stress !== null ? 1 : 0,
      duration: 300,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [stress]);

  const handleSubmit = async () => {
    if (stress === null || !studentId) return;
    setLoading(true);
    try {
      await writeQuery(
        `MATCH (s:Student {id: $studentId})
         CREATE (m:MoodLog {
           id: $moodId, stress_level: $stress, source: $source, note: $note,
           sleep_quality: $sleep, energy_level: $energy, date: datetime()
         })
         CREATE (s)-[:LOGGED_MOOD]->(m)`,
        { studentId, moodId: uuidv4(), stress, source: source || '', note, sleep: sleep || '', energy: energy || '' }
      );
      let aiQuote = "Remember, every step forward counts.";
      try {
        const sleepCtx = sleep ? ` Sleep: ${sleep}.` : '';
        const energyCtx = energy ? ` Energy: ${energy}.` : '';
        aiQuote = await callGroq([
          { role: 'system', content: 'You are an empathetic study coach. Give ONE short, actionable tip based on the student\'s state. Max 2 sentences. Be warm but practical.' },
          { role: 'user', content: `Stress: ${stress}/5. Cause: ${source || 'general'}.${sleepCtx}${energyCtx}` }
        ], 'mood_quote');
      } catch {}
      
      // Play success notification haptics on successful log
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      onComplete(aiQuote);
    } catch (err) { 
      console.error('Mood log error:', err); 
    } finally { 
      setLoading(false); 
    }
  };

  return (
    <Animated.View style={[st.container, { backgroundColor: colors.surface, borderColor: colors.border, opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
        <Ionicons name="heart-outline" size={18} color={colors.primary} />
        <Text style={[st.label, { color: colors.textTertiary }]}>DAILY WELLNESS CHECK</Text>
      </View>
      <Text style={[st.title, { color: colors.text }]}>How are you feeling?</Text>

      {/* Mood selector with icons */}
      <View style={st.moodRow}>
        {MOOD_OPTIONS.map(m => {
          const isSelected = stress === m.level;
          return (
            <Pressable key={m.level} 
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                setStress(m.level);
              }}
              style={({ pressed }) => [
                st.moodBtn, 
                {
                  backgroundColor: isSelected ? m.color + '15' : colors.surfaceContainer,
                  borderColor: isSelected ? m.color : 'transparent',
                  borderWidth: isSelected ? 1.5 : 0,
                  transform: [{ scale: pressed ? 0.92 : 1 }]
                }
              ]}>
              <Ionicons name={m.icon} size={22} color={isSelected ? m.color : colors.textTertiary} />
              <Text style={{ fontSize: 9, fontWeight: '600', color: isSelected ? m.color : colors.textTertiary, marginTop: 3 }}>{m.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {stress !== null && (
        <Animated.View style={{ opacity: expandAnim, transform: [{ translateY: expandAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
          {/* Sleep */}
          <Text style={[st.sectionLabel, { color: colors.textSecondary }]}>How did you sleep?</Text>
          <View style={st.optionRow}>
            {SLEEP_OPTIONS.map(s => {
              const isActive = sleep === s.value;
              return (
                <Pressable key={s.value} 
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setSleep(s.value);
                  }}
                  style={({ pressed }) => [
                    st.optionPill, 
                    {
                      backgroundColor: isActive ? s.color + '12' : colors.surfaceContainer,
                      borderColor: isActive ? s.color : colors.border,
                      transform: [{ scale: pressed ? 0.95 : 1 }]
                    }
                  ]}>
                  <Ionicons name={s.icon} size={16} color={isActive ? s.color : colors.textTertiary} />
                  <Text style={[st.optionLabel, { color: isActive ? s.color : colors.text }]}>{s.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Energy */}
          <Text style={[st.sectionLabel, { color: colors.textSecondary }]}>Energy level?</Text>
          <View style={st.optionRow}>
            {ENERGY_OPTIONS.map(e => {
              const isActive = energy === e.value;
              return (
                <Pressable key={e.value} 
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                    setEnergy(e.value);
                  }}
                  style={({ pressed }) => [
                    st.optionPill, 
                    {
                      backgroundColor: isActive ? e.color + '12' : colors.surfaceContainer,
                      borderColor: isActive ? e.color : colors.border,
                      transform: [{ scale: pressed ? 0.95 : 1 }]
                    }
                  ]}>
                  <Ionicons name={e.icon} size={16} color={isActive ? e.color : colors.textTertiary} />
                  <Text style={[st.optionLabel, { color: isActive ? e.color : colors.text }]}>{e.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* Source */}
          <Text style={[st.sectionLabel, { color: colors.textSecondary }]}>What's on your mind?</Text>
          <View style={st.pillRow}>
            {STRESS_SOURCES.map(s => (
              <Pressable key={s} 
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
                  setSource(s);
                }}
                style={({ pressed }) => [
                  st.pill, 
                  {
                    backgroundColor: source === s ? colors.primary : colors.surfaceContainer,
                    borderColor: source === s ? colors.primary : colors.border,
                    transform: [{ scale: pressed ? 0.95 : 1 }]
                  }
                ]}>
                <Text style={[st.pillText, { color: source === s ? colors.onPrimary : colors.text }]}>{s}</Text>
              </Pressable>
            ))}
          </View>

          {/* Note */}
          <TextInput style={[st.noteInput, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surfaceContainerLow }]}
            placeholder="Add a note (optional)" placeholderTextColor={colors.textTertiary} value={note} onChangeText={setNote} multiline />

          {/* Submit */}
          <Pressable 
            onPress={handleSubmit} 
            disabled={loading}
            style={({ pressed }) => [
              st.submitBtn, 
              { 
                backgroundColor: colors.primary,
                opacity: loading ? 0.7 : 1,
                transform: [{ scale: pressed && !loading ? 0.97 : 1 }]
              }
            ]}
          >
            {loading ? <ActivityIndicator color={colors.onPrimary} /> : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Ionicons name="checkmark-circle-outline" size={18} color={colors.onPrimary} />
                <Text style={[st.submitText, { color: colors.onPrimary }]}>Log Wellness Check</Text>
              </View>
            )}
          </Pressable>
        </Animated.View>
      )}
    </Animated.View>
  );
}

const st = StyleSheet.create({
  container: { 
    borderRadius: 20, 
    borderWidth: 1, 
    padding: 24, 
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.03,
    shadowRadius: 16,
    elevation: 3,
  },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  title: { fontSize: 20, fontWeight: '700', textAlign: 'center', marginBottom: 20 },
  moodRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: 8 },
  moodBtn: { width: 54, height: 58, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  sectionLabel: { fontSize: 13, fontWeight: '600', marginBottom: 10, marginTop: 16 },
  optionRow: { flexDirection: 'row', gap: 10 },
  optionPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  optionLabel: { fontSize: 13, fontWeight: '600' },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  pillText: { fontSize: 13, fontWeight: '500' },
  noteInput: { borderWidth: 1, borderRadius: 12, padding: 12, fontSize: 14, minHeight: 50, marginBottom: 16, textAlignVertical: 'top' },
  submitBtn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  submitText: { fontSize: 15, fontWeight: '600' },
});
