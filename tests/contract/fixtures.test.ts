import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { describe, expect, test } from 'vitest';

const root = process.cwd();
const contractsDirectory = path.join(root, 'packages', 'contracts');
const fixturesDirectory = path.join(root, 'packages', 'test-fixtures');
const knownEvents = new Set([
  'message.start',
  'status.update',
  'message.delta',
  'entity.card',
  'citation',
  'suggestion.list',
  'message.done',
  'message.error',
]);

type Scenario = {
  id: string;
  file: string;
  format: 'sse' | 'json';
  contract: string | null;
  transport: {
    http_status: number;
    initial_delay_ms: number;
    interrupt_after_events?: number;
    response_headers?: Record<string, string>;
  };
  expect: {
    terminal: 'done' | 'error' | 'interrupted' | 'none';
    unknown_events?: string[];
    expo_id?: string;
    expo_policy?: string;
    semantic?: {
      route?: string;
      trace_branches?: string[];
      chunks_count?: number;
      card_type?: string;
      required_events?: string[];
      answer_status?: string;
      error_code?: string;
      event_count?: number;
      first_event?: boolean;
      http_status?: number;
      min_initial_delay_ms?: number;
      retry_after_seconds?: number;
      entity_type?: string;
      config_version?: string;
      source_ids?: string[];
    };
  };
};

async function json(file: string) {
  return JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
}

async function ajvWithContracts() {
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);
  const manifest = (await json(
    path.join(contractsDirectory, 'schemas.manifest.json'),
  )) as unknown as { schemas: string[] };
  for (const file of manifest.schemas)
    ajv.addSchema(await json(path.join(contractsDirectory, 'schemas', file)));
  return ajv;
}

function parseSse(source: string) {
  return source
    .replace(/\r\n?|\n/g, '\n')
    .trimEnd()
    .split(/\n{2,}/)
    .filter((block) => block.trim().length > 0)
    .map((block) => {
      let event = '';
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('event:')) event = line.slice(6).trim();
        if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
      }
      if (!event || data.length === 0)
        throw new Error(`Invalid SSE block: ${block}`);
      return {
        event,
        data: JSON.parse(data.join('\n')) as Record<string, unknown>,
      };
    });
}

function compareScenarioFiles(actual: string[], declared: string[]) {
  const extra = actual.filter((file) => !declared.includes(file)).sort();
  const missing = declared.filter((file) => !actual.includes(file)).sort();
  return { extra, missing };
}

