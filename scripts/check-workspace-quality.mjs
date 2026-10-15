import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const workspaceRoots = ['apps', 'packages'];
const ignoredDirectories = new Set(['coverage', 'dist', 'node_modules']);
const requiredScripts = ['typecheck', 'build'];
const errors = [];

async function containsTypeScript(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
      continue;
    }

    const entryPath = path.join(directory, entry.name);

    if (entry.isDirectory() && (await containsTypeScript(entryPath))) {
      return true;
    }

    if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) {
      return true;
    }
  }

  return false;
}

for (const workspaceRoot of workspaceRoots) {
  let entries;

  try {
    entries = await readdir(workspaceRoot, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') {
      continue;
    }

    throw error;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const workspaceDirectory = path.join(workspaceRoot, entry.name);

    if (!(await containsTypeScript(workspaceDirectory))) {
      continue;
    }

    const manifestPath = path.join(workspaceDirectory, 'package.json');
    let manifest;

    try {
      manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    } catch (error) {
      errors.push(
        `${workspaceDirectory}: 无法读取有效的 package.json（${error.code ?? error.message}）`,
      );
      continue;
    }

    const missingScripts = requiredScripts.filter((script) => {
      const command = manifest.scripts?.[script];
      return typeof command !== 'string' || command.trim().length === 0;
    });

    if (missingScripts.length > 0) {
      errors.push(
        `${workspaceDirectory}: 包含 TypeScript 源码但缺少脚本：${missingScripts.join(', ')}`,
      );
    }
  }
}

if (errors.length > 0) {
  console.error('Workspace 质量检查失败：');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exitCode = 1;
}
