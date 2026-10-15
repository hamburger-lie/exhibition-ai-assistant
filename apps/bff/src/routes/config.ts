import type { FastifyInstance } from 'fastify';

import { DEFAULT_H5_CONFIG, resolveExpo } from '../config/runtime-config.js';
import { publicError, sendError, sendSuccess } from '../http/response-envelope.js';

/** E02: returns welcome text, quick actions and feature flags for expo_id. */
export function registerConfigRoutes(app: FastifyInstance): void {
  app.get('/api/v1/config', async (request, reply) => {
    const query = request.query as Record<string, unknown>;
    const expoId = query.expo_id;

    if (typeof expoId !== 'string' || expoId.trim().length === 0) {
      return sendError(
        reply,
        400,
        request.requestId,
        publicError(
          'INVALID_ARGUMENT',
          'expo_id query parameter is required',
          '缺少展会参数。',
        ),
      );
    }

    const expo = resolveExpo(expoId);

    if (!expo || expo.blocked) {
      return sendError(
        reply,
        404,
        request.requestId,
        publicError(
          'EXPO_NOT_FOUND',
          `${expoId} is not available`,
          '未找到指定届次的展会数据。',
        ),
      );
    }

    return sendSuccess(reply, 200, request.requestId, DEFAULT_H5_CONFIG);
  });
}
