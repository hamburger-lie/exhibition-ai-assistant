import type {
  CardAction,
  CardActionHandlers,
  EntityCardData,
} from './card-types.js';

export interface CardActionsProps {
  actions: CardAction[];
  card: EntityCardData;
  handlers?: CardActionHandlers | undefined;
}

/**
 * 只依据卡片自带的结构化动作列表渲染按钮（entity_id / booth_id /
 * map_shape_id），绝不从 AI 自由文本里解析任何字段。
 *
 * 没有对应处理器的动作直接不渲染，避免出现点了没反应的死按钮。
 */
export function CardActions({ actions, card, handlers }: CardActionsProps) {
  const renderable = actions.filter((action) =>
    action.type === 'open_entity'
      ? Boolean(handlers?.onOpenEntity)
      : Boolean(handlers?.onHighlightBooth),
  );

  if (renderable.length === 0) {
    return null;
  }

  return (
    <div className="entity-card__actions">
      {renderable.map((action, index) => {
        if (action.type === 'open_entity') {
          return (
            <button
              key={`${action.type}_${action.entity_id}_${index}`}
              type="button"
              className="entity-card__action"
              onClick={() => handlers?.onOpenEntity?.(action.entity_id, card)}
            >
              {action.label}
            </button>
          );
        }

        return (
          <button
            key={`${action.type}_${action.booth_id}_${index}`}
            type="button"
            className="entity-card__action entity-card__action--primary"
            onClick={() =>
              handlers?.onHighlightBooth?.(action, card)
            }
          >
            {action.label}
          </button>
        );
      })}
    </div>
  );
}
