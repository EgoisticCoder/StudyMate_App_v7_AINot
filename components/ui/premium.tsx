// Shared UI primitives — redesigned for premium dark mode aesthetic
// Surface-based elevation, no shadows, no glass, no gradients
// Electric violet accent, consistent border-radius, hairline borders

import React, { ReactNode, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ViewStyle, TextStyle, Platform,
  Animated, Pressable, Easing, StyleProp,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../../lib/context';
import { Fonts } from '../../constants/fonts';
import { Radii, Spacing } from '../../constants/colors';

// ─── ScreenHero ──────────────────────────────────────────────────────
// Flat background header — no gradient, no border-radius
interface ScreenHeroProps {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}

export function ScreenHero({ title, subtitle, children }: ScreenHeroProps) {
  const { colors, isDark } = useTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1, duration: 200,
        easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0, duration: 200,
        easing: Easing.out(Easing.cubic), useNativeDriver: true,
      }),
    ]).start();
  }, [fadeAnim, slideAnim]);

  return (
    <View style={[heroStyles.wrap, { backgroundColor: colors.background }]}>
      <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
        <Text style={[heroStyles.title, { color: colors.textPrimary, fontFamily: Fonts.display }]}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={[heroStyles.sub, { color: colors.textSecondary, fontFamily: Fonts.body }]}>
            {subtitle}
          </Text>
        ) : null}
        {children}
      </Animated.View>
    </View>
  );
}

// ─── SurfaceCard ─────────────────────────────────────────────────────
// Replaces GlassCard — surface1 bg, hairline border, no shadows
interface SurfaceCardProps {
  children: ReactNode;
  style?: ViewStyle;
  onPress?: () => void;
  delay?: number;
  elevated?: boolean; // uses surface2 instead of surface1
}

export function SurfaceCard({ children, style, onPress, delay = 0, elevated = false }: SurfaceCardProps) {
  const { colors } = useTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1, duration: 250,
          easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0, duration: 250,
          easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }),
      ]).start();
    }, delay);
    return () => clearTimeout(timer);
  }, [delay, fadeAnim, slideAnim]);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, { toValue: 0.97, tension: 100, friction: 6, useNativeDriver: true }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, { toValue: 1, tension: 100, friction: 6, useNativeDriver: true }).start();
  };

  const handlePress = () => {
    if (onPress) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      onPress();
    }
  };

  const inner = (
    <Animated.View style={[
      cardStyles.card,
      {
        backgroundColor: elevated ? colors.surface2 : colors.surface1,
        borderColor: colors.borderSubtle,
        opacity: fadeAnim,
        transform: [{ scale: scaleAnim }, { translateY: slideAnim }],
      },
      style
    ]}>
      {children}
    </Animated.View>
  );

  if (onPress) {
    return (
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
      >
        {inner}
      </Pressable>
    );
  }
  return inner;
}

// Legacy alias — so existing code using GlassCard doesn't break immediately
export const GlassCard = SurfaceCard;

// ─── AnimatedCard ────────────────────────────────────────────────────
interface AnimatedCardProps {
  children: ReactNode;
  delay?: number;
  style?: ViewStyle;
}

export function AnimatedCard({ children, delay = 0, style }: AnimatedCardProps) {
  const { colors } = useTheme();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1, duration: 250,
          easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0, duration: 250,
          easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }),
      ]).start();
    }, delay);
    return () => clearTimeout(timer);
  }, [delay, fadeAnim, slideAnim]);

  return (
    <Animated.View style={[
      {
        backgroundColor: colors.surface1,
        borderColor: colors.borderSubtle,
        borderWidth: StyleSheet.hairlineWidth,
        borderRadius: Radii.card,
        padding: Spacing.cardPaddingLg,
        marginBottom: 12,
        opacity: fadeAnim,
        transform: [{ translateY: slideAnim }],
      },
      style,
    ]}>
      {children}
    </Animated.View>
  );
}

// ─── AnimatedRow ─────────────────────────────────────────────────────
interface AnimatedRowProps {
  children: ReactNode;
  index?: number;
  style?: ViewStyle;
}

