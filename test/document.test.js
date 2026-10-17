import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { makeApp } from './helpers.js';

const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64)]);
const pdf = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64)]);

describe('POST /api/document', () => {
  it('rejects disguised files (415) and oversized images (413) before any model call', async () => {
    const { app, gemini } = makeApp();
    const disguised = await request(app)
      .post('/api/document')
      .send({ lang: 'en', mimeType: 'image/jpeg', imageBase64: pdf.toString('base64') });
    expect(disguised.status).toBe(415);
    expect(disguised.body.error.code).toBe('unsupported_image');
    const mismatch = await request(app)
      .post('/api/document')
      .send({ lang: 'en', mimeType: 'image/jpeg', imageBase64: png.toString('base64') });
    expect(mismatch.status).toBe(415);
    const wrongMime = await request(app)
      .post('/api/document')
      .send({ lang: 'en', mimeType: 'application/pdf', imageBase64: pdf.toString('base64') });
    expect(wrongMime.status).toBe(400);
    const big = Buffer.concat([png, Buffer.alloc(4 * 1024 * 1024 + 10)]);
    const tooBig = await request(app)
      .post('/api/document')
      .send({ lang: 'en', mimeType: 'image/png', imageBase64: big.toString('base64') });
    expect(tooBig.status).toBe(413);
    expect(gemini).not.toHaveBeenCalled();
  });

  it('sends a valid image to Gemini Vision with the chosen language', async () => {
    const { app, gemini } = makeApp({
      geminiResult: { is_document: true, summary: 'ok', actions: [], unclear: [], grievance_hint: { suggested: false } },
    });
    const res = await request(app)
      .post('/api/document')
      .send({ lang: 'pa', mimeType: 'image/png', imageBase64: png.toString('base64') });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(gemini.mock.calls[0][0]).toMatchObject({ lang: 'pa', image: { mimeType: 'image/png' } });
  });
});
