// Process entry point: builds the app and listens on $PORT (Cloud Run sets it).
import { createApp } from './app.js';
import { logger } from './services/logger.js';

const port = Number(process.env.PORT) || 8080;
if (!process.env.GEMINI_API_KEY) logger.warn('GEMINI_API_KEY is not set: /api endpoints will return model_not_configured.');
createApp().listen(port, () => logger.info('server_listening', { port }));
