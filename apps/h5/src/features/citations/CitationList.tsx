import type { CitationData } from '../cards/card-types.js';
import { IconChevronDown } from '../../shared/ui/icons.js';

export interface CitationListProps {
  citations: CitationData[];
}

const SOURCE_TYPE_LABEL: Record<CitationData['source_type'], string> = {
  structured_data: '结构化数据',
  faq: 'FAQ',
  document: '文档',
  webpage_internal: '站内页面',
};

/**
 * 规格 §4.3：默认折叠为「参考依据 N」，展开后显示真实 source_id、来源名称与
 * page_or_row。只渲染 B 方实际返回的字段，缺失字段直接不显示，不补造占位值。
 */
export function CitationList({ citations }: CitationListProps) {
  if (citations.length === 0) {
    return null;
  }

  return (
    <details className="citations">
      <summary className="citations__summary">
        参考依据 {citations.length}
        <IconChevronDown className="citations__chevron" />
      </summary>
      <ul className="citations__list">
        {citations.map((citation, index) => (
          <li key={citation.citation_id} className="citation">
            <span className="citation__index">[{index + 1}]</span>
            <div>
              <p className="citation__title">{citation.title}</p>
              <p className="citation__meta">
                {SOURCE_TYPE_LABEL[citation.source_type]} · {citation.source_id}
                {citation.page_or_row ? ` · ${citation.page_or_row}` : ''}
              </p>
              {citation.snippet && (
                <p className="citation__snippet">{citation.snippet}</p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}
