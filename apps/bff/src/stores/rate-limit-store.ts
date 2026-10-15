export interface RateLimitDecision {
  allowed: boolean;
  /** 仅在 allowed=false 时有意义，用于 Retry-After（秒，至少 1）。 */
  retryAfterSeconds: number;
}

export interface RateLimitStore {
  readonly name: string;
  /**
   * 记一次命中并给出是否放行。计数与窗口都必须存在共享后端里，
   * 多个 BFF 实例才会共用同一个配额。
   */
  hit(key: string, windowMs: number, max: number): Promise<RateLimitDecision>;
  close(): Promise<void>;
}

interface WindowState {
  count: number;
  resetAt: number;
}

/** 进程内固定窗口实现。仅用于单元测试，不具备跨实例语义。 */
export class InMemoryRateLimitStore implements RateLimitStore {
  readonly name = 'memory';
  private readonly windows = new Map<string, WindowState>();

  async hit(
    key: string,
    windowMs: number,
    max: number,
  ): Promise<RateLimitDecision> {
    const now = Date.now();
    let state = this.windows.get(key);

    if (!state || state.resetAt <= now) {
      state = { count: 0, resetAt: now + windowMs };
      this.windows.set(key, state);
    }

    state.count += 1;

    if (state.count > max) {
      return {
        allowed: false,
        retryAfterSeconds: Math.max(1, Math.ceil((state.resetAt - now) / 1000)),
      };
    }
    return { allowed: true, retryAfterSeconds: 0 };
  }

  async close(): Promise<void> {
    this.windows.clear();
  }
}
