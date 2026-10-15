import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

// apps/mock-b/src -> apps/mock-b -> apps -> <repo root>
export const fixturesDirectory = path.resolve(
  moduleDirectory,
  '../../../packages/test-fixtures',
);

export type ScenarioTransport = {
  http_status: number;
  initial_delay_ms: number;
  interrupt_after_events?: number;
  response_headers?: Record<string, string>;
};

export type Scenario = {
  id: string;
  file: string;
  format: 'sse' | 'json';
  contract: string | null;
  transport: ScenarioTransport;
  expect: {
    terminal: 'done' | 'error' | 'interrupted' | 'none';
    unknown_events?: string[];
    semantic?: Record<string, unknown>;
  };
};

export type Manifest = {
  version: number;
  scenarios: Scenario[];
};

export type SseFrame = {
  event: string;
  data: Record<string, unknown>;
};

/**
 * Resolves a fixture filename against the fixtures directory and verifies the
 * resolved path's parent directory is strictly the fixtures directory. This
 * defends against path traversal via crafted filenames/manifest entries and
 * must not rely on basename checks alone.
 */
function resolveFixturePath(filename: string): string {
  const resolved = path.resolve(fixturesDirectory, filename);
  if (path.dirname(resolved) !== fixturesDirectory) {
    throw new Error(`Unsafe fixture path rejected: ${filename}`);
  }
  return resolved;
}

export async function loadFixtureText(filename: string): Promise<string> {
  const resolvedPath = resolveFixturePath(filename);
  return readFile(resolvedPath, 'utf8');
}

export async function loadFixtureJson(
  filename: string,
): Promise<Record<string, unknown>> {
  return JSON.parse(await loadFixtureText(filename)) as Record<
    string,
    unknown
  >;
}

let manifestCache: Manifest | undefined;

export async function loadManifest(): Promise<Manifest> {
  manifestCache ??= JSON.parse(
    await loadFixtureText('manifest.json'),
  ) as Manifest;
  return manifestCache;
}

export async function getScenario(id: string): Promise<Scenario> {
  const manifest = await loadManifest();
  const scenario = manifest.scenarios.find((item) => item.id === id);
  if (!scenario) {
    throw new Error(`Unknown fixture scenario id: ${id}`);
  }
  return scenario;
}

export function parseSse(source: string): SseFrame[] {
  return source
    .replace(/\r\n?|\n/g, '\n')
    .trimEnd()
    .split(/\n{2,}/)
    .filter((block) => block.trim().length > 0)
    .map((block) => {
      let event = '';
      const dataLines: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        if (line.startsWith('data:')) dataLines.push(line.slice(5).trimStart());
      }
      if (!event || dataLines.length === 0) {
        throw new Error(`Invalid SSE block in fixture: ${block}`);
      }
      return {
        event,
        data: JSON.parse(dataLines.join('\n')) as Record<string, unknown>,
      };
    });
}

export function buildTraceId(): string {
  return `trace_mock_${randomUUID()}`;
}

export function delay(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Builds an InternalErrorEnvelope (packages/contracts/schemas/error.schema.json)
 * from one of the pre-stream failure fixtures (error-429.json, error-503.json,
 * error-timeout.json, error-old-expo.json), which are authored as
 * PublicErrorEnvelope bodies (no trace_id). We add a trace_id to satisfy the
 * internal contract while reusing the fixture's code/message/user_message.
 */
export async function buildInternalErrorEnvelope(
  scenario: Scenario,
  requestId?: string,
): Promise<Record<string, unknown>> {
  const fixtureBody = await loadFixtureJson(scenario.file);
  const fixtureError = (fixtureBody.error ?? {}) as Record<string, unknown>;
  return {
    request_id: requestId ?? fixtureBody.request_id ?? 'req_mock',
    success: false,
    data: null,
    error: {
      ...fixtureError,
      trace_id: buildTraceId(),
    },
  };
}
