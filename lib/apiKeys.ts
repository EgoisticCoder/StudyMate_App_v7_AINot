import { Platform } from 'react-native';

function trimKey(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

export type StoredApiKeys = {
  sarvamKey?: string;
  customModel?: string;
};

/** Load Sarvam keys from Profile storage, then build-time EXPO_PUBLIC_* fallbacks. */
export async function loadApiKeys(): Promise<StoredApiKeys> {
  let sarvamKey: string | undefined;
  let customModel: string | undefined;

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      try {
        sarvamKey = trimKey(localStorage.getItem('sarvam_api_key'));
        customModel = trimKey(localStorage.getItem('custom_model'));
      } catch (e) {
        console.warn('Failed to load API keys from localStorage:', e);
      }
    }
  } else {
    try {
      const SecureStore = require('expo-secure-store');
      sarvamKey = trimKey(await SecureStore.getItemAsync('sarvam_api_key'));
      customModel = trimKey(await SecureStore.getItemAsync('custom_model'));
    } catch {
      // SecureStore unavailable
    }
  }

  if (!sarvamKey) sarvamKey = trimKey(process.env.EXPO_PUBLIC_SARVAM_API_KEY);

  return { sarvamKey, customModel };
}

/** Asynchronously get the active Sarvam API key. */
export async function getSarvamKey(): Promise<string> {
  const { sarvamKey } = await loadApiKeys();
  return sarvamKey || '';
}

/** Web production: CORS blocks browser requests — use same-origin Vercel proxy. */
export function shouldUseAiProxy(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host !== 'localhost' && host !== '127.0.0.1';
}

