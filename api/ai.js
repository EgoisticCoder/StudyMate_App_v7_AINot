/**
 * Vercel serverless proxy for OpenRouter.
 * Browser clients cannot call openrouter.ai directly (CORS). Profile keys or server env vars are used here.
 *
 * Server env (runtime, recommended on Vercel):
 *   OPENROUTER_API_KEY
 * Build-time fallbacks (also accepted):
 *   EXPO_PUBLIC_OPENROUTER_API_KEY
 */

const SARVAM_CHAT_URL = 'https://api.sarvam.ai/v1/chat/completions';
const DEFAULT_SARVAM_MODEL = 'sarvam-105b';

function trim(value) {
  const t = (value || '').trim();
  return t || '';
}

function resolveKeys(clientKey) {
  return {
    sarvamKey:
      trim(clientKey) ||
      trim(process.env.SARVAM_API_KEY) ||
      trim(process.env.EXPO_PUBLIC_SARVAM_API_KEY),
  };
}

function resolveChatConfig(sarvamKey) {
  if (sarvamKey) {
    return {
      key: sarvamKey,
      url: SARVAM_CHAT_URL,
      model: DEFAULT_SARVAM_MODEL,
      provider: 'sarvam',
    };
  }
  return null;
}

function upstreamHeaders(provider, apiKey) {
  const headers = {
    'Content-Type': 'application/json',
  };
  if (provider === 'sarvam') {
    headers['api-subscription-key'] = apiKey;
  } else {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  return headers;
}

async function handleChat(body, res) {
  const { sarvamKey } = resolveKeys(body.keys?.sarvam);
  const config = resolveChatConfig(sarvamKey);

  if (!config) {
    return res.status(401).json({
      error: 'API key not configured. Set SARVAM_API_KEY on Vercel or in environment.',
    });
  }

  const upstream = await fetch(config.url, {
    method: 'POST',
    headers: upstreamHeaders(config.provider, config.key),
    body: JSON.stringify({
      model: config.model,
      messages: body.messages,
      max_tokens: body.max_tokens,
      temperature: body.temperature,
    }),
  });

  const text = await upstream.text();
  res.status(upstream.status);
  res.setHeader('Content-Type', 'application/json');
  return res.end(text);
}

async function handleTranscribe(body, res) {
  return res.status(400).json({ error: 'Voice transcription on mobile is disabled (Groq API has been removed).' });
}

module.exports = async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body =
      typeof req.body === 'string' && req.body
        ? JSON.parse(req.body)
        : req.body || {};
    const action = body.action || 'chat';

    if (action === 'transcribe') {
      return handleTranscribe(body, res);
    }
    return handleChat(body, res);
  } catch (err) {
    console.error('AI proxy error:', err);
    return res.status(500).json({ error: err.message || 'AI proxy error' });
  }
};

