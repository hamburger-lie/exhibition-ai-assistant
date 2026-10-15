import { describe, expect, test } from 'vitest';

import { resolveStatusText } from './StatusIndicator.js';

describe('resolveStatusText (spec §5.2)', () => {
  test.each([
    ['understanding', '正在理解你的问题'],
    ['searching', '正在查找相关信息'],
    ['reranking', '正在筛选结果'],
    ['answering', '正在整理回答'],
  ])('maps stage %s to its user-facing copy', (stage, expected) => {
    expect(resolveStatusText(stage, '上游原始文案')).toBe(expected);
  });

  test('falls back to the upstream display_text for an unknown stage', () => {
    expect(resolveStatusText('brand_new_stage', '上游原始文案')).toBe(
      '上游原始文案',
    );
  });

  test('returns null when there is neither a known stage nor display text', () => {
    expect(resolveStatusText(null, null)).toBeNull();
  });
});
