import { CardActions } from './CardActions.js';
import { EventCard } from './EventCard.js';
import { ExhibitorCard } from './ExhibitorCard.js';
import { ProductCard } from './ProductCard.js';
import type { CardActionHandlers, EntityCardData } from './card-types.js';

export interface EntityCardProps {
  card: EntityCardData;
  handlers?: CardActionHandlers | undefined;
}

/** Dispatches to the matching card component strictly by the card's own `type`. */
export function EntityCard({ card, handlers }: EntityCardProps) {
  switch (card.type) {
    case 'exhibitor':
      return <ExhibitorCard card={card} handlers={handlers} />;
    case 'product':
      return <ProductCard card={card} handlers={handlers} />;
    case 'event':
      return <EventCard card={card} handlers={handlers} />;
    case 'booth':
      return (
        <div className="entity-card entity-card--booth" data-entity-id={card.entity_id}>
          <h3 className="entity-card__title">{card.title}</h3>
          <p className="entity-card__booth-code">{card.payload.display_code}</p>
          <CardActions actions={card.actions} card={card} handlers={handlers} />
        </div>
      );
    default:
      return null;
  }
}
