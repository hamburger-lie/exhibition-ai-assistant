import { defineConfig, devices } from '@playwright/test';

const MOCK_B_PORT = 4001;
const BFF_PORT = 4000;
const H5_PORT = 4173;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: `http://127.0.0.1:${H5_PORT}`,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command:
        'pnpm --filter @ai-assistant/mock-b build && node apps/mock-b/dist/index.js',
      port: MOCK_B_PORT,
      env: { MOCK_B_HOST: '127.0.0.1', MOCK_B_PORT: String(MOCK_B_PORT) },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @ai-assistant/bff build && node apps/bff/dist/index.js',
      port: BFF_PORT,
      env: {
        BFF_HOST: '127.0.0.1',
        BFF_PORT: String(BFF_PORT),
        B_SERVICE_BASE_URL: `http://127.0.0.1:${MOCK_B_PORT}`,
        BFF_CORS_ALLOWED_ORIGINS: `http://127.0.0.1:${H5_PORT}`,
        // 幂等与持久化都落 PostgreSQL，e2e 用本项目专属的开发库容器。
        DATABASE_URL:
          process.env.DATABASE_URL ??
          'postgresql://postgres:assistant_dev_password@127.0.0.1:55532/assistant_dev?schema=public',
        BFF_LOG_LEVEL: 'warn',
        // 会话与限流走本项目专属的开发 Redis 容器。
        BFF_STORE_BACKEND: 'redis',
        REDIS_URL: process.env.REDIS_URL ?? 'redis://127.0.0.1:56379',
        // E07 用本地结构化样例，e2e 才能验证详情页链路。
        BFF_ENTITY_DETAIL_PROVIDER: 'fixture',
        // e2e 期间所有请求都来自同一台机器（127.0.0.1），限流计数落共享的
        // 开发 Redis，跨多轮连续运行会累积。生产默认值（120/60s）在这里会
        // 把正常的测试流量本身当成滥用而 429，因此只在 e2e 环境调高配额；
        // 不改 deploy/ 下的生产配置。限流场景本身走 mock-b 的固定关键词
        // 场景（见 error-recovery.spec.ts「限流场景测试」），不依赖这个值。
        BFF_RATE_LIMIT_MAX: '10000',
      },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `pnpm --filter @ai-assistant/h5 build && pnpm --filter @ai-assistant/h5 exec vite preview --host 127.0.0.1 --port ${H5_PORT} --strictPort`,
      port: H5_PORT,
      env: { VITE_BFF_PROXY_TARGET: `http://127.0.0.1:${BFF_PORT}` },
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
});
