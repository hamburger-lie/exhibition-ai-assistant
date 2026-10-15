import { CardActions } from './CardActions.js';
import type { CardActionHandlers, EventCardData } from './card-types.js';

export interface EventCardProps {
  card: EventCardData;
  handlers?: CardActionHandlers | undefined;
}

const STATUS_LABEL: Record<EventCardData['payload']['status'], string> = {
  scheduled: '未开始',
  ongoing: '进行中',
  ended: '已结束',
  cancelled: '已取消',
};

/** 只做展示格式化，不改变接口返回的时间语义（含时区偏移）。 */
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * 活动卡（规格 §4.2）：活动名称、日期、开始时间、场地和活动类型；只展示接口
 * 实际提供的详情或位置操作。
 */
export function EventCard({ card, handlers }: EventCardProps) {
  const { payload } = card;

  return (
    <div className="entity-card" data-entity-id={card.entity_id}>
      <h3 className="entity-card__title">{card.title}</h3>

      {card.subtitle && <p className="entity-card__subtitle">{card.subtitle}</p>}

      <p className="entity-card__meta">
        {formatDate(payload.start_at)} {formatTime(payload.start_at)} ·{' '}
        {payload.venue}
      </p>

      <div className="entity-card__badges">
        <span className="entity-card__badge">
          {STATUS_LABEL[payload.status]}
        </span>
        {payload.tags?.map((tag) => (
          <span key={tag} className="entity-card__badge">
            {tag}
          </span>
        ))}
      </div>

      <CardActions actions={card.actions} card={card} handlers={handlers} />
    </div>
  );
}
