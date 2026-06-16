// Adaptive nudge card — AI-generated daily nudge from buildStudentContext()
// Redesigned: accent-muted bg, accent-border, borderRadius 14

import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, useAuth } from '../lib/context';
import { buildStudentContext } from '../lib/adaptiveEngine';
import { callGroq } from '../lib/ai';
import { LoadingSkeleton } from './LoadingSkeleton';
import { Radii } from '../constants/colors';
import { Fonts } from '../constants/fonts';

export function AdaptiveNudgeCard() {
  const { colors } = useTheme();
  const { studentId } = useAuth();
  const [nudge, setNudge] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchNudge = async () => {
    if (!studentId) return;
    setLoading(true);
    setError(false);
    try {
      const context = await buildStudentContext(studentId);
      const response = await callGroq(
        [
          {
            role: 'system',
            content: `You are StudyMate AI, an adaptive study assistant. ${context}`,
          },
          {
            role: 'user',
            content:
              'Generate a single, specific, actionable nudge for this student for today. Max 2 sentences. Reference their actual weak subject by name. If they have been inactive, be direct. If they are stressed and studying hard, be warm. Do not be generic.',
          },
        ],
        'ai_nudge'
      );
      setNudge(response.trim());
    } catch (err) {
      console.error('Nudge fetch failed:', err);
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNudge();
  }, [studentId]);

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.accentMuted, borderColor: colors.accentBorder }]}>
        <LoadingSkeleton width="80%" height={16} />
        <LoadingSkeleton width="100%" height={14} style={{ marginTop: 10 }} />
      </View>
    );
  }

  if (error) {
    return (
      <TouchableOpacity
        style={[styles.container, { backgroundColor: colors.surface1, borderColor: colors.borderSubtle }]}
        onPress={fetchNudge}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="refresh-outline" size={20} color={colors.textTertiary} />
          <Text style={[styles.errorText, { color: colors.textTertiary, fontFamily: Fonts.body }]}>
            AI is taking too long — tap to retry
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.accentMuted, borderColor: colors.accentBorder }]}>
      <View style={styles.header}>
        <Ionicons name="sparkles" size={18} color={colors.accent} />
        <Text style={[styles.headerText, { color: colors.accent, fontFamily: Fonts.bodyMedium }]}>
          AI Nudge
        </Text>
      </View>
      <Text style={[styles.nudgeText, { color: colors.textPrimary, fontFamily: Fonts.body }]}>
        {nudge}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: Radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 18,
    marginBottom: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  headerText: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  nudgeText: {
    fontSize: 14,
    lineHeight: 22.4,
    fontWeight: '400',
  },
  errorText: {
    fontSize: 14,
    marginLeft: 8,
  },
});
