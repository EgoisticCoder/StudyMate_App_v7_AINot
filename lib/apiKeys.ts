import { Platform } from 'react-native';

export type StoredApiKeys = {
  orKey?: string;
  customModel?: string;
};

function trimKey(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Load OpenRouter keys from Profile storage, then build-time EXPO_PUBLIC_* fallbacks. */
export async function loadApiKeys(): Promise<StoredApiKeys> {
  let orKey: string | undefined;
  let customModel: string | undefined;

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      try {
        orKey = trimKey(localStorage.getItem('openrouter_api_key'));
        customModel = trimKey(localStorage.getItem('custom_model'));
      } catch (e) {
        console.warn('Failed to load API keys from localStorage:', e);
      }
    }
  } else {
    try {
      const SecureStore = require('expo-secure-store');
      orKey = trimKey(await SecureStore.getItemAsync('openrouter_api_key'));
      customModel = trimKey(await SecureStore.getItemAsync('custom_model'));
    } catch {
      // SecureStore unavailable
    }
  }

  if (!orKey) orKey = trimKey(process.env.EXPO_PUBLIC_OPENROUTER_API_KEY);

  return { orKey, customModel };
}

/** Web production: CORS blocks browser requests — use same-origin Vercel proxy. */
export function shouldUseAiProxy(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host !== 'localhost' && host !== '127.0.0.1';
}

