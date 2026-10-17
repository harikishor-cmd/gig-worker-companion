// The ONE shared Gemini helper. All routes call gemini(); nothing else talks to the API.
// GEMINI_API_KEY is read from the environment only and never sent to the client.
import { languageInstruction } from './lang.js';

// Default gemini-3.5-flash (2.5-flash is closed to new API keys as of 2026-10); GEMINI_MODEL env overrides it.
export const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * @param {object} opts
 * @param {'hi'|'pa'|'en'} opts.lang      required, enforced on every call
 * @param {string} opts.system            task-specific system instruction
 * @param {string} opts.prompt            user content (text)
 * @param {object} opts.schema            Gemini responseSchema (OpenAPI subset) for JSON output
 * @param {{mimeType:string,data:string}} [opts.image]  optional base64 image for Vision
 * @param {number} [opts.temperature]   clamped to <= 0.4
 * @param {number} [opts.maxOutputTokens]
 * @returns {Promise<object>} parsed JSON matching schema
 */
export function createGemini({ apiKey = process.env.GEMINI_API_KEY, model = MODEL, fetchImpl = globalThis.fetch } = {}) {
  return async function gemini({ lang, system, prompt, schema, image, temperature = 0.3, maxOutputTokens = 8192 }) {
    const langRule = languageInstruction(lang); // throws on invalid lang
    if (!apiKey) {
      const err = new Error('GEMINI_API_KEY is not configured on the server.');
      err.status = 503;
      throw err;
    }
    const parts = [{ text: prompt }];
    if (image) parts.push({ inline_data: { mime_type: image.mimeType, data: image.data } });
    const body = {
      systemInstruction: { parts: [{ text: `${langRule}\n\n${system}` }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: Math.min(temperature, 0.4), maxOutputTokens, responseMimeType: 'application/json', responseSchema: schema },
    };
    // One retry on malformed JSON; never a canned fallback.
    for (let attempt = 0; attempt < 2; attempt++) {
      const out = await callOnce(body);
      if (out !== undefined) return out;
    }
    const err = new Error('Gemini returned non-JSON output');
    err.status = 502;
    err.code = 'model_bad_output';
    throw err;
  };

  async function callOnce(body) {
    let res;
    // Retry transient Gemini overload/rate-limit responses (429/5xx) with short backoff.
    for (let i = 0; i < 3; i++) {
      res = await fetchImpl(`${API_BASE}/${model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
      });
      if (res.ok || !(res.status === 429 || res.status >= 500)) break;
      if (i < 2) await new Promise((r) => setTimeout(r, 1200 * (i + 1)));
    }
    if (!res.ok) {
      console.error(`Gemini HTTP ${res.status}`);
      const err = new Error(`Gemini request failed (${res.status})`);
      err.status = 502;
      err.code = 'model_unavailable';
      throw err;
    }
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('') ?? '';
    try {
      return JSON.parse(text);
    } catch {
      return undefined;
    }
  }
}
