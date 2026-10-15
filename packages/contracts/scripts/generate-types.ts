import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { compile, type JSONSchema } from 'json-schema-to-typescript';

import { validateSchemaReferences } from './schema-references.js';

const contractDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const schemaDirectory = path.join(contractDirectory, 'schemas');
const outputDirectory = path.resolve(
  contractDirectory,
  '..',
  'generated-types',
  'src',
);
const outputFile = path.join(outputDirectory, 'index.ts');

const typeTargets = {
  session_request: 'SessionRequest',
  session_response: 'SessionResponse',
  config_response: 'ConfigResponse',
  public_chat_request: 'PublicChatRequest',
  public_chat_response: 'PublicChatResponse',
  entity_details_response: 'EntityDetailsResponse',
  agent_request: 'AgentRequest',
  internal_agent_response: 'InternalAgentResponse',
  search_request: 'SearchRequest',
  search_response: 'SearchResponse',
  retrieve_request: 'RetrieveRequest',
  retrieve_response: 'RetrieveResponse',
  resolve_request: 'ResolveRequest',
  resolve_response: 'ResolveResponse',
  health_response: 'HealthResponse',
  version_response: 'VersionResponse',
  entity_card: 'EntityCard',
  citation: 'Citation',
  feedback_request: 'FeedbackRequest',
  feedback_response: 'FeedbackResponse',
  quality_signals_request: 'QualitySignalsRequest',
  quality_signals_response: 'QualitySignalsResponse',
  events_batch_request: 'EventsBatchRequest',
  events_batch_response: 'EventsBatchResponse',
  sse_event: 'SseEvent',
  public_error: 'PublicError',
  public_error_envelope: 'PublicErrorEnvelope',
  internal_error_envelope: 'InternalErrorEnvelope',
};

const manifest = JSON.parse(
  await readFile(path.join(contractDirectory, 'schemas.manifest.json'), 'utf8'),
) as { schemas: string[] };
const schemaFiles = manifest.schemas;
const discoveredSchemaFiles = (await readdir(schemaDirectory))
  .filter((file) => file.endsWith('.schema.json'))
  .sort();
if (
  JSON.stringify([...schemaFiles].sort()) !==
  JSON.stringify(discoveredSchemaFiles)
) {
  throw new Error('schemas.manifest.json 与 schemas 目录不一致');
}

const maximumTupleItems = 8;

function prepareSchemaForTypeGeneration(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(prepareSchemaForTypeGeneration);
  }

  if (value === null || typeof value !== 'object') {
    return value;
  }

  const prepared: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (
      key === 'maxItems' &&
      typeof child === 'number' &&
      child > maximumTupleItems
    ) {
      continue;
    }

    if (key === '$ref' && typeof child === 'string') {
      const match = child.match(/(?:[^#]+)?#\/\$defs\/(.+)$/);
      prepared[key] = match ? `#/definitions/${match[1]}` : child;
      continue;
    }

    prepared[key] = prepareSchemaForTypeGeneration(child);
  }

  return prepared;
}

const definitions: Record<string, JSONSchema> = {};
const schemas = new Map<string, { $defs: Record<string, JSONSchema> }>();

for (const file of schemaFiles) {
  const schema = JSON.parse(
    await readFile(path.join(schemaDirectory, file), 'utf8'),
  ) as {
    $defs: Record<string, JSONSchema>;
  };

  schemas.set(file, schema);
}

validateSchemaReferences(schemas);

for (const schema of schemas.values()) {
  for (const [name, definition] of Object.entries(schema.$defs)) {
    if (definitions[name]) {
      throw new Error(`Schema definition 名称重复：${name}`);
    }
    definitions[name] = prepareSchemaForTypeGeneration(
      definition,
    ) as JSONSchema;
  }
}

const aggregateSchema: JSONSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'ApiContract',
  type: 'object',
  properties: Object.fromEntries(
    Object.entries(typeTargets).map(([property, definition]) => [
      property,
      { $ref: `#/definitions/${definition}` },
    ]),
  ),
  required: Object.keys(typeTargets),
  additionalProperties: false,
  definitions,
};

const source = await compile(aggregateSchema, 'ApiContract', {
  bannerComment:
    '/* 此文件由 packages/contracts/scripts/generate-types.ts 自动生成，请勿手工修改。 */',
  cwd: schemaDirectory,
  format: true,
  style: {
    bracketSpacing: true,
    printWidth: 80,
    semi: true,
    singleQuote: true,
    tabWidth: 2,
    trailingComma: 'all',
    useTabs: false,
  },
  unknownAny: true,
});

if (/\bany\b/.test(source)) {
  throw new Error('生成类型包含显式 any');
}

if (process.argv.includes('--check')) {
  const committed = await readFile(outputFile);
  if (!committed.equals(Buffer.from(source, 'utf8'))) {
    throw new Error(
      '生成类型已漂移；请运行 pnpm --filter @ai-assistant/contracts generate 并提交结果。',
    );
  }
} else {
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(outputFile, source, 'utf8');
}
