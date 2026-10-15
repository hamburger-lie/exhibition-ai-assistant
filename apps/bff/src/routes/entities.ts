import type { FastifyInstance } from 'fastify';

import { resolveExpo, type RuntimeConfig } from '../config/runtime-config.js';
import { publicError, sendError, sendSuccess } from '../http/response-envelope.js';
import { metrics } from '../observability/metrics.js';
import {
  isSupportedEntityType,
  SUPPORTED_ENTITY_TYPES,
  type EntityDetailProvider,
} from '../entities/entity-detail-provider.js';
import { getValidator } from '../validation/schema-validator.js';

const ENTITY_DETAILS_DATA_REF =
  'https://assistant.example/schemas/chat.schema.json#/$defs/EntityDetailsResponse';

/** E07: 结构化实体详情。响应形状完全由已冻结的 E07 Schema 决定。 */
export function registerEntityRoutes(
  app: FastifyInstance,
  config: RuntimeConfig,
  provider: EntityDetailProvider,
): void {
  const validateResponse = getValidator(ENTITY_DETAILS_DATA_REF);

  app.get<{
    Params: { entity_type: string; entity_id: string };
  }>('/api/v1/entities/:entity_type/:entity_id', async (request, reply) => {
    const { entity_type: entityType, entity_id: entityId } = request.params;
    const expoId = (request.query as Record<string, unknown>).expo_id;

    if (!isSupportedEntityType(entityType)) {
      return sendError(
        reply,
        400,
        request.requestId,
        publicError(
          'INVALID_ARGUMENT',
          `entity_type must be one of ${SUPPORTED_ENTITY_TYPES.join(', ')}`,
          '不支持的实体类型。',
        ),
      );
    }

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

    // 旧届硬过滤：不得用当前届数据冒充历史届（决策同 E01/E02）。
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

    let result;
    try {
      result = await provider.fetch({ expoId, entityType, entityId });
    } catch (error) {
      request.log.warn(
        { provider: provider.name, error_code: 'UPSTREAM_UNAVAILABLE' },
        error instanceof Error ? error.message : 'entity provider threw',
      );
      result = { kind: 'unavailable' as const, reason: 'provider threw' };
    }

    if (result.kind === 'not_found') {
      return sendError(
        reply,
        404,
        request.requestId,
        publicError(
          'ENTITY_NOT_FOUND',
          `${entityType} ${entityId} not found`,
          '未找到该内容，可能已下架或调整。',
        ),
      );
    }

    if (result.kind === 'unavailable') {
      // reason 只进日志，不回给浏览器。
      request.log.warn(
        { provider: provider.name, error_code: 'UPSTREAM_UNAVAILABLE' },
        result.reason,
      );
      metrics.upstreamErrors.inc({ code: 'UPSTREAM_UNAVAILABLE' });
      return sendError(
        reply,
        503,
        request.requestId,
        publicError(
          'UPSTREAM_UNAVAILABLE',
          'entity detail source unavailable',
          '服务暂时不可用，请稍后重试。',
          true,
        ),
      );
    }

    // 出站前按 E07 Schema 校验：数据源给了缺字段/超字段的内容时，宁可报
    // 不可用，也不把不符合契约的实体发给浏览器，更不补造缺失字段。
    const candidate = {
      request_id: request.requestId,
      success: true,
      data: result.data,
      error: null,
    };
    if (!validateResponse(candidate)) {
      request.log.warn(
        { provider: provider.name, error_code: 'UPSTREAM_UNAVAILABLE' },
        'entity detail failed contract validation',
      );
      metrics.upstreamErrors.inc({ code: 'UPSTREAM_UNAVAILABLE' });
      return sendError(
        reply,
        503,
        request.requestId,
        publicError(
          'UPSTREAM_UNAVAILABLE',
          'entity detail failed contract validation',
          '服务暂时不可用，请稍后重试。',
          true,
        ),
      );
    }

    return sendSuccess(reply, 200, request.requestId, result.data);
  });
}
