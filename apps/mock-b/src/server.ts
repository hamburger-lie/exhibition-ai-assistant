import Fastify, { type FastifyInstance } from 'fastify';

import { registerAgentRoutes } from './routes/agent.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerQualityRoutes } from './routes/quality.js';
import { registerResolveRoutes } from './routes/resolve.js';
import { registerRetrieveRoutes } from './routes/retrieve.js';
import { registerSearchRoutes } from './routes/search.js';

export function buildServer(): FastifyInstance {
  const app = Fastify({ logger: false });

  registerAgentRoutes(app);
  registerSearchRoutes(app);
  registerRetrieveRoutes(app);
  registerResolveRoutes(app);
  registerQualityRoutes(app);
  registerHealthRoutes(app);

  return app;
}
