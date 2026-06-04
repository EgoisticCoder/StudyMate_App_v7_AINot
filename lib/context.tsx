// Theme and Auth context providers

import React, { createContext, useContext, useState, useEffect, useMemo, ReactNode } from 'react';
import { isValidLanguage, SupportedLanguage } from '../constants/languages';
import { useColorScheme, Platform } from 'react-native';
import { Colors } from '../constants/colors';

// ── Theme Context ────────────────────────────────

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  colors: typeof Colors.light;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  mode: 'system',
  setMode: () => {},
  colors: Colors.light,
  isDark: false,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setMode] = useState<ThemeMode>('system');

  useEffect(() => {
    // Load saved preference
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme_mode');
      if (saved === 'light' || saved === 'dark' || saved === 'system') {
        setMode(saved);
      }
    } else {
      (async () => {
        try {
          const SecureStore = require('expo-secure-store');
          const saved = await SecureStore.getItemAsync('theme_mode');
          if (saved === 'light' || saved === 'dark' || saved === 'system') {
            setMode(saved);
          }
        } catch {}
      })();
    }
  }, []);

  const handleSetMode = (m: ThemeMode) => {
    setMode(m);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      localStorage.setItem('theme_mode', m);
    } else {
      (async () => {
        try {
          const SecureStore = require('expo-secure-store');
          await SecureStore.setItemAsync('theme_mode', m);
        } catch {}
      })();
    }
  };

  const isDark =
    mode === 'dark' || (mode === 'system' && systemScheme === 'dark');
  const colors = isDark ? Colors.dark : Colors.light;

  return (
    <ThemeContext.Provider value={{ mode, setMode: handleSetMode, colors, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

// ── Auth Context ─────────────────────────────────

interface AuthContextType {
  studentId: string | null;
  setStudentId: (id: string | null) => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  studentId: null,
  setStudentId: () => {},
  isLoading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [studentId, setStudentIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          const id = localStorage.getItem('student_id');
          setStudentIdState(id);
        } else {
          const SecureStore = require('expo-secure-store');
          const id = await SecureStore.getItemAsync('student_id');
          setStudentIdState(id);
        }
      } catch {
        setStudentIdState(null);
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  const setStudentId = async (id: string | null) => {
    setStudentIdState(id);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      if (id) localStorage.setItem('student_id', id);
      else localStorage.removeItem('student_id');
    } else {
      try {
        const SecureStore = require('expo-secure-store');
        if (id) await SecureStore.setItemAsync('student_id', id);
        else await SecureStore.deleteItemAsync('student_id');
      } catch {}
    }
  };

  return (
    <AuthContext.Provider value={{ studentId, setStudentId, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// ── Language Context ──────────────────────────────

export type { SupportedLanguage } from '../constants/languages';

interface LanguageContextType {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'English',
  setLanguage: () => {},
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<SupportedLanguage>('English');

  useEffect(() => {
    const applySaved = (saved: string | null) => {
      if (isValidLanguage(saved)) setLanguageState(saved);
    };
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      applySaved(localStorage.getItem('app_language'));
    } else {
      (async () => {
        try {
          const SecureStore = require('expo-secure-store');
          applySaved(await SecureStore.getItemAsync('app_language'));
        } catch {}
      })();
    }
  }, []);

  const setLanguage = (lang: SupportedLanguage) => {
    setLanguageState(lang);
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      localStorage.setItem('app_language', lang);
    } else {
      (async () => {
        try {
          const SecureStore = require('expo-secure-store');
          await SecureStore.setItemAsync('app_language', lang);
        } catch {}
      })();
    }
  };

  const value = useMemo(() => ({ language, setLanguage }), [language]);

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
