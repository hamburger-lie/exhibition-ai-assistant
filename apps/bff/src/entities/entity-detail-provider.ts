/**
 * E07 实体详情的数据来源抽象。
 *
 * A 方本身不拥有权威实体数据，因此这里只定义「怎么取」，不定义「数据长什么
 * 样」——响应形状完全由已冻结的 `chat.schema.json#/$defs/EntityDetailsResponse`
 * 决定，Provider 不得增删业务字段。
 *
 * 关键约束：Provider 拿不到数据时必须如实上报 `unavailable`，路由据此返回
 * UPSTREAM_UNAVAILABLE；任何情况下都不允许编造实体详情。
 */

export const SUPPORTED_ENTITY_TYPES = ['exhibitor', 'product', 'event'] as const;
export type SupportedEntityType = (typeof SUPPORTED_ENTITY_TYPES)[number];

export function isSupportedEntityType(
  value: string,
): value is SupportedEntityType {
  return (SUPPORTED_ENTITY_TYPES as readonly string[]).includes(value);
}

export interface EntityDetailQuery {
  expoId: string;
  entityType: SupportedEntityType;
  entityId: string;
}

/** 与 EntityDetailsResponse.data 同形：{ entity_type, entity }。 */
export interface EntityDetailData {
  entity_type: SupportedEntityType;
  entity: Record<string, unknown>;
}

export type EntityDetailResult =
  | { kind: 'found'; data: EntityDetailData }
  | { kind: 'not_found' }
  /** 数据源不可用或返回了不符合契约的内容；`reason` 只进日志，不回给浏览器。 */
  | { kind: 'unavailable'; reason: string };

export interface EntityDetailProvider {
  readonly name: string;
  fetch(query: EntityDetailQuery): Promise<EntityDetailResult>;
}

/**
 * 生产环境未配置任何实体数据源时使用：一律上报不可用。
 *
 * 这是刻意的失败姿态——宁可让用户看到「服务暂时不可用」，也不能返回占位或
 * 猜测出来的展商/产品/活动信息。
 */
export class UnconfiguredEntityDetailProvider implements EntityDetailProvider {
  readonly name = 'unconfigured';

  async fetch(): Promise<EntityDetailResult> {
    return {
      kind: 'unavailable',
      reason: 'no entity detail provider configured',
    };
  }
}
