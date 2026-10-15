import { CardActions } from './CardActions.js';
import type { CardActionHandlers, ExhibitorCardData } from './card-types.js';

export interface ExhibitorCardProps {
  card: ExhibitorCardData;
  handlers?: CardActionHandlers | undefined;
}

/**
 * 展商卡（规格 §4.2）：展商名称、主营品类、展馆/展位号、简短介绍，以及接口
 * 提供的动作。缺失字段直接隐藏，不显示虚构占位值。
 */
export function ExhibitorCard({ card, handlers }: ExhibitorCardProps) {
  const { payload } = card;
  const booths = payload.booths.map((booth) => booth.display_code).join('、');

  return (
    <div className="entity-card" data-entity-id={card.entity_id}>
      <h3 className="entity-card__title">{card.title}</h3>

      {card.subtitle && <p className="entity-card__subtitle">{card.subtitle}</p>}

      <p className="entity-card__meta">
        {payload.hall_name}
        {booths ? ` · ${booths}` : ''}
      </p>

      {payload.categories && payload.categories.length > 0 && (
        <div className="entity-card__badges">
          {payload.categories.map((category) => (
            <span key={category} className="entity-card__badge">
              {category}
            </span>
          ))}
        </div>
      )}

      {payload.recommendation_reason && (
        <p className="entity-card__desc">{payload.recommendation_reason}</p>
      )}

      <CardActions actions={card.actions} card={card} handlers={handlers} />
    </div>
  );
}
