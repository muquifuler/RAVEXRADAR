# studio-server/Dockerfile — Node + ffmpeg del sistema
FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
RUN npm install --omit=optional --omit=dev
COPY . .
ENV NODE_ENV=production FFMPEG_PATH=/usr/bin/ffmpeg PORT=8787
EXPOSE 8787
CMD ["node", "server.mjs"]
