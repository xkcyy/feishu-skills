import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

import {
  ROOT_PACKAGE_JSON,
  RUNTIME_DIR,
  RUNTIME_PACKAGE_JSON,
} from './paths.mjs';

const RUNTIME_NAME = 'feishu-skill-runtime';

function cleanVersionSpec(versionSpec) {
  if (!versionSpec || typeof versionSpec !== 'string') {
    return undefined;
  }

  return versionSpec.trim().replace(/^[~^]/, '');
}

async function readRepoVersions() {
  try {
    const raw = await fs.readFile(ROOT_PACKAGE_JSON, 'utf8');
    const pkg = JSON.parse(raw);

    return {
      larkVersion:
        cleanVersionSpec(process.env.FEISHU_SKILL_LARK_VERSION) ||
        cleanVersionSpec(pkg.name === '@larksuite/openclaw-lark' ? pkg.version : undefined) ||
        'latest',
      openclawVersion:
        cleanVersionSpec(process.env.FEISHU_SKILL_OPENCLAW_VERSION) ||
        cleanVersionSpec(pkg.devDependencies?.openclaw) ||
        cleanVersionSpec(pkg.dependencies?.openclaw) ||
        'latest',
    };
  } catch {
    return {
      larkVersion: cleanVersionSpec(process.env.FEISHU_SKILL_LARK_VERSION) || 'latest',
      openclawVersion: cleanVersionSpec(process.env.FEISHU_SKILL_OPENCLAW_VERSION) || 'latest',
    };
  }
}