export function AnimatedRow({ children, index = 0, style }: AnimatedRowProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    const delay = index * 60;
    const timer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1, duration: 250,
          easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }),
        Animated.timing(slideAnim, {
          toValue: 0, duration: 250,
          easing: Easing.out(Easing.cubic), useNativeDriver: true,
        }),
      ]).start();
    }, delay);
    return () => clearTimeout(timer);
  }, [index, fadeAnim, slideAnim]);

  return (
    <Animated.View style={[{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }, style]}>
      {children}
    </Animated.View>
  );
}

// ─── AnimatedScreenWrapper ───────────────────────────────────────────
export function AnimatedScreenWrapper({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1, duration: 200,
      easing: Easing.out(Easing.cubic), useNativeDriver: true,
    }).start();
  }, [fadeAnim]);

  return (
    <Animated.View style={[{ flex: 1, opacity: fadeAnim }, style]}>
      {children}
    </Animated.View>
  );
}

// ─── SectionLabel ────────────────────────────────────────────────────
// 11px, weight 600, letter-spacing 0.08em, UPPERCASE
export function SectionLabel({ text, style }: { text: string; style?: TextStyle }) {
  const { colors } = useTheme();
  return (
    <Text style={[cardStyles.sectionLabel, { color: colors.textTertiary, fontFamily: Fonts.bodyMedium }, style]}>
      {text}
    </Text>
  );
}

// ─── Chip ────────────────────────────────────────────────────────────
// Unselected: transparent bg, border-medium. Selected: accent-muted bg, accent-border.
interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: ReactNode;
  disabled?: boolean;
}

export function Chip({ label, selected, onPress, icon, disabled = false }: ChipProps) {
  const { colors } = useTheme();

  return (
    <Pressable
      onPress={() => {
        if (!disabled) {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
          onPress();
        }
      }}
      disabled={disabled}
      style={({ pressed }) => [
        chipStyles.chip,
        {
          backgroundColor: selected ? colors.accentMuted : 'transparent',
          borderColor: selected ? colors.accentBorder : colors.borderMedium,
          opacity: disabled ? 0.4 : 1,
          transform: [{ scale: pressed && !disabled ? 0.96 : 1 }],
        }
      ]}
    >
      {icon && <View style={{ marginRight: 6 }}>{icon}</View>}
      <Text style={[
        chipStyles.chipText,
        {
          color: selected ? colors.accentHover : colors.textSecondary,
          fontFamily: Fonts.bodyMedium,
        }
      ]}>
        {label}
      </Text>
    </Pressable>
  );
}

// ─── PrimaryButton ───────────────────────────────────────────────────
// Flat accent bg, no gradient. Disabled: surface3 + textTertiary, NOT opacity.
export function PrimaryButton({
  label, onPress, disabled, icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  icon?: ReactNode;
}) {
  const { colors } = useTheme();
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    if (disabled) return;
    Animated.spring(scaleAnim, { toValue: 0.97, tension: 120, friction: 7, useNativeDriver: true }).start();
  };

  const handlePressOut = () => {
    if (disabled) return;
    Animated.spring(scaleAnim, { toValue: 1, tension: 120, friction: 7, useNativeDriver: true }).start();
  };

  const handlePress = () => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    onPress();
  };

  return (
    <Pressable
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={handlePress}
      disabled={disabled}
    >
      <Animated.View style={[
        btnStyles.primary,
        {
          backgroundColor: disabled ? colors.surface3 : colors.accent,
          borderWidth: disabled ? StyleSheet.hairlineWidth : 0,
          borderColor: disabled ? colors.borderSubtle : 'transparent',
          transform: [{ scale: scaleAnim }],
        },
      ]}>
        {icon && <View style={{ marginRight: 8 }}>{icon}</View>}
        <Text style={[
          btnStyles.primaryText,
          {
            color: disabled ? colors.textTertiary : colors.textInverse,
            fontFamily: Fonts.display,
          }
        ]}>
          {label}
        </Text>
      </Animated.View>
    </Pressable>
  );
}

