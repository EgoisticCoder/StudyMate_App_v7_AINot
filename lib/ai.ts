// Sarvam AI Completions Client (replaces Groq/OpenRouter client)
// Model: sarvam-105b (text chat)

import { Platform } from 'react-native';
import { loadApiKeys, shouldUseAiProxy, getSarvamKey } from './apiKeys';

const SARVAM_API_URL = 'https://api.sarvam.ai/v1/chat/completions';
const DEFAULT_MODEL = 'sarvam-105b';

// Token limits per use case
export const TOKEN_LIMITS = {
  doubt_solver: 1800,
  vision_question: 1500,
  answer_grader: 1200,
  quiz_generator: 2200,
  notes_generator: 1800,
  ai_nudge: 200,
  concept_explainer: 800,
  baseline_analysis: 900,
  diagnostic_generator: 4000,
  schedule_planner: 2000,
  report_generation: 1200,
  mood_quote: 400,
  voice_mode: 800,
  slot_extractor: 2500,
  wellness_insight: 600,
  focus_check: 60,
} as const;

// Temperatures per use case
export const TEMPERATURES = {
  quiz: 0.2,
  grading: 0.2,
  notes: 0.2,
  doubt_solver: 0.4,
  nudge: 0.7,
  motivation: 0.7,
} as const;

export type GroqUseCase = keyof typeof TOKEN_LIMITS;

export type ApiConfig = { key: string; url: string; model: string };

/** Returns true if Sarvam AI API key is available. */
export async function hasAiApiKey(): Promise<boolean> {
  return !!(await getSarvamKey());
}

async function getApiConfig(): Promise<ApiConfig> {
  const apiKey = await getSarvamKey();
  if (apiKey) {
    return {
      key: apiKey,
      url: SARVAM_API_URL,
      model: DEFAULT_MODEL,
    };
  }
  throw new Error('Sarvam API key not configured. Add EXPO_PUBLIC_SARVAM_API_KEY in your env.');
}

export interface GroqMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

export interface GroqResponse {
  choices: Array<{
    message: {
      content: string;
    };
    finish_reason: string;
  }>;
}

type ProxyChatPayload = {
  action: 'chat';
  messages: GroqMessage[];
  max_tokens: number;
  temperature: number;
  keys: { sarvam?: string };
  model?: string;
};

async function callViaProxy(payload: ProxyChatPayload): Promise<string> {
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const raw = await response.text();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error(
      response.ok
        ? 'Invalid AI response'
        : 'AI proxy unavailable. Redeploy on Vercel with api/ai.js and set SARVAM_API_KEY.'
    );
  }

  if (!response.ok) {
    const errBody = data as { error?: string | { message?: string } };
    const errMsg =
      typeof errBody.error === 'string'
        ? errBody.error
        : errBody.error?.message || `API error ${response.status}`;
    throw new Error(errMsg);
  }

  const content = (data as GroqResponse).choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from AI');
  return content;
}

async function callDirect(
  config: ApiConfig,
  messages: GroqMessage[],
  maxTokens: number,
  temp: number
): Promise<string> {
  const response = await fetch(config.url, {
    method: 'POST',
    headers: {
      'api-subscription-key': config.key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      max_tokens: maxTokens,
      temperature: temp,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`Sarvam AI completions error (${response.status}):`, errorBody);
    if (response.status === 401 || response.status === 403) {
      throw new Error('Invalid API key. Please check your Sarvam API key config.');
    }
    throw new Error(`API error ${response.status}`);
  }

  const data: GroqResponse = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Empty response from AI');
  return content;
}

/** Quick connectivity check for Profile diagnostics. */
export async function testAiConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    await callGroq(
      [{ role: 'user', content: 'Reply with exactly the word OK and nothing else.' }],
      'focus_check',
      0.1
    );
    return { ok: true, message: 'Sarvam AI connected successfully' };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Connection failed';
    return { ok: false, message };
  }
}

/**
 * Call Sarvam AI completions API with retry logic.
 */
export async function callGroq(
  messages: GroqMessage[],
  useCase: GroqUseCase,
  temperature?: number,
  configOverride?: ApiConfig
): Promise<string> {
  const config = configOverride ?? (await getApiConfig());
  const maxTokens = TOKEN_LIMITS[useCase];
  const temp = temperature ?? getTemperatureForUseCase(useCase);
  const useProxy = shouldUseAiProxy();

  let lang = 'English';
  if (Platform.OS === 'web') {
    lang = localStorage.getItem('app_language') || 'English';
  } else {
    try {
      const SecureStore = require('expo-secure-store');
      lang = (await SecureStore.getItemAsync('app_language')) || 'English';
    } catch {
      // ignore
    }
  }

  const modifiedMessages = [...messages];
  if (lang !== 'English') {
    const sysIdx = modifiedMessages.findIndex(m => m.role === 'system');
    const langInstruction = `\n\nCRITICAL INSTRUCTION: You MUST communicate entirely in ${lang}. All explanations, questions, and responses MUST be in ${lang}.`;
    if (sysIdx >= 0) {
      if (typeof modifiedMessages[sysIdx].content === 'string') {
        modifiedMessages[sysIdx] = {
          ...modifiedMessages[sysIdx],
          content: modifiedMessages[sysIdx].content + langInstruction,
        };
      }
    } else {
      modifiedMessages.unshift({ role: 'system', content: langInstruction });
    }
  }

  let lastError = '';

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const content = useProxy
        ? await callViaProxy({
            action: 'chat',
            messages: modifiedMessages,
            max_tokens: maxTokens,
            temperature: temp,
            keys: {
              sarvam: config.key,
            },
            model: config.model,
          })
        : await callDirect(config, modifiedMessages, maxTokens, temp);

      return content;
    } catch (error: unknown) {
      const err = error as { message?: string };
      if (err.message?.includes('API key') || err.message?.includes('not configured')) {
        throw error;
      }
      lastError = err.message || 'Unknown error';
      if (attempt === 0) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  }

  throw new Error(lastError || 'Sarvam AI is taking too long — tap to retry');
}

/**
 * Handle vision / OCR fallback gracefully
 */
export async function callGroqVision(
  systemPrompt: string,
  imageBase64: string,
  textPrompt: string,
  useCase: GroqUseCase
): Promise<string> {
  if (useCase === 'focus_check') {
    // Graceful mock fallback for focus detection
    return 'FOCUSED';
  }

  throw new Error(
    'Sarvam AI is text-only. OCR / Image analysis is disabled. Please enter your text directly or use voice dictation.'
  );
}

/**
 * Parse JSON from response with cleanup and retry
 */
export function parseGroqJSON<T>(response: string): T {
  try {
    return JSON.parse(response);
  } catch {
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch {}
    }

    const arrayMatch = response.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
      } catch {}
    }

    const objMatch = response.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]);
      } catch {}
    }

    throw new Error('Failed to parse AI response as JSON');
  }
}

function getTemperatureForUseCase(useCase: GroqUseCase): number {
  switch (useCase) {
    case 'quiz_generator':
    case 'answer_grader':
    case 'notes_generator':
    case 'schedule_planner':
    case 'voice_mode':
    case 'slot_extractor':
      return TEMPERATURES.quiz;
    case 'doubt_solver':
    case 'concept_explainer':
      return TEMPERATURES.doubt_solver;
    case 'ai_nudge':
      return TEMPERATURES.nudge;
    case 'vision_question':
      return TEMPERATURES.doubt_solver;
    case 'focus_check':
      return 0.1;
    default:
      return 0.4;
  }
}