async function ensureRuntimePackageJson() {
  await fs.mkdir(RUNTIME_DIR, { recursive: true });

  try {
    await fs.access(RUNTIME_PACKAGE_JSON);
  } catch {
    await fs.writeFile(
      RUNTIME_PACKAGE_JSON,
      `${JSON.stringify(
        {
          name: RUNTIME_NAME,
          private: true,
          type: 'module',
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
  }
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readInstalledPackageVersion(packageName) {
  try {
    const packageRoot = await resolvePackageRoot(packageName);
    const packageJsonPath = path.join(packageRoot, 'package.json');
    const raw = await fs.readFile(packageJsonPath, 'utf8');
    const pkg = JSON.parse(raw);
    return cleanVersionSpec(pkg.version);
  } catch {
    return undefined;
  }
}

async function findPackageRootFromEntry(packageName, entryPath) {
  let currentDir = path.dirname(entryPath);
  const filesystemRoot = path.parse(currentDir).root;

  while (true) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    if (await pathExists(packageJsonPath)) {
      try {
        const raw = await fs.readFile(packageJsonPath, 'utf8');
        const pkg = JSON.parse(raw);
        if (pkg.name === packageName) {
          return currentDir;
        }
      } catch {
        // Ignore invalid package.json and keep walking upward.
      }
    }

    if (currentDir === filesystemRoot) {
      break;
    }

    currentDir = path.dirname(currentDir);
  }

  throw new Error(`Unable to locate package root for ${packageName}`);
}

async function collectJsFiles(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectJsFiles(fullPath)));
      continue;
    }
    if (entry.isFile() && fullPath.endsWith('.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

function needsExtensionRewrite(specifier) {
  return (
    (specifier.startsWith('./') || specifier.startsWith('../')) &&
    !specifier.endsWith('.js') &&
    !specifier.endsWith('.mjs') &&
    !specifier.endsWith('.cjs') &&
    !specifier.endsWith('.json')
  );
}

async function resolvePatchedSpecifier(filePath, specifier) {
  if (!needsExtensionRewrite(specifier)) {
    return specifier;
  }

  const fileDir = path.dirname(filePath);
  const jsCandidate = path.resolve(fileDir, `${specifier}.js`);
  if (await pathExists(jsCandidate)) {
    return `${specifier}.js`;
  }

  const indexCandidate = path.resolve(fileDir, specifier, 'index.js');
  if (await pathExists(indexCandidate)) {
    return `${specifier}/index.js`;
  }

  return specifier;
}

async function patchRelativeImportsInFile(filePath) {
  const source = await fs.readFile(filePath, 'utf8');
  let updated = source;
  let changed = false;

  const patterns = [
    /(from\s+)(["'])(\.\.?\/[^"'()]+)\2/g,
    /(import\s+)(["'])(\.\.?\/[^"'()]+)\2/g,
    /(import\s*\()(["'])(\.\.?\/[^"'()]+)\2/g,
  ];

  for (const pattern of patterns) {
    let result = '';
    let lastIndex = 0;
    let hasMatch = false;

    for (const match of updated.matchAll(pattern)) {
      hasMatch = true;
      const [fullMatch, prefix, quote, specifier] = match;
      const replacementSpecifier = await resolvePatchedSpecifier(filePath, specifier);
      const replacement = `${prefix}${quote}${replacementSpecifier}${quote}`;
      result += updated.slice(lastIndex, match.index) + replacement;
      lastIndex = match.index + fullMatch.length;
      if (replacementSpecifier !== specifier) {
        changed = true;
      }
    }

    if (hasMatch) {
      result += updated.slice(lastIndex);
      updated = result;
    }
  }

  if (changed) {
    await fs.writeFile(filePath, updated, 'utf8');
  }
}

function patchMarkerPath(packageName) {
  return path.join(
    RUNTIME_DIR,
    `.patched-${packageName.replace(/[^a-zA-Z0-9._-]/g, '_')}.json`,
  );
}

async function patchPackageForNodeEsm(packageName) {
  const version = await readInstalledPackageVersion(packageName);
  if (!version) {
    return;
  }

  const markerPath = patchMarkerPath(packageName);
  const markerExists = await pathExists(markerPath);

  if (markerExists) {
    try {
      const markerRaw = await fs.readFile(markerPath, 'utf8');
      const marker = JSON.parse(markerRaw);
      if (marker.version === version) {
        return;
      }
    } catch {
      // Ignore broken marker and patch again.
    }
  }

  const packageRoot = await resolvePackageRoot(packageName);
  const jsFiles = await collectJsFiles(packageRoot);
  for (const filePath of jsFiles) {
    await patchRelativeImportsInFile(filePath);
  }

  await fs.writeFile(
    markerPath,
    `${JSON.stringify({ packageName, version }, null, 2)}\n`,
    'utf8',
  );
}

function runCommand(command, args, { cwd }) {
  const isWindows = process.platform === 'win32';
  const executable = isWindows ? 'cmd.exe' : command;
  const executableArgs = isWindows ? ['/d', '/s', '/c', command, ...args] : args;

  return new Promise((resolve, reject) => {
    const child = spawn(executable, executableArgs, {
      cwd,
      stdio: 'inherit',
      env: {
        ...process.env,
        npm_config_loglevel: process.env.npm_config_loglevel || 'error',
      },
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

export async function ensureRuntime({ force = false } = {}) {
  await ensureRuntimePackageJson();

  const { larkVersion, openclawVersion } = await readRepoVersions();

  const installedLarkVersion = await readInstalledPackageVersion('@larksuite/openclaw-lark');
  const installedOpenclawVersion = await readInstalledPackageVersion('openclaw');

  const needsInstall =
    force ||
    installedLarkVersion !== larkVersion ||
    installedOpenclawVersion !== openclawVersion;

  if (!needsInstall) {
    await patchPackageForNodeEsm('@larksuite/openclaw-lark');
    await patchPackageForNodeEsm('openclaw');

    return {
      runtimeDir: RUNTIME_DIR,
      versions: {
        larkVersion,
        openclawVersion,
      },
    };
  }

  const npmExecutable = 'npm';
  const installArgs = [
    'install',
    '--no-save',
    '--package-lock=false',
    `@larksuite/openclaw-lark@${larkVersion}`,
    `openclaw@${openclawVersion}`,
  ];

  await runCommand(npmExecutable, installArgs, { cwd: RUNTIME_DIR });

  await patchPackageForNodeEsm('@larksuite/openclaw-lark');
  await patchPackageForNodeEsm('openclaw');

  return {
    runtimeDir: RUNTIME_DIR,
    versions: {
      larkVersion,
      openclawVersion,
    },
  };
}

export function createRuntimeRequire() {
  return createRequire(pathToFileURL(RUNTIME_PACKAGE_JSON));
}

export async function importFromRuntime(specifier) {
  const requireFromRuntime = createRuntimeRequire();

  try {
    const resolved = requireFromRuntime.resolve(specifier);
    return import(pathToFileURL(resolved).href);
  } catch (error) {
    if (error?.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED') {
      throw error;
    }

    const packageNames = ['@larksuite/openclaw-lark', 'openclaw', '@sinclair/typebox'];
    const matchedPackage = packageNames.find((packageName) => {
      return specifier === packageName || specifier.startsWith(`${packageName}/`);
    });

    if (!matchedPackage) {
      throw error;
    }

    const packageRoot = await resolvePackageRoot(matchedPackage);
    const relativePath =
      specifier === matchedPackage ? 'index.js' : specifier.slice(matchedPackage.length + 1);
    const resolved = path.join(packageRoot, relativePath);

    return import(pathToFileURL(resolved).href);
  }
}

export async function resolvePackageRoot(packageName) {
  const requireFromRuntime = createRuntimeRequire();

  try {
    const packageJsonPath = requireFromRuntime.resolve(`${packageName}/package.json`);
    return path.dirname(packageJsonPath);
  } catch (error) {
    if (
      error?.code !== 'ERR_PACKAGE_PATH_NOT_EXPORTED' &&
      error?.code !== 'MODULE_NOT_FOUND'
    ) {
      throw error;
    }
  }

  const entryPath = requireFromRuntime.resolve(packageName);
  return findPackageRootFromEntry(packageName, entryPath);
}
