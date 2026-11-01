import { config } from '../config.js';

function parseJson(text) {
  if (!text) throw new Error('empty response');
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('no JSON object in response');
  return JSON.parse(cleaned.slice(start, end + 1));
}

// Calls free OpenAI-compatible APIs in order (Gemini, then Groq). Returns parsed JSON.
export async function chatJson(system, user) {
  if (!config.llmProviders.length) throw new Error('No AI provider configured (set GEMINI_API_KEY or GROQ_API_KEY)');
  const errors = [];
  for (const p of config.llmProviders) {
    try {
      const res = await fetch(`${p.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${p.key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: p.model,
          messages: [{ role: 'system', content: system }, { role: 'user', content: user }],
          response_format: { type: 'json_object' },
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      const data = await res.json();
      return { provider: p.name, json: parseJson(data.choices?.[0]?.message?.content) };
    } catch (err) {
      errors.push(`${p.name}: ${err.message}`);
    }
  }
  throw new Error(errors.join(' | '));
}
