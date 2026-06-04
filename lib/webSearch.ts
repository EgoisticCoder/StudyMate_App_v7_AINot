import { setStoredValue, getStoredValue as readSecure } from './neo4j';

async function getTavilyKey(): Promise<string | null> {
  return readSecure('tavily_api_key');
}

export async function setTavilyApiKey(key: string): Promise<void> {
  await setStoredValue('tavily_api_key', key);
}

/** Readable snippet for RAG-style prompting */
export interface SearchSnippet {
  title: string;
  url: string;
  content: string;
}

function normalizeQuery(q: string): string {
  return q.replace(/\s+/g, ' ').trim().slice(0, 400);
}

/**
 * Primary: Tavily API. Secondary: DuckDuckGo instant answer + related topics (no API key).
 */
export async function searchStudyReferences(query: string): Promise<SearchSnippet[]> {
  const q = normalizeQuery(query);
  if (!q) return [];

  const tavilyKey = (await getTavilyKey()) || process.env.EXPO_PUBLIC_TAVILY_API_KEY || '';
  if (tavilyKey) {
    try {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          api_key: tavilyKey,
          query: q,
          search_depth: 'advanced',
          include_answer: false,
          max_results: 6,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const results = data.results || [];
        return results.map((r: { title?: string; url?: string; content?: string }) => ({
          title: r.title || 'Result',
          url: r.url || '',
          content: (r.content || '').slice(0, 900),
        }));
      }
    } catch (e) {
      console.warn('Tavily search failed', e);
    }
  }

  return duckDuckGoFallback(q);
}

async function duckDuckGoFallback(query: string): Promise<SearchSnippet[]> {
  try {
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&t=studymate`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const out: SearchSnippet[] = [];
    if (data.AbstractText) {
      out.push({
        title: data.Heading || 'Summary',
        url: data.AbstractURL || '',
        content: String(data.AbstractText).slice(0, 900),
      });
    }
    const topics = data.RelatedTopics || [];
    for (const t of topics.slice(0, 4)) {
      if (typeof t === 'object' && t.Text && t.FirstURL) {
        out.push({
          title: 'Related',
          url: t.FirstURL,
          content: String(t.Text).slice(0, 600),
        });
      }
    }
    return out;
  } catch (e) {
    console.warn('DuckDuckGo fallback failed', e);
    return [];
  }
}

export function formatSnippetsForPrompt(snippets: SearchSnippet[]): string {
  if (!snippets.length) return '';
  return snippets
    .map((s, i) => `[${i + 1}] ${s.title}\nURL: ${s.url}\n${s.content}`)
    .join('\n\n');
}
