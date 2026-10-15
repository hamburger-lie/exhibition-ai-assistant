export interface RateLimitConfig {
  windowMs: number;
  max: number;
}

export interface BClientConfig {
  baseUrl: string;
  serviceToken?: string;
  /** Total attempts (including the first) allowed before the first byte is written. */
  maxPreStreamAttempts: number;
  /** Overall deadline (across all pre-stream attempts) before giving up with AI_UPSTREAM_TIMEOUT. */
  preStreamTimeoutMs: number;
}

export interface RuntimeConfig {
  host: string;
  port: number;
  corsAllowedOrigins: string[];
  sessionTokenTtlSeconds: number;
  rateLimit: RateLimitConfig;
  bClient: BClientConfig;
  serviceVersion: string;
  logLevel: string;
  /**
   * E07 实体详情数据源。生产环境未显式配置时默认 `none`，此时 E07 返回
   * UPSTREAM_UNAVAILABLE，绝不返回占位或猜测出来的实体详情。
   */
  entityDetailProvider: 'fixture' | 'none';
  /**
   * 会话与限流的共享存储。`redis` 为开发/生产默认；`memory` 只允许在
   * 单元测试里使用（没有跨实例语义）。
   */
  storeBackend: 'redis' | 'memory';
  redisUrl: string;
}

function parseOrigins(value: string | undefined): string[] {
  return (value ?? 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

export function loadRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env,
): RuntimeConfig {
  return {
    host: env.BFF_HOST ?? '127.0.0.1',
    port: Number.parseInt(env.BFF_PORT ?? '3000', 10),
    corsAllowedOrigins: parseOrigins(env.BFF_CORS_ALLOWED_ORIGINS),
    sessionTokenTtlSeconds: Number.parseInt(
      env.BFF_SESSION_TTL_SECONDS ?? '7200',
      10,
    ),
    rateLimit: {
      windowMs: Number.parseInt(env.BFF_RATE_LIMIT_WINDOW_MS ?? '60000', 10),
      max: Number.parseInt(env.BFF_RATE_LIMIT_MAX ?? '120', 10),
    },
    bClient: {
      baseUrl: env.B_SERVICE_BASE_URL ?? 'http://127.0.0.1:3001',
      ...(env.B_SERVICE_TOKEN ? { serviceToken: env.B_SERVICE_TOKEN } : {}),
      maxPreStreamAttempts: 2,
      preStreamTimeoutMs: Number.parseInt(
        env.B_SERVICE_TIMEOUT_MS ?? '30000',
        10,
      ),
    },
    serviceVersion: env.BFF_SERVICE_VERSION ?? '0.0.0-dev',
    logLevel: env.BFF_LOG_LEVEL ?? 'info',
    entityDetailProvider:
      env.BFF_ENTITY_DETAIL_PROVIDER === 'fixture'
        ? 'fixture'
        : env.BFF_ENTITY_DETAIL_PROVIDER === 'none'
          ? 'none'
          : env.NODE_ENV === 'production'
            ? 'none'
            : 'fixture',
    storeBackend: env.BFF_STORE_BACKEND === 'memory' ? 'memory' : 'redis',
    redisUrl: env.REDIS_URL ?? 'redis://127.0.0.1:6379',
  };
}

export interface ExpoDefinition {
  expoId: string;
  /** 旧届次硬过滤：不得静默回落到最新届次，必须返回 EXPO_NOT_FOUND。 */
  blocked: boolean;
}

const KNOWN_EXPOS: readonly ExpoDefinition[] = [
  { expoId: 'expo_demo_2026_spring', blocked: false },
  { expoId: 'expo_demo_2025_spring', blocked: true },
];

export function resolveExpo(expoId: string): ExpoDefinition | undefined {
  return KNOWN_EXPOS.find((expo) => expo.expoId === expoId);
}

export interface H5Config {
  assistant_name: string;
  welcome_text: string;
  quick_actions: { id: string; label: string; prompt: string }[];
  features: {
    streaming: boolean;
    feedback: boolean;
    citations: boolean;
    map_highlight: boolean;
  };
  config_version: string;
}

// UI 规格 §3.1 要求首屏四个 2×2 快捷入口：找展商、找产品、找展位、查活动。
// 快捷入口与首屏问题示例都由这份配置驱动，H5 不写死任何文案。
export const DEFAULT_H5_CONFIG: H5Config = {
  assistant_name: 'AI 问答助手',
  welcome_text: '可以帮你查找展商、产品、展位和现场活动',
  quick_actions: [
    { id: 'quick_exhibitor', label: '找展商', prompt: '帮我找胶原蛋白展商' },
    { id: 'quick_product', label: '找产品', prompt: '有哪些抗衰产品' },
    { id: 'quick_booth', label: '找展位', prompt: '3B-12 展位在哪里' },
    { id: 'quick_event', label: '查活动', prompt: '今天有哪些活动' },
  ],
  features: {
    streaming: true,
    feedback: true,
    citations: true,
    map_highlight: true,
  },
  config_version: 'config_2026_spring_1',
};
