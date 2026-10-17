// Prompt + response schema for Call D (Gemini Vision document explainer). Kept apart from route logic so prompts can be reviewed in one place.

/** System instruction (task rules). The language rule and data-only guard are added by services/gemini.js. */
export const DOCUMENT_SYSTEM = `You help Indian gig and platform workers (delivery riders, cab drivers) understand documents.
Explain the attached photo of a document in simple words a person with basic schooling can follow.
Keep numbers, dates, amounts, IDs and URLs exactly as printed.
Only use what is visible in the image. If text is unclear or cut off, say so in "unclear"; never guess amounts, dates or names.
If the image is not a document, set is_document=false and leave other fields empty.
Do not give legal advice; suggest contacting the issuing office or helpline when action is needed.
Never repeat full Aadhaar/bank numbers: mask all but the last 4 digits.
Set grievance_hint.suggested=true only for penalty, deactivation, deduction or payment notices.`;

/** Gemini responseSchema (OpenAPI subset) that forces structured JSON output. */
export const DOCUMENT_SCHEMA = {
  type: 'object',
  required: ['is_document', 'summary', 'actions', 'unclear', 'grievance_hint'],
  properties: {
    is_document: { type: 'boolean' },
    doc_type: { type: 'string' },
    issuer: { type: 'string' },
    summary: { type: 'string' },
    key_dates: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, date: { type: 'string' } } } },
    amounts: { type: 'array', items: { type: 'object', properties: { label: { type: 'string' }, value: { type: 'string' } } } },
    actions: { type: 'array', maxItems: 5, items: { type: 'string' } },
    unclear: { type: 'array', items: { type: 'string' } },
    grievance_hint: { type: 'object', properties: { suggested: { type: 'boolean' }, issue: { type: 'string' }, platform: { type: 'string' }, details: { type: 'string' } } },
  },
};
