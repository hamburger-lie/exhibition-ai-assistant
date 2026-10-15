import type { FastifyInstance } from 'fastify';

import {
  buildEventFrames,
  buildExhibitorFrames,
  buildProductFrames,
  findEventByTitle,
  findExhibitorByName,
  findProductByName,
} from '../entity-search.js';
import {
  buildInternalErrorEnvelope,
  buildTraceId,
  delay,
  getScenario,
  loadFixtureText,
  parseSse,
} from '../fixtures.js';
import {
  overrideScenarioId,
  pickChatScenarioId,
  pickErrorScenarioId,
} from '../scenario-select.js';

/**
 * 「展商/产品/活动」这三类默认场景（chat-exhibitor/product/event）如果 query
 * 里精确出现了大批量样例数据（`@ai-assistant/demo-catalog`）里某一条的名字，就
 * 动态拼一份对应的 SSE 帧，而不是永远回落到那唯一一条锁死的静态 fixture。
 * 没匹配到时行为完全不变，仍然读原来的静态文件——这仍是确定性关键词路由，
 * 不是真实检索（Task 4 的边界没有被突破）。
 */
function dynamicFramesForScenario(
  scenarioId: string,
  query: string,
):
  | Array<{ event: string; data: Record<string, unknown> }>
  | undefined {
  if (scenarioId === 'chat-exhibitor' || scenarioId === 'chat-booth') {
    const match = findExhibitorByName(query);
    return match ? buildExhibitorFrames(match) : undefined;
  }
  if (scenarioId === 'chat-product') {
    const match = findProductByName(query);
    return match ? buildProductFrames(match) : undefined;
  }
  if (scenarioId === 'chat-event') {
    const match = findEventByTitle(query);
    return match ? buildEventFrames(match) : undefined;
  }
  return undefined;
}

type AgentRequestBody = {
  request_id?: string;
  conversation_id?: string;
  query?: string;
  expo_id?: string;
  locale?: string;
};

function extractQuery(body: unknown): string {
  const record = (body ?? {}) as AgentRequestBody;
  return typeof record.query === 'string' ? record.query : '';
}

export function registerAgentRoutes(app: FastifyInstance): void {
  app.post('/internal/v1/agent/stream', async (request, reply) => {
    const body = request.body as AgentRequestBody | undefined;
    const query = extractQuery(body);
    const override = overrideScenarioId(
      request.headers as Record<string, unknown>,
      request.query as Record<string, unknown> | undefined,
    );
    const scenarioId = pickChatScenarioId(query, override);
    const scenario = await getScenario(scenarioId);

    if (scenario.transport.initial_delay_ms > 0) {
      await delay(scenario.transport.initial_delay_ms);
    }

    if (scenario.transport.http_status !== 200) {
      const envelope = await buildInternalErrorEnvelope(
        scenario,
        body?.request_id,
      );
      reply.code(scenario.transport.http_status);
      for (const [name, value] of Object.entries(
        scenario.transport.response_headers ?? {},
      )) {
        reply.header(name, value);
      }
      return reply.send(envelope);
    }

    // 只在没有显式 scenario_id 覆盖时才尝试按名字动态匹配——BFF 自己的集成
    // 测试靠 override 拿确定性的静态内容，不能被这里的匹配悄悄改掉。
    const dynamicFrames = override
      ? undefined
      : dynamicFramesForScenario(scenarioId, query);
    const frames = dynamicFrames ?? parseSse(await loadFixtureText(scenario.file));
    const limit = scenario.transport.interrupt_after_events ?? frames.length;

    reply.hijack();
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-scenario-id': scenario.id,
    });
    for (const frame of frames.slice(0, limit)) {
      reply.raw.write(
        `event: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`,
      );
    }
    reply.raw.end();
    return undefined;
  });

  app.post('/internal/v1/agent', async (request, reply) => {
    const body = request.body as AgentRequestBody | undefined;
    const query = extractQuery(body);
    const override = overrideScenarioId(
      request.headers as Record<string, unknown>,
      request.query as Record<string, unknown> | undefined,
    );

    // I02 shares I01's pre-stream failure scenarios so a genuinely failing
    // upstream can be exercised through BFF's non-stream fallback path too.
    const errorScenarioId = pickErrorScenarioId(query, override);
    if (errorScenarioId) {
      const scenario = await getScenario(errorScenarioId);
      if (scenario.transport.initial_delay_ms > 0) {
        await delay(scenario.transport.initial_delay_ms);
      }
      const envelope = await buildInternalErrorEnvelope(
        scenario,
        body?.request_id,
      );
      reply.code(scenario.transport.http_status);
      for (const [name, value] of Object.entries(
        scenario.transport.response_headers ?? {},
      )) {
        reply.header(name, value);
      }
      return reply.send(envelope);
    }

    let answerStatus: 'answered' | 'abstain' | 'clarify' | 'conflict' =
      'answered';
    if (/(不知道|拒答)/.test(query)) answerStatus = 'abstain';
    else if (/(多个|哪个)/.test(query)) answerStatus = 'clarify';
    else if (/冲突/.test(query)) answerStatus = 'conflict';

    return reply.code(200).send({
      conversation_id: body?.conversation_id ?? 'conv_mock',
      message_id: `msg_mock_${buildTraceId()}`,
      answer: '这是一条 Mock 非流式回答，仅用于联调，不代表真实检索结果。',
      answer_status: answerStatus,
      cards: [],
      citations: [],
      suggestions: [],
      versions: { kb: 'kb_mock_1', search: 'search_mock_1', prompt: 'prompt_mock_1' },
      internal_trace: null,
    });
  });
}
