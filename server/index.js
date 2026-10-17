import { createApp } from './app.js';

const port = Number(process.env.PORT) || 8080;
if (!process.env.GEMINI_API_KEY) console.warn('GEMINI_API_KEY is not set: /api endpoints will return model_not_configured.');
createApp().listen(port, () => console.log(`Gig Worker Companion listening on :${port}`));
