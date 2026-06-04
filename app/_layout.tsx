// Root layout — Expo Router entry point
// Handles auth check, theme, notification setup, font loading, and onboarding redirect

import 'react-native-get-random-values';
import React, { useEffect, useCallback } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ThemeProvider, AuthProvider, LanguageProvider, useTheme, useAuth } from '../lib/context';
import { View, StyleSheet } from 'react-native';
import { ThemeProvider as NavThemeProvider, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { requestNotificationPermissions } from '../lib/notifications';
import { useFonts, Inter_400Regular, Inter_500Medium } from '@expo-google-fonts/inter';
import { PlusJakartaSans_500Medium, PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans';
import * as SplashScreen from 'expo-splash-screen';

// Prevent the splash screen from auto-hiding before fonts load
SplashScreen.preventAutoHideAsync();

function RootLayoutInner() {
  const { colors, isDark } = useTheme();
  const { isLoading } = useAuth();

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
  });

  const onLayoutReady = useCallback(async () => {
    if (fontsLoaded && !isLoading) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, isLoading]);

  useEffect(() => {
    onLayoutReady();
  }, [onLayoutReady]);

  useEffect(() => {
    requestNotificationPermissions();
  }, []);

  if (!fontsLoaded || isLoading) {
    return null; // Splash screen covers this
  }

  return (
    <NavThemeProvider value={isDark ? DarkTheme : DefaultTheme}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
          animation: 'slide_from_right',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(onboarding)" options={{ gestureEnabled: false }} />
        <Stack.Screen name="(tabs)" options={{ gestureEnabled: false }} />
        <Stack.Screen name="screens/AskAIScreen" options={{ presentation: 'modal' }} />
        <Stack.Screen name="screens/AnswerGraderScreen" options={{ presentation: 'modal' }} />
        <Stack.Screen name="screens/FocusTimerScreen" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="screens/StudyNotesScreen" options={{ presentation: 'modal' }} />
        <Stack.Screen name="screens/QuizPlayScreen" options={{ gestureEnabled: false }} />
        <Stack.Screen name="screens/QuizResultScreen" />
        <Stack.Screen name="screens/ChapterDetailScreen" />
        <Stack.Screen name="screens/CrisisScreen" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="screens/CalendarScreen" options={{ presentation: 'modal' }} />
        <Stack.Screen name="screens/StudyScheduleScreen" options={{ presentation: 'modal' }} />
        <Stack.Screen name="screens/ReviewDeckScreen" />
        <Stack.Screen name="screens/ParentPortalScreen" />
        <Stack.Screen name="screens/LeaderboardScreen" />
      </Stack>
    </NavThemeProvider>
  );
}


export default function RootLayout() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <LanguageProvider>
          <RootLayoutInner />
        </LanguageProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
