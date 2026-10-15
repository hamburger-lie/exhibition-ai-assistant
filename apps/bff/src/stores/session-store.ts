import { randomUUID } from 'node:crypto';

/** 会话记录。token 本身是 key，不存在记录体里，避免被日志整体打印出去。 */
export interface SessionRecord {
  sessionId: string;
  anonymousUserId: string;
  defaultConversationId: string;
  expoId: string;
  expiresAt: Date;
}

export interface SessionStore {
  readonly name: string;
  /** 写入会话；TTL 到期后存储层自动清除。 */
  save(token: string, record: SessionRecord, ttlSeconds: number): Promise<void>;
  /** 读取会话；不存在或已过期返回 undefined。 */
  find(token: string): Promise<SessionRecord | undefined>;
  close(): Promise<void>;
}

export function newSessionToken(): string {
  return `sess_${randomUUID()}`;
}

export function newSessionRecord(
  expoId: string,
  ttlSeconds: number,
): SessionRecord {
  return {
    sessionId: `session_${randomUUID()}`,
    anonymousUserId: `anon_${randomUUID()}`,
    defaultConversationId: `conv_${randomUUID()}`,
    expoId,
    expiresAt: new Date(Date.now() + ttlSeconds * 1000),
  };
}

/**
 * 进程内实现。仅用于单元测试——多实例部署下每个进程各存各的，
 * 一个实例签发的 token 到另一个实例就会失效。
 */
export class InMemorySessionStore implements SessionStore {
  readonly name = 'memory';
  private readonly records = new Map<string, SessionRecord>();

  // TTL 由记录里的 expiresAt 承担，这里不需要额外的定时清理。
  async save(token: string, record: SessionRecord): Promise<void> {
    this.records.set(token, record);
  }

  async find(token: string): Promise<SessionRecord | undefined> {
    const record = this.records.get(token);
    if (!record) return undefined;
    if (record.expiresAt.getTime() <= Date.now()) {
      this.records.delete(token);
      return undefined;
    }
    return record;
  }

  async close(): Promise<void> {
    this.records.clear();
  }
}
