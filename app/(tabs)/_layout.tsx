// Tab layout — Frosted glass tab bar with localized labels

import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../lib/context';
import { useT } from '../../lib/translations';
import { Platform, View, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';

function TabIcon({
  focused,
  color,
  activeName,
  inactiveName,
}: {
  focused: boolean;
  color: string;
  activeName: keyof typeof Ionicons.glyphMap;
  inactiveName: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={tabStyles.iconWrap}>
      {focused && <View style={[tabStyles.pillIndicator, { backgroundColor: color }]} />}
      <Ionicons name={focused ? activeName : inactiveName} size={22} color={color} />
    </View>
  );
}

export default function TabLayout() {
  const { colors, isDark } = useTheme();
  const tr = useT();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: {
          position: 'absolute',
          bottom: Platform.OS === 'ios' ? 28 : 16,
          left: 16,
          right: 16,
          backgroundColor: 'transparent',
          borderRadius: 32,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: colors.tabBarBorder,
          borderTopWidth: 0,
          paddingBottom: 8,
          paddingTop: 8,
          height: 64,
          elevation: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: isDark ? 0.35 : 0.08,
          shadowRadius: 8,
        },
        tabBarBackground: () => (
          <BlurView
            intensity={85}
            tint={isDark ? 'dark' : 'light'}
            style={[StyleSheet.absoluteFill, { borderRadius: 32, overflow: 'hidden' }]}
          />
        ),
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.4,
          marginTop: 0,
        },
        tabBarItemStyle: { paddingTop: 4 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: tr('tab_home'),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon focused={focused} color={color} activeName="home" inactiveName="home-outline" />
          ),
        }}
      />
      <Tabs.Screen
        name="learn"
        options={{
          title: tr('tab_learn'),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon focused={focused} color={color} activeName="book" inactiveName="book-outline" />
          ),
        }}
      />
      <Tabs.Screen
        name="quiz"
        options={{
          title: tr('tab_quiz'),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon focused={focused} color={color} activeName="help-circle" inactiveName="help-circle-outline" />
          ),
        }}
      />
      <Tabs.Screen
        name="progress"
        options={{
          title: tr('tab_progress'),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon focused={focused} color={color} activeName="bar-chart" inactiveName="bar-chart-outline" />
          ),
        }}
      />
      <Tabs.Screen
        name="leaderboard"
        options={{
          title: tr('tab_compete'),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon focused={focused} color={color} activeName="trophy" inactiveName="trophy-outline" />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: tr('tab_profile'),
          tabBarIcon: ({ focused, color }) => (
            <TabIcon focused={focused} color={color} activeName="person" inactiveName="person-outline" />
          ),
        }}
      />
    </Tabs>
  );
}

const tabStyles = StyleSheet.create({
  iconWrap: { alignItems: 'center', justifyContent: 'center', height: 36, paddingTop: 6 },
  pillIndicator: {
    width: 20,
    height: 3,
    borderRadius: 2,
    position: 'absolute',
    top: 0,
  },
});
