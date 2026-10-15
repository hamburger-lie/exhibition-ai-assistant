# BFF 运行镜像。构建上下文为仓库根目录。
FROM node:20-alpine AS build

# Prisma 引擎在 alpine 上需要 openssl。
RUN apk add --no-cache openssl
RUN corepack enable

WORKDIR /app

# 先只拷贝依赖清单，最大化利用层缓存。
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/bff/package.json apps/bff/
COPY apps/h5/package.json apps/h5/
COPY apps/mock-b/package.json apps/mock-b/
COPY packages/contracts/package.json packages/contracts/
COPY packages/demo-catalog/package.json packages/demo-catalog/
COPY packages/generated-types/package.json packages/generated-types/
COPY packages/sse/package.json packages/sse/

# 根 postinstall 会跑 prisma generate，此时还没有 schema，先跳过。
RUN pnpm install --frozen-lockfile --ignore-scripts

COPY . .

RUN pnpm --filter @ai-assistant/bff prisma:generate \
  && pnpm --filter @ai-assistant/demo-catalog build \
  && pnpm --filter @ai-assistant/sse build \
  && pnpm --filter @ai-assistant/bff build

FROM node:20-alpine AS runtime

RUN apk add --no-cache openssl
RUN corepack enable
WORKDIR /app

COPY --from=build /app /app

ENV NODE_ENV=production
EXPOSE 3000

# 启动前先把已评审的迁移应用到目标库（migrate deploy 不会交互式生成迁移）。
CMD ["sh", "-c", "pnpm --filter @ai-assistant/bff prisma:migrate:deploy && node apps/bff/dist/index.js"]
