import type { SuggestionItem } from './chat-reducer.js';

export interface SuggestionListProps {
  suggestions: SuggestionItem[];
  onSelect: (text: string) => void;
}

/** 规格 §4.4：最多 3–4 条，允许换行；点击后发送原始建议文本。 */
export function SuggestionList({ suggestions, onSelect }: SuggestionListProps) {
  if (suggestions.length === 0) {
    return null;
  }

  return (
    <div className="suggestions">
      {suggestions.map((suggestion) => (
        <button
          key={suggestion.id}
          type="button"
          className="suggestions__item"
          onClick={() => onSelect(suggestion.text)}
        >
          {suggestion.text}
        </button>
      ))}
    </div>
  );
}
