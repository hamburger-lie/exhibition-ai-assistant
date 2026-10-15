import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';

import {
  getEntityDetail,
  type EntityDetailData,
  type EntityDetailType,
} from '../../shared/api/client.js';
import { IconAlert, IconBack, IconBooth } from '../../shared/ui/icons.js';
import { useChat } from '../chat/ChatProvider.js';

const TYPE_LABEL: Record<EntityDetailType, string> = {
  exhibitor: '展商',
  product: '产品',
  event: '活动',
};

const EVENT_STATUS_LABEL: Record<string, string> = {
  scheduled: '未开始',
  ongoing: '进行中',
  ended: '已结束',
  cancelled: '已取消',
};

function isEntityType(value: string | undefined): value is EntityDetailType {
  return value === 'exhibitor' || value === 'product' || value === 'event';
}

function formatDateTime(iso?: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${date.getMonth() + 1}月${date.getDate()}日 ${hh}:${mm}`;
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; detail: EntityDetailData }
  | { status: 'error'; message: string; retryable: boolean };

/**
 * 实体详情页（UI 规格 §7.1）：顶部只保留返回、实体类型与名称；正文只渲染
 * E07 实际返回的字段，缺失字段直接隐藏，不补造占位值。
 *
 * 返回 Chat 时用 navigate(-1)，配合挂在路由之上的 ChatProvider，消息、输入
 * 草稿与滚动位置都保持不变。
 */
export function EntityDetailPage() {
  const navigate = useNavigate();
  const params = useParams<{ entity_type: string; entity_id: string }>();
  const [searchParams] = useSearchParams();
  const { session, expoId } = useChat();

  const entityType = params.entity_type;
  const entityId = params.entity_id ?? '';
  const expo = searchParams.get('expo_id') ?? expoId;

  const [state, setState] = useState<LoadState>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isEntityType(entityType) || !entityId) {
      setState({
        status: 'error',
        message: '不支持的实体类型。',
        retryable: false,
      });
      return undefined;
    }
    if (!session) {
      setState({ status: 'loading' });
      return undefined;
    }

    let cancelled = false;
    setState({ status: 'loading' });

    getEntityDetail(entityType, entityId, expo, session.session_token)
      .then((detail) => {
        if (!cancelled) setState({ status: 'ready', detail });
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        const userMessage =
          error && typeof error === 'object' && 'userMessage' in error
            ? String((error as { userMessage: unknown }).userMessage)
            : '服务暂时不可用，请稍后重试。';
        const retryable =
          error && typeof error === 'object' && 'retryable' in error
            ? Boolean((error as { retryable: unknown }).retryable)
            : true;
        setState({ status: 'error', message: userMessage, retryable });
      });

    return () => {
      cancelled = true;
    };
  }, [entityType, entityId, expo, session, attempt]);

  const entity = state.status === 'ready' ? state.detail.entity : undefined;
  const title = entity?.name ?? entity?.title ?? '';
  const typeLabel = isEntityType(entityType) ? TYPE_LABEL[entityType] : '详情';

  return (
    <div className="detail-page">
      <header className="detail-page__header">
        <button
          type="button"
          className="map-page__back"
          aria-label="返回对话"
          onClick={() => navigate(-1)}
        >
          <IconBack />
        </button>
        <div className="detail-page__heading">
          <p className="detail-page__type">{typeLabel}</p>
          <h1 className="detail-page__title">{title || typeLabel}</h1>
        </div>
      </header>

      {state.status === 'loading' && (
        <div className="screen-state" role="status">
          正在加载…
        </div>
      )}

      {state.status === 'error' && (
        <div className="screen-state" role="alert">
          <div>
            <p className="detail-page__error">
              <IconAlert className="msg__error-icon" />
              {state.message}
            </p>
            {state.retryable && (
              <button
                type="button"
                className="screen-state__retry"
                onClick={() => setAttempt((n) => n + 1)}
              >
                重试
              </button>
            )}
          </div>
        </div>
      )}

      {state.status === 'ready' && entity && (
        <div className="detail-page__body">
          {/* 活动：日期时间与场地 */}
          {state.detail.entity_type === 'event' && (
            <section className="detail-section">
              <p className="detail-section__line">
                {formatDateTime(entity.start_at)}
                {entity.end_at ? ` – ${formatDateTime(entity.end_at)}` : ''}
              </p>
              {entity.venue && (
                <p className="detail-section__line">{entity.venue}</p>
              )}
              {entity.status && (
                <span className="entity-card__badge">
                  {EVENT_STATUS_LABEL[entity.status] ?? entity.status}
                </span>
              )}
            </section>
          )}

          {state.detail.entity_type === 'exhibitor' ? (
            <>
              {/* 位置与展位 */}
              {(entity.hall || (entity.booths && entity.booths.length > 0)) && (
                <section className="detail-section">
                  <h2 className="detail-section__title">位置与展位</h2>
                  {entity.hall && (
                    <p className="detail-section__line">{entity.hall.name}</p>
                  )}
                  {entity.booths && entity.booths.length > 0 && (
                    <div className="detail-section__booths">
                      {entity.booths.map((booth) => (
                        <button
                          key={booth.booth_id}
                          type="button"
                          className="entity-card__action entity-card__action--primary"
                          onClick={() => {
                            const query = new URLSearchParams({
                              booths: JSON.stringify([booth]),
                            });
                            if (entity.hall) query.set('hall_id', entity.hall.id);
                            if (typeof entity.name === 'string' && entity.name) {
                              query.set('label', entity.name);
                            }
                            navigate(`/map?${query.toString()}`);
                          }}
                        >
                          <IconBooth size={18} />
                          {booth.display_code}
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {/* 展商信息：品牌 / 主营品类 / 标签合并到一张卡，不再一字段一卡 */}
              {(entity.brand ||
                (entity.brands && entity.brands.length > 0) ||
                (entity.categories && entity.categories.length > 0) ||
                (entity.tags && entity.tags.length > 0)) && (
                <section className="detail-section">
                  <h2 className="detail-section__title">展商信息</h2>

                  {(entity.brand || (entity.brands && entity.brands.length > 0)) && (
                    <div className="detail-field">
                      <p className="detail-field__label">品牌</p>
                      <p className="detail-section__line">
                        {entity.brand ?? entity.brands?.join('、')}
                      </p>
                    </div>
                  )}

                  {entity.categories && entity.categories.length > 0 && (
                    <div className="detail-field">
                      <p className="detail-field__label">主营品类</p>
                      <div className="entity-card__badges">
                        {entity.categories.map((category) => (
                          <span key={category} className="entity-card__badge">
                            {category}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {entity.tags && entity.tags.length > 0 && (
                    <div className="detail-field">
                      <p className="detail-field__label">标签</p>
                      <div className="entity-card__badges">
                        {entity.tags.map((tag) => (
                          <span key={tag} className="entity-card__badge">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </section>
              )}

              {/* 简介 */}
              {entity.description && (
                <section className="detail-section">
                  <h2 className="detail-section__title">简介</h2>
                  <p className="detail-section__text">{entity.description}</p>
                </section>
              )}
            </>
          ) : (
            <>
              {/* 产品/活动：馆号与展位 */}
              {(entity.hall || (entity.booths && entity.booths.length > 0)) && (
                <section className="detail-section">
                  {entity.hall && (
                    <p className="detail-section__line">{entity.hall.name}</p>
                  )}
                  {entity.booths && entity.booths.length > 0 && (
                    <div className="detail-section__booths">
                      {entity.booths.map((booth) => (
                        <button
                          key={booth.booth_id}
                          type="button"
                          className="entity-card__action entity-card__action--primary"
                          onClick={() => {
                            const query = new URLSearchParams({
                              booths: JSON.stringify([booth]),
                            });
                            if (entity.hall) query.set('hall_id', entity.hall.id);
                            if (typeof entity.name === 'string' && entity.name) {
                              query.set('label', entity.name);
                            }
                            navigate(`/map?${query.toString()}`);
                          }}
                        >
                          <IconBooth size={18} />
                          {booth.display_code}
                        </button>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {entity.category && (
                <section className="detail-section">
                  <h2 className="detail-section__title">分类</h2>
                  <p className="detail-section__line">{entity.category}</p>
                </section>
              )}

              {entity.brand && (
                <section className="detail-section">
                  <h2 className="detail-section__title">品牌</h2>
                  <p className="detail-section__line">{entity.brand}</p>
                </section>
              )}

              {entity.brands && entity.brands.length > 0 && (
                <section className="detail-section">
                  <h2 className="detail-section__title">品牌</h2>
                  <p className="detail-section__line">{entity.brands.join('、')}</p>
                </section>
              )}

              {entity.categories && entity.categories.length > 0 && (
                <section className="detail-section">
                  <h2 className="detail-section__title">主营品类</h2>
                  <div className="entity-card__badges">
                    {entity.categories.map((category) => (
                      <span key={category} className="entity-card__badge">
                        {category}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {entity.functions && entity.functions.length > 0 && (
                <section className="detail-section">
                  <h2 className="detail-section__title">功效</h2>
                  <div className="entity-card__badges">
                    {entity.functions.map((fn) => (
                      <span key={fn} className="entity-card__badge">
                        {fn}
                      </span>
                    ))}
                  </div>
                </section>
              )}

              {entity.speakers && entity.speakers.length > 0 && (
                <section className="detail-section">
                  <h2 className="detail-section__title">嘉宾</h2>
                  <p className="detail-section__line">{entity.speakers.join('、')}</p>
                </section>
              )}

              {entity.description && (
                <section className="detail-section">
                  <h2 className="detail-section__title">简介</h2>
                  <p className="detail-section__text">{entity.description}</p>
                </section>
              )}

              {entity.tags && entity.tags.length > 0 && (
                <section className="detail-section">
                  <div className="entity-card__badges">
                    {entity.tags.map((tag) => (
                      <span key={tag} className="entity-card__badge">
                        {tag}
                      </span>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
