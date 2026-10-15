/**
 * 存储后端不可用。
 *
 * 调用方必须「失败关闭」：鉴权和限流一旦拿不到共享状态，就返回统一的
 * 503，绝不允许放行请求。宁可短暂拒绝服务，也不能出现「Redis 挂了 →
 * 所有人都不限流、无效 token 也能用」。
 *
 * message 只描述操作本身，绝不包含 token / Cookie / Authorization。
 */
export class StoreUnavailableError extends Error {
  readonly operation: string;

  constructor(operation: string, cause?: unknown) {
    super(`store unavailable during ${operation}`);
    this.name = 'StoreUnavailableError';
    this.operation = operation;
    if (cause !== undefined) {
      this.cause = cause;
    }
  }
}
