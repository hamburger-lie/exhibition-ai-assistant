import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Ajv2020 } from 'ajv/dist/2020.js';
import type { ErrorObject, ValidateFunction } from 'ajv/dist/2020.js';
import * as AjvFormatsModule from 'ajv-formats';

type AjvInstance = InstanceType<typeof Ajv2020>;
// ajv-formats only ships a default export; under NodeNext's CJS interop the
// synthesized default type collapses to the whole module namespace, so the
// call signature must be asserted through `unknown` rather than inferred.
const addFormats = AjvFormatsModule.default as unknown as (
  ajv: AjvInstance,
) => AjvInstance;

const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));

// apps/bff/src/validation -> src -> bff -> apps -> <repo root>
const contractsDirectory = path.resolve(
  moduleDirectory,
  '../../../../packages/contracts',
);
const schemaDirectory = path.join(contractsDirectory, 'schemas');

function loadJson(filePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(filePath, 'utf8')) as Record<
    string,
    unknown
  >;
}

let ajvInstance: AjvInstance | undefined;

function getAjv(): AjvInstance {
  if (ajvInstance) {
    return ajvInstance;
  }

  const ajv = new Ajv2020({ allErrors: true, strict: true });
  addFormats(ajv);

  const manifest = loadJson(
    path.join(contractsDirectory, 'schemas.manifest.json'),
  ) as unknown as { schemas: string[] };

  for (const file of manifest.schemas) {
    ajv.addSchema(loadJson(path.join(schemaDirectory, file)));
  }

  ajvInstance = ajv;
  return ajv;
}

/** Fetches a compiled validator for a fully-qualified `$id#/$defs/...` ref. */
export function getValidator(ref: string): ValidateFunction {
  const validate = getAjv().getSchema(ref);
  if (!validate) {
    throw new Error(`Unknown schema reference: ${ref}`);
  }
  return validate;
}

export function formatAjvErrors(
  errors: ErrorObject[] | null | undefined,
): string {
  if (!errors || errors.length === 0) {
    return 'request body does not match the contract';
  }
  return errors
    .map((error) => `${error.instancePath || '/'} ${error.message ?? ''}`.trim())
    .join('; ');
}
