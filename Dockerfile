# syntax=docker/dockerfile:1.4
FROM node:20-slim
WORKDIR /app
COPY package*.json ./
COPY pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --prod --frozen-lockfile
COPY dist ./dist
COPY .env.example ./
COPY src/utils/performanceDashboard.js ./src/utils/performanceDashboard.js
CMD ["pnpm", "start"]
