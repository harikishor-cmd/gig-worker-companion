// Central runtime configuration. Every tunable limit lives here so routes stay free of magic numbers.

/** Gemini model; GEMINI_MODEL env overrides (gemini-2.5-flash is closed to new keys). */
export const MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';

/**
 * Per-route output token caps, sized to each response schema. Gurmukhi/Devanagari text costs
 * several tokens per word, so the long-form routes (document, grievance) get more headroom.
 * If Gemini still stops with finishReason=MAX_TOKENS, services/gemini.js retries once at MAX_TOKENS_CEILING.
 */
export const TOKEN_LIMITS = Object.freeze({
  summary: 2048,
  safety: 2048,
  schemes: 2048,
  document: 4096,
  grievance: 4096,
});
export const MAX_TOKENS_CEILING = 8192;

/** Requests per minute per IP on /api/*. Generous because testers at a venue often share one public IP. */
export const RATE_LIMIT_PER_MIN = 60;

/** JSON body limits: small everywhere, larger only for the document image (4 MB as base64 is ~5.6 MB). */
export const JSON_LIMIT = '32kb';
export const DOCUMENT_JSON_LIMIT = '6mb';
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** In-memory response cache (per Cloud Run instance). */
export const CACHE_TTL_MS = 6 * 3600e3;
export const CACHE_MAX_ENTRIES = 500;

/** Static asset caching: assets are not content-hashed, so browsers always revalidate (cheap 304 via ETag) and never run stale code after a deploy. */
export const STATIC_MAX_AGE = 0;
