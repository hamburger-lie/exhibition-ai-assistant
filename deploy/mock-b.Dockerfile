# B 方 Mock 服务。仅用于联调/验收环境；接入真实 B 服务时把
# B_SERVICE_BASE_URL 指过去并移除本服务即可。
FROM node:20-alpine AS build

RUN corepack enable
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/bff/package.json apps/bff/
COPY apps/h5/package.json apps/h5/
COPY apps/mock-b/package.json apps/mock-b/
COPY packages/contracts/package.json packages/contracts/
COPY packages/demo-catalog/package.json packages/demo-catalog/
COPY packages/generated-types/package.json packages/generated-types/
COPY packages/sse/package.json packages/sse/

RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .
RUN pnpm --filter @ai-assistant/demo-catalog build \
  && pnpm --filter @ai-assistant/mock-b build

FROM node:20-alpine AS runtime
RUN corepack enable
WORKDIR /app
COPY --from=build /app /app

ENV NODE_ENV=production
EXPOSE 3001
CMD ["node", "apps/mock-b/dist/index.js"]
