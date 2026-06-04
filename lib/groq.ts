// Groq API client (redirected to OpenRouter)
// Model: z-ai/glm-4.5-air:free (chat) and z-ai/glm-4.6v (vision)

import { Platform } from 'react-native';
import { loadApiKeys, shouldUseAiProxy } from './apiKeys';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_CHAT_MODEL = 'meta-llama/llama-3.1-8b-instruct:free';
const DEFAULT_VISION_MODEL = 'z-ai/glm-4.6v';

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
  focus_check: 60, // minimal — just needs "FOCUSED" or "DISTRACTED"
} as const;

// Temperature per use case
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

/** Returns true if OpenRouter API key is available. */
export async function hasAiApiKey(): Promise<boolean> {
  const { orKey } = await loadApiKeys();
  return !!orKey;
}

async function getApiConfig(): Promise<ApiConfig> {
  const { orKey, customModel } = await loadApiKeys();

  if (orKey) {
    return {
      key: orKey,
      url: OPENROUTER_API_URL,
      model: customModel || DEFAULT_CHAT_MODEL,
    };
  }

  throw new Error('API key not configured. Add OpenRouter API key in Settings.');
}

/**
 * Vision requests must use a multimodal model (GLM vision model).
 */
async function getVisionApiConfig(): Promise<ApiConfig> {
  const { orKey, customModel } = await loadApiKeys();

  if (orKey) {
    return {
      key: orKey,
      url: OPENROUTER_API_URL,
      model: customModel?.includes('vision') || customModel?.includes('vl') || customModel?.includes('glm-')
        ? customModel
        : DEFAULT_VISION_MODEL,
    };
  }

  throw new Error('API key not configured. Add OpenRouter API key in Settings.');
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
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

type ProxyChatPayload = {
  action: 'chat';
  messages: GroqMessage[];
  max_tokens: number;
  temperature: number;
  keys: { openrouter?: string };
  customModel?: string;
  preferGroq: boolean;
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
        : 'AI proxy unavailable. Redeploy on Vercel with api/ai.js and set OPENROUTER_API_KEY.'
    );
  }

  if (!response.ok) {
    const errBody = data as { error?: string | { message?: string } };
    const errMsg =
      typeof errBody.error === 'string'
        ? errBody.error
        : errBody.error?.message || `API error ${response.status}`;
    if (response.status === 401) {
      throw new Error('Invalid API key. Check OpenRouter key in Profile or Vercel env.');
    }
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
      Authorization: `Bearer ${config.key}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://studymate.ai',
      'X-Title': 'StudyMate AI',
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
    console.error(`AI API error (${response.status}):`, errorBody);
    if (response.status === 401) {
      throw new Error('Invalid API key. Please check your OpenRouter API key in Settings.');
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
    return { ok: true, message: 'AI connected successfully' };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Connection failed';
    return { ok: false, message };
  }
}

/**
 * Call OpenRouter API with retry logic.
 * Never shows raw API errors — returns user-friendly messages.
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
  const storedKeys = await loadApiKeys();

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

  const preferGroq = false;
  const useProxy = shouldUseAiProxy();

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
              openrouter: storedKeys.orKey,
            },
            customModel: storedKeys.customModel,
            preferGroq,
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

  throw new Error(lastError || 'AI is taking too long — tap to retry');
}

/**
 * Call Groq with vision (image) support
 */
/** Strip data-URI prefix if present */
export function normalizeImageBase64(raw: string): string {
  const trimmed = raw.trim();
  const match = trimmed.match(/^data:image\/[a-z+]+;base64,(.+)$/i);
  return match ? match[1] : trimmed;
}

export async function callGroqVision(
  systemPrompt: string,
  imageBase64: string,
  textPrompt: string,
  useCase: GroqUseCase
): Promise<string> {
  const config = await getVisionApiConfig();
  const cleanB64 = normalizeImageBase64(imageBase64);
  const messages: GroqMessage[] = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: {
            url: `data:image/jpeg;base64,${cleanB64}`,
          },
        },
        {
          type: 'text',
          text: textPrompt,
        },
      ],
    },
  ];

  return callGroq(messages, useCase, getTemperatureForUseCase(useCase), config);
}

/**
 * Parse JSON from Groq response with cleanup and retry
 */
export function parseGroqJSON<T>(response: string): T {
  // Try direct parse first
  try {
    return JSON.parse(response);
  } catch {
    // Try to extract JSON from markdown code blocks
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch {
        // continue to next attempt
      }
    }

    // Try to find JSON array or object
    const arrayMatch = response.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
      try {
        return JSON.parse(arrayMatch[0]);
      } catch {
        // continue
      }
    }

    const objMatch = response.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]);
      } catch {
        // continue
      }
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
