import path from 'node:path';

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function resolveSourceFile(currentFile: string, source: string): string {
  if (/^[a-z][a-z\d+.-]*:/i.test(source)) {
    throw new Error(`不支持远程 Schema $ref 来源：${source}`);
  }

  const resolved = path.posix.normalize(
    path.posix.join(
      path.posix.dirname(currentFile),
      decodeURIComponent(source),
    ),
  );
  if (resolved.startsWith('../') || path.posix.isAbsolute(resolved)) {
    throw new Error(`Schema $ref 超出 manifest 范围：${source}`);
  }

  return resolved;
}

function resolvePointer(
  document: unknown,
  fragment: string,
  reference: string,
): unknown {
  if (fragment === '') {
    return document;
  }
  if (!fragment.startsWith('/')) {
    throw new Error(`Schema $ref 不是 JSON Pointer：${reference}`);
  }

  let target = document;
  for (const encodedToken of fragment.slice(1).split('/')) {
    const token = decodeURIComponent(encodedToken)
      .replaceAll('~1', '/')
      .replaceAll('~0', '~');
    if (!isObject(target) && !Array.isArray(target)) {
      throw new Error(`Schema $ref 目标不存在：${reference}`);
    }
    if (!(token in target)) {
      throw new Error(`Schema $ref 目标不存在：${reference}`);
    }
    target = target[token as keyof typeof target];
  }

  return target;
}

export function validateSchemaReferences(
  schemas: ReadonlyMap<string, unknown>,
): void {
  const visit = (value: unknown, currentFile: string): void => {
    if (Array.isArray(value)) {
      for (const child of value) visit(child, currentFile);
      return;
    }
    if (!isObject(value)) return;

    const reference = value.$ref;
    if (typeof reference === 'string') {
      const hashIndex = reference.indexOf('#');
      const source =
        hashIndex === -1 ? reference : reference.slice(0, hashIndex);
      const fragment = hashIndex === -1 ? '' : reference.slice(hashIndex + 1);
      const targetFile = source
        ? resolveSourceFile(currentFile, source)
        : currentFile;
      const targetSchema = schemas.get(targetFile);
      if (targetSchema === undefined) {
        throw new Error(`Schema $ref 来源不存在：${reference}`);
      }
      resolvePointer(targetSchema, fragment, reference);
    }

    for (const child of Object.values(value)) visit(child, currentFile);
  };

  for (const [file, schema] of schemas) visit(schema, file);
}
