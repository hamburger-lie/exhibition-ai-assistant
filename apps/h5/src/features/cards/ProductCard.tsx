import { CardActions } from './CardActions.js';
import type { CardActionHandlers, ProductCardData } from './card-types.js';

export interface ProductCardProps {
  card: ProductCardData;
  handlers?: CardActionHandlers | undefined;
}

/**
 * 产品卡（规格 §4.2）：产品名称、所属品牌、分类、所在展位；「去展位」只在
 * 接口给出对应动作时出现（由 CardActions 依据 card.actions 渲染）。
 *
 * 注意：规格提到的「产品图片」在已冻结的 card.schema.json ProductPayload 中
 * 没有对应字段（只有 ExhibitorPayload 有 logo_url）。按 §4.2「缺失字段直接
 * 隐藏，不显示虚构占位值」，这里不渲染图片，也不编造图片地址；需要产品图时
 * 必须先走契约变更流程新增字段。
 */
export function ProductCard({ card, handlers }: ProductCardProps) {
  const { payload } = card;

  return (
    <div className="entity-card" data-entity-id={card.entity_id}>
      <h3 className="entity-card__title">{card.title}</h3>

      {card.subtitle && <p className="entity-card__subtitle">{card.subtitle}</p>}

      <p className="entity-card__meta">
        {payload.brand ? `${payload.brand} · ` : ''}
        {payload.category}
      </p>

      {payload.functions && payload.functions.length > 0 && (
        <div className="entity-card__badges">
          {payload.functions.map((fn) => (
            <span key={fn} className="entity-card__badge">
              {fn}
            </span>
          ))}
        </div>
      )}

      <CardActions actions={card.actions} card={card} handlers={handlers} />
    </div>
  );
}
