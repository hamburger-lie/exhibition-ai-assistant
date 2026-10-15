import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  EntityDetailData,
  EntityDetailProvider,
  EntityDetailQuery,
  EntityDetailResult,
} from './entity-detail-provider.js';
import {
  buildEvents,
  buildExhibitors,
  buildGuideExhibitors,
  buildProducts,
} from '@ai-assistant/demo-catalog';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
// apps/bff/src/entities -> src -> bff -> apps -> <repo root>
const fixturesDir = path.resolve(
  moduleDir,
  '../../../../packages/test-fixtures',
);

/**
 * 本地/联调用的实体详情来源。
 *
 * 展商直接复用已冻结的 `entity-exhibitor.json`；产品与活动在这里补齐——
 * 那 20 条 fixture 是被契约测试锁死的封闭集合，不能往里加文件，所以这两条
 * 样例数据放在 BFF 自己这边。三者的 ID 与 SSE 卡片 fixture 严格对齐
 * （exhibitor_huayan / product_collagen_serum / event_ai_forum，
 * 共用 booth_demo_C18 / shape_demo_C18），保证「卡片 → 详情」链路可闭环。
 *
 * 字段一律来自 chat.schema.json 的 ExhibitorEntity / ProductEntity /
 * EventEntity 定义，未新增任何业务字段。
 */

function readExhibitorFixture(): EntityDetailData {
  const raw = JSON.parse(
    readFileSync(path.join(fixturesDir, 'entity-exhibitor.json'), 'utf8'),
  ) as { data: EntityDetailData };
  return raw.data;
}

const HALL_DEMO = { id: 'hall_demo', name: '5.2馆' };
const BOOTH_C18 = {
  booth_id: 'booth_demo_C18',
  display_code: 'C18',
  map_shape_id: 'shape_demo_C18',
};

const PRODUCT_COLLAGEN_SERUM: EntityDetailData = {
  entity_type: 'product',
  entity: {
    id: 'product_collagen_serum',
    name: '胶原焕颜精华',
    category: '护肤精华',
    functions: ['保湿'],
    brand: '华研',
    exhibitor_id: 'exhibitor_huayan',
    hall: HALL_DEMO,
    booths: [BOOTH_C18],
    tags: ['胶原蛋白'],
    description: '含胶原蛋白的护肤精华，展台可试用。',
    status: 'published',
  },
};

const EVENT_AI_FORUM: EntityDetailData = {
  entity_type: 'event',
  entity: {
    id: 'event_ai_forum',
    title: 'AI赋能美业论坛',
    start_at: '2026-08-25T10:00:00+08:00',
    end_at: '2026-08-25T11:30:00+08:00',
    venue: '5.2馆论坛区',
    hall: HALL_DEMO,
    status: 'scheduled',
    speakers: ['林老师'],
    tags: ['AI'],
    description: 'AI 在美业场景中的应用分享。',
  },
};

export class FixtureEntityDetailProvider implements EntityDetailProvider {
  readonly name = 'fixture';

  private readonly byTypeAndId = new Map<string, EntityDetailData>();

  constructor() {
    // 三个锚点实体优先注册且内容固定：它们的 ID 和展位号与聊天里返回的
    // SSE 卡片 fixture 严格对齐，不能被下面批量生成的样例数据覆盖。
    const exhibitor = readExhibitorFixture();
    this.register(exhibitor);
    this.register(PRODUCT_COLLAGEN_SERUM);
    this.register(EVENT_AI_FORUM);

    // 真机测试用的大批量样例数据；用 registerIfAbsent 保证不会覆盖上面
    // 三个锚点实体（生成器内部按约定复用了同样的 id 做占位，这里跳过）。
    const exhibitors = buildExhibitors();
    for (const item of exhibitors) this.registerIfAbsent(item);
    for (const item of buildProducts(exhibitors)) this.registerIfAbsent(item);
    for (const item of buildEvents()) this.registerIfAbsent(item);
    for (const item of buildGuideExhibitors()) this.registerIfAbsent(item);
  }

  private register(data: EntityDetailData): void {
    const id = data.entity.id as string;
    this.byTypeAndId.set(`${data.entity_type}:${id}`, data);
  }

  private registerIfAbsent(data: EntityDetailData): void {
    const id = data.entity.id as string;
    const key = `${data.entity_type}:${id}`;
    if (!this.byTypeAndId.has(key)) {
      this.byTypeAndId.set(key, data);
    }
  }

  async fetch(query: EntityDetailQuery): Promise<EntityDetailResult> {
    // 类型与 ID 必须同时匹配：用产品类型去查展商 ID 应当是「找不到」，
    // 而不是跨类型返回另一个实体。
    const found = this.byTypeAndId.get(`${query.entityType}:${query.entityId}`);
    return found ? { kind: 'found', data: found } : { kind: 'not_found' };
  }
}
