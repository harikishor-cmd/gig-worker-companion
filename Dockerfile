# One Cloud Run service: Express serves /api/* and the static frontend from web/.
FROM node:20-slim
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server/ ./server/
COPY web/ ./web/
USER node
EXPOSE 8080
# GEMINI_API_KEY is injected at runtime by Cloud Run env/secret, never baked into the image.
CMD ["node", "server/index.js"]
