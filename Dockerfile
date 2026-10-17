# One Cloud Run service: Express serves /api/* and the Vite build from web/dist.
FROM node:20-slim AS web
WORKDIR /app/web
COPY web/ ./
# Builds the frontend only if the Vite app has been added (owned by PW Product & UX).
RUN if [ -f package.json ]; then npm ci && npm run build; else mkdir -p dist; fi

FROM node:20-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server/ ./server/
COPY --from=web /app/web/dist ./web/dist
USER node
EXPOSE 8080
# GEMINI_API_KEY is injected at runtime (Cloud Run: --set-secrets GEMINI_API_KEY=gemini-api-key:latest). Never baked into the image.
CMD ["node", "server/index.js"]