function undeclaredUnknownEvents(
  events: ReturnType<typeof parseSse>,
  declared: string[] = [],
) {
  return events
    .map(({ event }) => event)
    .filter((event) => !knownEvents.has(event) && !declared.includes(event));
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function semanticMismatches(
  scenario: Scenario,
  body: Record<string, unknown> | undefined,
  events: ReturnType<typeof parseSse> | undefined,
) {
  const semantic = scenario.expect.semantic!;
  const mismatches: string[] = [];
  const eventNames = events?.map(({ event }) => event) ?? [];
  const eventData = (name: string) =>
    events?.find(({ event }) => event === name)?.data;

  if (semantic.route !== undefined && body?.route !== semantic.route)
    mismatches.push('route');
  if (semantic.trace_branches) {
    const trace = object(body?.trace);
    for (const branch of semantic.trace_branches)
      if (!(branch in trace)) mismatches.push(`trace.${branch}`);
  }
  if (
    semantic.chunks_count !== undefined &&
    (!Array.isArray(body?.chunks) ||
      body.chunks.length !== semantic.chunks_count)
  )
    mismatches.push('chunks_count');
  if (semantic.card_type !== undefined) {
    const card = object(eventData('entity.card')?.card);
    if (card.type !== semantic.card_type) mismatches.push('card_type');
  }
  for (const required of semantic.required_events ?? [])
    if (!eventNames.includes(required)) mismatches.push(`event.${required}`);
  if (semantic.answer_status !== undefined) {
    if (eventData('message.done')?.answer_status !== semantic.answer_status)
      mismatches.push('answer_status');
  }
  if (semantic.error_code !== undefined) {
    const streamError = object(eventData('message.error')?.error).code;
    const jsonError = object(body?.error).code;
    if ((streamError ?? jsonError) !== semantic.error_code)
      mismatches.push('error_code');
  }
  if (
    semantic.event_count !== undefined &&
    events?.length !== semantic.event_count
  )
    mismatches.push('event_count');
  if (semantic.first_event === false && scenario.format !== 'json')
    mismatches.push('first_event');
  if (
    semantic.http_status !== undefined &&
    scenario.transport.http_status !== semantic.http_status
  )
    mismatches.push('http_status');
  if (
    semantic.min_initial_delay_ms !== undefined &&
    scenario.transport.initial_delay_ms < semantic.min_initial_delay_ms
  )
    mismatches.push('initial_delay_ms');
  if (semantic.retry_after_seconds !== undefined) {
    const retryAfter = scenario.transport.response_headers?.['Retry-After'];
    if (Number(retryAfter) !== semantic.retry_after_seconds)
      mismatches.push('retry_after_seconds');
  }
  if (semantic.entity_type !== undefined) {
    if (object(body?.data).entity_type !== semantic.entity_type)
      mismatches.push('entity_type');
  }
  if (semantic.config_version !== undefined) {
    if (object(body?.data).config_version !== semantic.config_version)
      mismatches.push('config_version');
  }
  if (semantic.source_ids) {
    const actual =
      events
        ?.filter(({ event }) => event === 'citation')
        .map(({ data }) => String(object(data.citation).source_id)) ?? [];
    if (JSON.stringify(actual) !== JSON.stringify(semantic.source_ids))
      mismatches.push('source_ids');
  }
  return mismatches;
}

type RelationshipFixtures = {
  searches: Record<'exact' | 'fuzzy', Record<string, unknown>>;
  cards: Record<'exhibitor' | 'booth' | 'product', Record<string, unknown>>;
};

const canonicalIds = {
  exhibitor: 'exhibitor_huayan',
  product: 'product_collagen_serum',
  booth: 'booth_demo_C18',
  mapShape: 'shape_demo_C18',
  exhibitorSource: 'source_exhibitors_2026',
  conflictSources: ['source_events_2026', 'source_notice_2026'],
};

const protocolConstants = {
  rateLimitStatus: 429,
  rateLimitRetryAfter: '2',
  unavailableStatus: 503,
  unavailableRetryAfter: '5',
  timeoutStatus: 504,
  timeoutDelayMs: 30001,
};

function relationshipMismatches(fixtures: RelationshipFixtures) {
  const mismatches: string[] = [];
  const searchCases = [
    { name: 'exact' as const, traceBranch: 'exact' },
    { name: 'fuzzy' as const, traceBranch: 'lexical' },
  ];
  for (const { name, traceBranch } of searchCases) {
    const search = fixtures.searches[name];
    const result = object((search.results as unknown[])[0]);
    const entity = object(result.entity);
    const branch = object(object(search.trace)[traceBranch]);
    if (result.entity_id !== canonicalIds.exhibitor)
      mismatches.push(`${name}.entity_id`);
    if (
      !Array.isArray(entity.booth_ids) ||
      !entity.booth_ids.includes(canonicalIds.booth)
    )
      mismatches.push(`${name}.booth_id`);
    if (
      !Array.isArray(branch.top_ids) ||
      !branch.top_ids.includes(canonicalIds.exhibitor)
    )
      mismatches.push(`${name}.top_id`);
  }

  for (const name of ['exhibitor', 'booth', 'product'] as const) {
    const actions = fixtures.cards[name].actions;
    const cardActions = Array.isArray(actions) ? actions.map(object) : [];
    const highlights = cardActions.filter(
      (action) => action.type === 'highlight_booth',
    );
    if (highlights.length === 0) {
      mismatches.push(`${name}.action.booth_id`);
      mismatches.push(`${name}.action.map_shape_id`);
    }
    for (const highlight of highlights) {
      if (highlight.booth_id !== canonicalIds.booth)
        mismatches.push(`${name}.action.booth_id`);
      if (highlight.map_shape_id !== canonicalIds.mapShape)
        mismatches.push(`${name}.action.map_shape_id`);
    }
    for (const openEntity of cardActions.filter(
      (action) => action.type === 'open_entity',
    ))
      if (openEntity.entity_id !== canonicalIds[name])
        mismatches.push(`${name}.action.entity_id`);
  }
  return mismatches;
}

const manifest = (await json(
  path.join(fixturesDirectory, 'manifest.json'),
)) as unknown as { version: number; scenarios: Scenario[] };

describe('fixed mock fixtures', () => {
  test('manifest is closed, unique, and declares exactly 20 scenario fixtures', async () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    const validate = ajv.compile(
      await json(path.join(fixturesDirectory, 'scenario.schema.json')),
    );
    expect(validate(manifest), JSON.stringify(validate.errors)).toBe(true);
    expect(new Set(manifest.scenarios.map(({ id }) => id)).size).toBe(20);
    expect(new Set(manifest.scenarios.map(({ file }) => file)).size).toBe(20);
    expect(
      manifest.scenarios.every(
        ({ expect: expectation }) =>
          expectation.semantic && Object.keys(expectation.semantic).length > 0,
      ),
    ).toBe(true);
  });

  test('rejects unsafe paths and invalid format, contract, or terminal combinations', async () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    const validate = ajv.compile(
      await json(path.join(fixturesDirectory, 'scenario.schema.json')),
    );
    const mutations = [
      (copy: typeof manifest) => {
        copy.scenarios[0].file = '../outside.json';
      },
      (copy: typeof manifest) => {
        copy.scenarios[0].file = 'C:outside.sse';
      },
      (copy: typeof manifest) => {
        copy.scenarios[0].file = 'chat-stream-exhibitor.sse:evil.sse';
      },
      (copy: typeof manifest) => {
        copy.scenarios[0].file = 'outside/file.sse';
      },
      (copy: typeof manifest) => {
        copy.scenarios[0].file = 'outside\\file.sse';
      },
      (copy: typeof manifest) => {
        copy.scenarios[0].file = 'chat..sse';
      },
      (copy: typeof manifest) => {
        copy.scenarios[0].file = 'chat-stream-exhibitor.json';
      },
      (copy: typeof manifest) => {
        copy.scenarios.find(({ id }) => id === 'search-exact')!.contract = null;
      },
      (copy: typeof manifest) => {
        copy.scenarios.find(
          ({ id }) => id === 'chat-exhibitor',
        )!.expect.terminal = 'error';
      },
    ];
    for (const mutate of mutations) {
      const copy = structuredClone(manifest);
      mutate(copy);
      expect(validate(copy)).toBe(false);
    }
  });

  test('parses CRLF, CR, repeated separators, multiline data, and UTF-8', () => {
    const source =
      'event: message.delta\rdata: {"request_id":"r",\rdata: "message_id":"m","delta":"你好"}\r\r\r\revent: message.done\r\ndata: {"ok":true}\r\n\r\n';
    expect(parseSse(source)).toEqual([
      {
        event: 'message.delta',
        data: { request_id: 'r', message_id: 'm', delta: '你好' },
      },
      { event: 'message.done', data: { ok: true } },
    ]);
  });

  test('detects an undeclared unknown event introduced by a spelling mutation', async () => {
    const scenario = manifest.scenarios.find(
      ({ id }) => id === 'chat-exhibitor',
    )!;
    const source = await readFile(
      path.join(fixturesDirectory, scenario.file),
      'utf8',
    );
    const mutated = parseSse(source.replace('status.update', 'status.updte'));
    expect(
      undeclaredUnknownEvents(mutated, scenario.expect.unknown_events),
    ).toEqual(['status.updte']);
  });

  test('manifest and on-disk scenario files form the same closed set', async () => {
    const actual = (await readdir(fixturesDirectory))
      .filter((file) => /\.(?:json|sse)$/.test(file))
      .filter(
        (file) => file !== 'manifest.json' && file !== 'scenario.schema.json',
      );
    const declared = manifest.scenarios.map(({ file }) => file);
    expect(compareScenarioFiles(actual, declared)).toEqual({
      extra: [],
      missing: [],
    });
    expect(
      compareScenarioFiles([...actual, 'unregistered.json'], declared),
    ).toEqual({ extra: ['unregistered.json'], missing: [] });
    expect(compareScenarioFiles(actual, [...declared, 'missing.sse'])).toEqual({
      extra: [],
      missing: ['missing.sse'],
    });
  });

  test('every JSON fixture validates against its declared public contract', async () => {
    const ajv = await ajvWithContracts();
    for (const scenario of manifest.scenarios.filter(
      ({ format }) => format === 'json',
    )) {
      const body = await json(path.join(fixturesDirectory, scenario.file));
      const validate = ajv.getSchema(scenario.contract!);
      expect(validate, scenario.contract!).toBeTypeOf('function');
      expect(
        validate!(body),
        `${scenario.id}: ${JSON.stringify(validate!.errors)}`,
      ).toBe(true);
    }
  });

  test('all 20 fixtures satisfy their data-driven semantic expectations', async () => {
    for (const scenario of manifest.scenarios) {
      const source = await readFile(
        path.join(fixturesDirectory, scenario.file),
        'utf8',
      );
      const body =
        scenario.format === 'json'
          ? (JSON.parse(source) as Record<string, unknown>)
          : undefined;
      const events = scenario.format === 'sse' ? parseSse(source) : undefined;
      expect(semanticMismatches(scenario, body, events), scenario.id).toEqual(
        [],
      );
    }

    const exact = manifest.scenarios.find(({ id }) => id === 'search-exact')!;
    const mutated = (await json(
      path.join(fixturesDirectory, exact.file),
    )) as Record<string, unknown>;
    mutated.route = 'fuzzy';
    expect(semanticMismatches(exact, mutated, undefined)).toContain('route');
  });

  test('parses SSE framing and validates every known event in sequence', async () => {
    const ajv = await ajvWithContracts();
    const validate = ajv.getSchema(
      'https://assistant.example/schemas/events.schema.json#/$defs/SseEvent',
    )!;
    for (const scenario of manifest.scenarios.filter(
      ({ format }) => format === 'sse',
    )) {
      const events = parseSse(
        await readFile(path.join(fixturesDirectory, scenario.file), 'utf8'),
      );
      const actualUnknown = events
        .filter(({ event }) => !knownEvents.has(event))
        .map(({ event }) => event);
      expect(actualUnknown, `${scenario.id}: unknown events`).toEqual(
        scenario.expect.unknown_events ?? [],
      );
      expect(
        undeclaredUnknownEvents(events, scenario.expect.unknown_events),
        scenario.id,
      ).toEqual([]);
      expect(events[0]?.event, scenario.id).toBe('message.start');
      for (const item of events.filter(({ event }) => knownEvents.has(event))) {
        expect(
          validate(item),
          `${scenario.id}/${item.event}: ${JSON.stringify(validate.errors)}`,
        ).toBe(true);
      }
      const terminals = events.filter(
        ({ event }) => event === 'message.done' || event === 'message.error',
      );
      if (scenario.expect.terminal === 'interrupted') {
        expect(terminals).toHaveLength(0);
        expect(events, scenario.id).toHaveLength(
          scenario.transport.interrupt_after_events,
        );
      } else
        expect(terminals.map(({ event }) => event)).toEqual([
          `message.${scenario.expect.terminal}`,
        ]);
      if (terminals.length) expect(events.at(-1)).toBe(terminals[0]);
    }
  });

  test('models interruption, error termination, unknown-event tolerance, and pre-stream failures', async () => {
    const byId = new Map(
      manifest.scenarios.map((scenario) => [scenario.id, scenario]),
    );
    expect(
      byId.get('chat-interrupted')?.transport.interrupt_after_events,
    ).toBeGreaterThanOrEqual(1);
    expect(byId.get('chat-error')?.expect.terminal).toBe('error');
    expect(byId.get('http-429')?.transport).toMatchObject({
      http_status: protocolConstants.rateLimitStatus,
      initial_delay_ms: 0,
      response_headers: {
        'Retry-After': protocolConstants.rateLimitRetryAfter,
      },
    });
    expect(byId.get('http-503')?.transport).toMatchObject({
      http_status: protocolConstants.unavailableStatus,
      initial_delay_ms: 0,
      response_headers: {
        'Retry-After': protocolConstants.unavailableRetryAfter,
      },
    });
    expect(byId.get('initial-timeout')?.transport).toMatchObject({
      http_status: protocolConstants.timeoutStatus,
      initial_delay_ms: protocolConstants.timeoutDelayMs,
    });
    const unknown = byId.get('chat-unknown-event')!;
    const events = parseSse(
      await readFile(path.join(fixturesDirectory, unknown.file), 'utf8'),
    );
    expect(
      events
        .filter(({ event }) => !knownEvents.has(event))
        .map(({ event }) => event),
    ).toEqual(unknown.expect.unknown_events);
  });

  test('keeps expo filtering and linked entity, booth, map-shape, and source IDs stable', async () => {
    const oldExpo = manifest.scenarios.find(({ id }) => id === 'old-expo')!;
    expect(oldExpo.expect).toMatchObject({
      expo_id: 'expo_demo_2025_spring',
      expo_policy: 'hard_filter_no_fallback',
    });
    const exhibitorBody = await json(
      path.join(fixturesDirectory, 'entity-exhibitor.json'),
    );
    const entity = object(object(exhibitorBody.data).entity);
    const entityBooth = object((entity.booths as unknown[])[0]);
    const readStreamCard = async (file: string) => {
      const events = parseSse(
        await readFile(path.join(fixturesDirectory, file), 'utf8'),
      );
      return {
        events,
        card: object(
          events.find(({ event }) => event === 'entity.card')?.data.card,
        ),
      };
    };
    const exhibitor = await readStreamCard('chat-stream-exhibitor.sse');
    const booth = await readStreamCard('chat-stream-booth.sse');
    const product = await readStreamCard('chat-stream-product.sse');
    const exhibitorPayload = object(exhibitor.card.payload);
    const boothPayload = object(booth.card.payload);
    const productPayload = object(product.card.payload);
    const hybrid = await json(
      path.join(fixturesDirectory, 'search-hybrid.json'),
    );
    const hybridResult = object((hybrid.results as unknown[])[0]);
    const hybridEntity = object(hybridResult.entity);

    expect(entity.id).toBe(canonicalIds.exhibitor);
    expect(entityBooth.booth_id).toBe(canonicalIds.booth);
    expect(entityBooth.map_shape_id).toBe(canonicalIds.mapShape);
    expect(exhibitor.card.entity_id).toBe(canonicalIds.exhibitor);
    expect(object((exhibitorPayload.booths as unknown[])[0])).toEqual(
      entityBooth,
    );
    expect(booth.card.entity_id).toBe(canonicalIds.booth);
    expect(boothPayload.booth_id).toBe(canonicalIds.booth);
    expect(boothPayload.map_shape_id).toBe(canonicalIds.mapShape);
    expect(product.card.entity_id).toBe(canonicalIds.product);
    expect(productPayload.exhibitor_id).toBe(canonicalIds.exhibitor);
    expect(productPayload.booth_ids).toContain(canonicalIds.booth);
    expect(hybridResult.entity_id).toBe(canonicalIds.product);
    expect(hybridEntity.exhibitor_id).toBe(canonicalIds.exhibitor);
    expect(hybridEntity.booth_ids).toContain(canonicalIds.booth);

    const citation = object(
      exhibitor.events.find(({ event }) => event === 'citation')?.data.citation,
    );
    expect(citation.source_id).toBe(canonicalIds.exhibitorSource);
    expect(
      manifest.scenarios.find(({ id }) => id === 'chat-exhibitor')?.expect
        .semantic?.source_ids,
    ).toEqual([citation.source_id]);

    const conflictEvents = parseSse(
      await readFile(
        path.join(fixturesDirectory, 'chat-stream-conflict.sse'),
        'utf8',
      ),
    );
    expect(
      conflictEvents
        .filter(({ event }) => event === 'citation')
        .map(({ data }) => object(data.citation).source_id),
    ).toEqual(canonicalIds.conflictSources);
  });

  test('locks exact/fuzzy search links and all highlight actions to canonical IDs', async () => {
    const readCard = async (file: string) => {
      const events = parseSse(
        await readFile(path.join(fixturesDirectory, file), 'utf8'),
      );
      return object(
        events.find(({ event }) => event === 'entity.card')?.data.card,
      );
    };
    const fixtures: RelationshipFixtures = {
      searches: {
        exact: await json(path.join(fixturesDirectory, 'search-exact.json')),
        fuzzy: await json(path.join(fixturesDirectory, 'search-fuzzy.json')),
      },
      cards: {
        exhibitor: await readCard('chat-stream-exhibitor.sse'),
        booth: await readCard('chat-stream-booth.sse'),
        product: await readCard('chat-stream-product.sse'),
      },
    };
    expect(relationshipMismatches(fixtures)).toEqual([]);

    const wrongExact = structuredClone(fixtures);
    object((wrongExact.searches.exact.results as unknown[])[0]).entity_id =
      'wrong';
    expect(relationshipMismatches(wrongExact)).toContain('exact.entity_id');

    const wrongFuzzy = structuredClone(fixtures);
    object(object(wrongFuzzy.searches.fuzzy.trace).lexical).top_ids = ['wrong'];
    object(
      object((wrongFuzzy.searches.fuzzy.results as unknown[])[0]).entity,
    ).booth_ids = ['wrong'];
    expect(relationshipMismatches(wrongFuzzy)).toEqual(
      expect.arrayContaining(['fuzzy.top_id', 'fuzzy.booth_id']),
    );

    const wrongAction = structuredClone(fixtures);
    const productAction = (wrongAction.cards.product.actions as unknown[]).find(
      (action) => object(action).type === 'highlight_booth',
    );
    object(productAction).map_shape_id = 'wrong';
    expect(relationshipMismatches(wrongAction)).toContain(
      'product.action.map_shape_id',
    );

    const secondWrongHighlight = structuredClone(fixtures);
    (secondWrongHighlight.cards.product.actions as unknown[]).push({
      type: 'highlight_booth',
      booth_id: 'wrong',
      map_shape_id: 'wrong',
    });
    expect(relationshipMismatches(secondWrongHighlight)).toEqual(
      expect.arrayContaining([
        'product.action.booth_id',
        'product.action.map_shape_id',
      ]),
    );

    const wrongOpenEntity = structuredClone(fixtures);
    (wrongOpenEntity.cards.product.actions as unknown[]).push({
      type: 'open_entity',
      entity_id: 'wrong',
    });
    expect(relationshipMismatches(wrongOpenEntity)).toContain(
      'product.action.entity_id',
    );
  });
});
