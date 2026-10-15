/**
 * Deterministic, keyword-driven scenario selection for the B-side mock.
 * Task 4 explicitly forbids real search/agent logic: routes only ever pick
 * one of the 20 fixed fixtures from packages/test-fixtures/manifest.json.
 *
 * Every route also accepts an `x-scenario-id` header (or `scenario_id` query
 * string field) override so BFF integration tests can deterministically
 * request a specific scenario without relying on keyword heuristics.
 */

export const SCENARIO_HEADER = 'x-scenario-id';
export const SCENARIO_QUERY = 'scenario_id';

export function overrideScenarioId(
  headers: Record<string, unknown>,
  query: Record<string, unknown> | undefined,
): string | undefined {
  const headerValue = headers[SCENARIO_HEADER];
  if (typeof headerValue === 'string' && headerValue.trim().length > 0) {
    return headerValue.trim();
  }
  const queryValue = query?.[SCENARIO_QUERY];
  if (typeof queryValue === 'string' && queryValue.trim().length > 0) {
    return queryValue.trim();
  }
  return undefined;
}

type KeywordRule = { pattern: RegExp; id: string };

// Pre-stream failure scenarios (checked first): keywords chosen so they do
// not collide with the in-stream chat-error keywords below.
const errorKeywordRules: KeywordRule[] = [
  { pattern: /限流/, id: 'http-429' },
  { pattern: /(服务不可用|不可用)/, id: 'http-503' },
  { pattern: /超时/, id: 'initial-timeout' },
  { pattern: /旧届/, id: 'old-expo' },
];

const chatKeywordRules: KeywordRule[] = [
  { pattern: /展位/, id: 'chat-booth' },
  { pattern: /产品/, id: 'chat-product' },
  { pattern: /活动/, id: 'chat-event' },
  { pattern: /(不知道|拒答)/, id: 'chat-abstain' },
  { pattern: /(多个|哪个)/, id: 'chat-ambiguous' },
  { pattern: /冲突/, id: 'chat-conflict' },
  { pattern: /中断/, id: 'chat-interrupted' },
  { pattern: /未知事件/, id: 'chat-unknown-event' },
  { pattern: /(错误|故障)/, id: 'chat-error' },
  { pattern: /展商/, id: 'chat-exhibitor' },
];

export function pickChatScenarioId(
  query: string,
  override: string | undefined,
): string {
  if (override) return override;
  for (const rule of errorKeywordRules) {
    if (rule.pattern.test(query)) return rule.id;
  }
  for (const rule of chatKeywordRules) {
    if (rule.pattern.test(query)) return rule.id;
  }
  return 'chat-exhibitor';
}

/**
 * I02 (non-stream Agent) shares the same pre-stream failure scenarios as I01
 * so BFF's fallback path can be exercised against a genuinely failing
 * upstream too. Returns undefined when the query doesn't match any error
 * keyword (and no override was given), meaning I02 should answer normally.
 */
export function pickErrorScenarioId(
  query: string,
  override: string | undefined,
): string | undefined {
  if (override) {
    return errorKeywordRules.some((rule) => rule.id === override)
      ? override
      : undefined;
  }
  for (const rule of errorKeywordRules) {
    if (rule.pattern.test(query)) return rule.id;
  }
  return undefined;
}

const searchKeywordRules: KeywordRule[] = [
  { pattern: /精确/, id: 'search-exact' },
  { pattern: /模糊/, id: 'search-fuzzy' },
  { pattern: /混合/, id: 'search-hybrid' },
];

export function pickSearchScenarioId(
  query: string,
  override: string | undefined,
): string {
  if (override) return override;
  for (const rule of searchKeywordRules) {
    if (rule.pattern.test(query)) return rule.id;
  }
  return 'search-hybrid';
}
