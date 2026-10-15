# H5 静态资源 + Nginx。Nginx 同时承担 /api 反向代理（SSE 不缓冲）。
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
RUN pnpm --filter @ai-assistant/sse build && pnpm --filter @ai-assistant/h5 build

FROM nginx:alpine AS runtime
COPY --from=build /app/apps/h5/dist /usr/share/nginx/html
COPY deploy/nginx/default.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
