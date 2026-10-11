# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --filter @pulse/bridge-mqtt... && pnpm --filter @pulse/bridge-mqtt build

FROM node:22-alpine
ENV NODE_ENV=production HEALTH_PORT=8080
WORKDIR /app
COPY --from=build /repo/apps/bridge-mqtt/dist ./dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=20s --timeout=5s --retries=3 CMD ["node","dist/healthcheck.js"]
CMD ["node","dist/main.js"]
