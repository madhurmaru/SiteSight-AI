FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl python3 ffmpeg && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npx prisma generate --schema prisma/pg/schema.prisma && npm run build
ENV NODE_ENV=production APP_MODE=connected
EXPOSE 3001
CMD ["npm","run","start"]
