import { buildApp, buildStores } from './app.js';
import { loadRuntimeConfig } from './config/runtime-config.js';
import { waitForRedisReady, createRedisClient } from './stores/redis-stores.js';
import { startQualitySignalWorker } from './workers/quality-signal-worker.js';

export async function startServer(): Promise<void> {
  const config = loadRuntimeConfig();

  // 先确认共享存储可用再对外服务：与其带着一个连不上的 Redis 启动、
  // 然后每个请求都 503，不如启动阶段就明确失败。
  if (config.storeBackend === 'redis') {
    const probe = createRedisClient(config.redisUrl);
    await waitForRedisReady(probe);
    await probe.quit().catch(() => undefined);
  }

  const stores = buildStores(config);
  const app = buildApp(config, stores);
  startQualitySignalWorker(config.bClient);

  // 优雅关闭：先停止接收新请求，再释放共享存储连接。
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void (async () => {
        await app.close().catch(() => undefined);
        await stores.close();
        process.exit(0);
      })();
    });
  }

  await app.listen({ host: config.host, port: config.port });
}