// ─── CardTitle ────────────────────────────────────────────────────────
export function CardTitle({ text, style }: { text: string; style?: TextStyle }) {
  const { colors } = useTheme();
  return (
    <Text style={[{
      fontSize: 16, fontWeight: '600', color: colors.textPrimary,
      letterSpacing: -0.2, marginBottom: 16, fontFamily: Fonts.display,
    }, style]}>
      {text}
    </Text>
  );
}

// ─── EmptyState ──────────────────────────────────────────────────────
// For charts/lists with no data — icon + heading + body + optional CTA
interface EmptyStateProps {
  icon: ReactNode;
  heading: string;
  body: string;
  cta?: { label: string; onPress: () => void };
}

export function EmptyState({ icon, heading, body, cta }: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <View style={emptyStyles.container}>
      <View style={{ marginBottom: 8 }}>{icon}</View>
      <Text style={[emptyStyles.heading, { color: colors.textSecondary, fontFamily: Fonts.bodyMedium }]}>
        {heading}
      </Text>
      <Text style={[emptyStyles.body, { color: colors.textTertiary, fontFamily: Fonts.body }]}>
        {body}
      </Text>
      {cta && (
        <Pressable
          onPress={cta.onPress}
          style={({ pressed }) => [
            emptyStyles.ctaBtn,
            {
              borderColor: colors.borderMedium,
              opacity: pressed ? 0.7 : 1,
            }
          ]}
        >
          <Text style={[emptyStyles.ctaText, { color: colors.textSecondary, fontFamily: Fonts.bodyMedium }]}>
            {cta.label}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// ─── usePremium (legacy compat — returns empty object) ───────────────
export function usePremium() {
  const { colors, isDark } = useTheme();
  // Legacy compatibility — returns token-like object that maps to new system
  return {
    glassBg: isDark ? colors.surface1 : colors.surface1,
    glassBorder: colors.borderSubtle,
    gradientStart: colors.background,
    gradientEnd: colors.background,
    gradientAccentStart: colors.accent,
    gradientAccentEnd: colors.accentHover,
    cardShadowColor: 'transparent',
    cardShadowOpacity: 0,
    cardShadowRadius: 0,
    cardShadowOffset: { width: 0, height: 0 },
    shimmer: isDark ? colors.surface2 : colors.surface3,
    buttonGradientStart: colors.accent,
    buttonGradientEnd: colors.accent,
    successGradientStart: colors.success,
    successGradientEnd: colors.success,
    warningGradientStart: colors.warning,
    warningGradientEnd: colors.warning,
    errorGradientStart: colors.danger,
    errorGradientEnd: colors.danger,
  };
}

// ─── Styles ──────────────────────────────────────────────────────────

const heroStyles = StyleSheet.create({
  wrap: {
    paddingTop: Platform.OS === 'ios' ? 68 : 48,
    paddingBottom: 24,
    paddingHorizontal: Spacing.pageHorizontal,
  },
  title: {
    fontSize: 28,
    fontWeight: '600',
    lineHeight: 33.6,
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  sub: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 22.4,
  },
});

const cardStyles = StyleSheet.create({
  card: {
    borderRadius: Radii.card,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.cardPadding,
    marginBottom: 8,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.88,
    marginBottom: 8,
    marginTop: 16,
    textTransform: 'uppercase',
  },
});

const chipStyles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.chipPaddingH,
    paddingVertical: Spacing.chipPaddingV,
    borderRadius: Radii.chip,
    borderWidth: StyleSheet.hairlineWidth,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
  },
});

const btnStyles = StyleSheet.create({
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: Radii.button,
    marginTop: 24,
    paddingHorizontal: 24,
  },
  primaryText: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.15,
  },
});

const emptyStyles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    paddingHorizontal: 20,
  },
  heading: {
    fontSize: 14,
    fontWeight: '500',
    marginTop: 8,
    textAlign: 'center',
  },
  body: {
    fontSize: 13,
    fontWeight: '400',
    marginTop: 4,
    textAlign: 'center',
  },
  ctaBtn: {
    marginTop: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: Radii.chip,
    borderWidth: StyleSheet.hairlineWidth,
  },
  ctaText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
