import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { createPlaceholderClawConfig } from './config.mjs';
import { ensureRuntime, importFromRuntime } from './runtime.mjs';

const TYPEBOX_KIND = Symbol.for('TypeBox.Kind');
const VALIDATION_SCHEMA_CACHE = new WeakMap();

function createLogger(prefix = 'feishu-skill') {
  const format = (level, message) => {
    return `[${prefix}/${level}] ${message}`;
  };

  return {
    debug(message) {
      if (process.env.FEISHU_SKILL_DEBUG === '1') {
        console.debug(format('debug', message));
      }
    },
    info(message) {
      if (process.env.FEISHU_SKILL_DEBUG === '1') {
        console.log(format('info', message));
      }
    },
    warn(message) {
      console.warn(format('warn', message));
    },
    error(message) {
      console.error(format('error', message));
    },
  };
}

function formatSchemaErrors(errors) {
  return errors
    .slice(0, 5)
    .map((error) => {
      const path = error.path || '/';
      return `${path}: ${error.message}`;
    })
    .join(' | ');
}

function isObjectLike(value) {
  return value !== null && typeof value === 'object';
}

function cloneSchemaNode(node, registry) {
  if (Array.isArray(node)) {
    return node.map((value) => cloneSchemaNode(value, registry));
  }

  if (!node || typeof node !== 'object') {
    return node;
  }

  if (VALIDATION_SCHEMA_CACHE.has(node)) {
    return VALIDATION_SCHEMA_CACHE.get(node);
  }

  if (node[TYPEBOX_KIND] === 'Unsafe' && Array.isArray(node.enum) && node.enum.length > 0) {
    const unionOptions = {};
    for (const key of Reflect.ownKeys(node)) {
      if (key === TYPEBOX_KIND || key === 'type' || key === 'enum') {
        continue;
      }
      unionOptions[key] = cloneSchemaNode(node[key], registry);
    }

    const literals = node.enum.map((value) => registry.Type.Literal(value));
    const normalized = registry.Type.Union(literals, unionOptions);
    VALIDATION_SCHEMA_CACHE.set(node, normalized);
    return normalized;
  }

  const clone = {};
  VALIDATION_SCHEMA_CACHE.set(node, clone);

  for (const key of Reflect.ownKeys(node)) {
    clone[key] = cloneSchemaNode(node[key], registry);
  }

  return clone;
}

function getValidationSchema(registry, schema) {
  return cloneSchemaNode(schema, registry);
}

function getNonEmptyString(value) {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeToolPayload({ registry, ticket, tool, params }) {
  const rawResult = await registry.withTicket(ticket, () => tool.execute(ticket.messageId, params));
  const payload = extractToolPayload(rawResult);

  if (isToolErrorPayload(payload)) {
    throw new Error(payload.error);
  }

  return payload;
}

function findDriveRootFolderToken(files) {
  for (const file of files) {
    const parentToken = getNonEmptyString(file?.parent_token);
    if (parentToken) {
      return parentToken;
    }
  }

  return undefined;
}

async function findDriveRootProbeFileByName({ tool, registry, ticket, fileName, maxAttempts = 5 }) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const files = await listDriveFilesForRecovery(tool, registry, ticket);
    const match = files.find((file) => file?.name === fileName);
    if (match) {
      return match;
    }

    if (attempt < maxAttempts - 1) {
      await sleep(250 * (attempt + 1));
    }
  }

  return null;
}

async function resolveDriveRootFolderToken({ tool, registry, ticket }) {
  const rootFiles = await listDriveFilesForRecovery(tool, registry, ticket);
  const listedRootToken = findDriveRootFolderToken(rootFiles);
  if (listedRootToken) {
    return listedRootToken;
  }

  const probeContent = 'feishu-drive-root-token-probe\n';
  const probeName = `feishu-drive-root-token-${randomUUID()}.txt`;
  let probeToken;

  try {
    await executeToolPayload({
      registry,
      ticket,
      tool,
      params: {
        action: 'upload',
        file_name: probeName,
        file_content_base64: Buffer.from(probeContent, 'utf8').toString('base64'),
        size: Buffer.byteLength(probeContent, 'utf8'),
      },
    });

    const probeFile = await findDriveRootProbeFileByName({
      tool,
      registry,
      ticket,
      fileName: probeName,
    });
    const rootToken = getNonEmptyString(probeFile?.parent_token);
    probeToken = getNonEmptyString(probeFile?.token);

    if (rootToken) {
      return rootToken;
    }
  } finally {
    if (probeToken) {
      try {
        await executeToolPayload({
          registry,
          ticket,
          tool,
          params: {
            action: 'delete',
            file_token: probeToken,
            type: 'file',
          },
        });
      } catch {
        // Best-effort cleanup for the temporary root token probe.
      }
    }
  }

  throw new Error(
    'Unable to determine the Feishu Drive root folder token automatically. Pass folder_token explicitly.',
  );
}

async function withPreparedParams({ toolName, params, registry, ticket, tool, run }) {
  if (
    toolName === 'feishu_doc_media' &&
    params?.action === 'insert' &&
    typeof params.file_path === 'string' &&
    params.file_path.trim()
  ) {
    const sourcePath = path.resolve(params.file_path);
    const tempPath = path.join(
      os.tmpdir(),
      `feishu-doc-media-${randomUUID()}${path.extname(sourcePath)}`,
    );

    await fs.copyFile(sourcePath, tempPath);

    try {
      return await run({
        ...params,
        file_path: tempPath,
      });
    } finally {
      await fs.rm(tempPath, { force: true });
    }
  }

  if (
    toolName === 'feishu_drive_file' &&
    params?.action === 'copy' &&
    !getNonEmptyString(params.folder_token) &&
    !getNonEmptyString(params.parent_node)
  ) {
    const folderToken = await resolveDriveRootFolderToken({
      tool,
      registry,
      ticket,
    });

    return run({
      ...params,
      folder_token: folderToken,
    });
  }

  return run(params);
}

async function listDriveFilesForRecovery(
  tool,
  registry,
  ticket,
  folderToken,
  { ignoreErrors = false } = {},
) {
  const listParams = {
    action: 'list',
    page_size: 200,
  };

  if (folderToken) {
    listParams.folder_token = folderToken;
  }

  let payload;
  try {
    payload = await executeToolPayload({
      registry,
      ticket,
      tool,
      params: listParams,
    });
  } catch (error) {
    if (ignoreErrors) {
      return [];
    }
    throw error;
  }

  return Array.isArray(payload?.files) ? payload.files : [];
}

async function enrichDriveUploadPayload({ payload, params, registry, ticket, tool }) {
  if (
    !isObjectLike(payload) ||
    payload.file_token ||
    typeof payload.file_name !== 'string' ||
    !payload.file_name
  ) {
    return payload;
  }

  const candidateLists = [];

  if (typeof params?.parent_node === 'string' && params.parent_node) {
    candidateLists.push(
      await listDriveFilesForRecovery(tool, registry, ticket, params.parent_node, {
        ignoreErrors: true,
      }),
    );
  }

  candidateLists.push(
    await listDriveFilesForRecovery(tool, registry, ticket, undefined, {
      ignoreErrors: true,
    }),
  );

  for (const files of candidateLists) {
    const match = files.find((file) => file?.name === payload.file_name);
    if (match?.token) {
      return {
        ...payload,
        file_token: match.token,
        token: match.token,
        type: match.type,
        url: match.url,
      };
    }
  }

  return payload;
}

async function enrichToolPayload({ toolName, payload, params, registry, ticket, tool }) {
  if (toolName === 'feishu_drive_file' && params?.action === 'upload') {
    return enrichDriveUploadPayload({ payload, params, registry, ticket, tool });
  }

  return payload;
}

export async function loadToolRegistry(clawConfig) {
  await ensureRuntime();

  const effectiveConfig = clawConfig || createPlaceholderClawConfig();
  const logger = createLogger();

  const [
    { registerOapiTools },
    { registerFeishuMcpDocTools },
    { withTicket },
    { LarkClient },
    { Type },
    { Value },
  ] = await Promise.all([
    importFromRuntime('@larksuite/openclaw-lark/src/tools/oapi/index.js'),
    importFromRuntime('@larksuite/openclaw-lark/src/tools/mcp/doc/index.js'),
    importFromRuntime('@larksuite/openclaw-lark/src/core/lark-ticket.js'),
    importFromRuntime('@larksuite/openclaw-lark/src/core/lark-client.js'),
    importFromRuntime('@sinclair/typebox'),
    importFromRuntime('@sinclair/typebox/value'),
  ]);

  LarkClient.setGlobalConfig(effectiveConfig);

  const tools = new Map();
  const fakeApi = {
    config: effectiveConfig,
    logger,
    registerTool(tool) {
      if (tool && typeof tool === 'object' && typeof tool.name === 'string') {
        tools.set(tool.name, tool);
      }
    },
    registerChannel() {},
    registerCli() {},
    on() {},
  };

  registerOapiTools(fakeApi);
  registerFeishuMcpDocTools(fakeApi);

  return {
    tools,
    withTicket,
    Type,
    Value,
  };
}

export function listRegisteredTools(registry, pattern) {
  const entries = [...registry.tools.values()]
    .map((tool) => ({
      name: tool.name,
      label: tool.label,
      description: tool.description,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  if (!pattern) {
    return entries;
  }

  const lowered = pattern.toLowerCase();
  return entries.filter((tool) => {
    return (
      tool.name.toLowerCase().includes(lowered) ||
      String(tool.label || '').toLowerCase().includes(lowered) ||
      String(tool.description || '').toLowerCase().includes(lowered)
    );
  });
}

export function describeRegisteredTool(registry, toolName) {
  const tool = registry.tools.get(toolName);
  if (!tool) {
    throw new Error(`Unknown tool "${toolName}"`);
  }

  return {
    name: tool.name,
    label: tool.label,
    description: tool.description,
    parameters: tool.parameters,
  };
}

export function extractToolPayload(toolResult) {
  if (toolResult && typeof toolResult === 'object' && 'details' in toolResult) {
    return toolResult.details;
  }

  const firstText = toolResult?.content?.find?.((item) => item.type === 'text')?.text;
  if (typeof firstText === 'string') {
    try {
      return JSON.parse(firstText);
    } catch {
      return firstText;
    }
  }

  return toolResult;
}

export function isToolErrorPayload(payload) {
  return Boolean(payload && typeof payload === 'object' && 'error' in payload && payload.error);
}

export function validateToolParameters(registry, toolName, params) {
  const tool = registry.tools.get(toolName);
  if (!tool) {
    throw new Error(`Unknown tool "${toolName}"`);
  }

  if (!tool.parameters) {
    return {
      valid: true,
      errors: [],
    };
  }

  const validationSchema = getValidationSchema(registry, tool.parameters);
  const valid = registry.Value.Check(validationSchema, params);

  if (valid) {
    return {
      valid: true,
      errors: [],
    };
  }

  const errors = [...registry.Value.Errors(validationSchema, params)];
  return {
    valid: false,
    errors: errors.map((error) => {
      const path = error.path || '/';
      return `${path}: ${error.message}`;
    }),
  };
}

export async function callRegisteredTool({
  toolName,
  params,
  clawConfig,
  accountId,
  userOpenId,
  messageId,
  chatId,
  chatType,
  threadId,
}) {
  const registry = await loadToolRegistry(clawConfig);
  const tool = registry.tools.get(toolName);

  if (!tool) {
    const suggestions = listRegisteredTools(registry, toolName).slice(0, 10).map((entry) => entry.name);
    const suggestionText = suggestions.length > 0 ? ` Similar tools: ${suggestions.join(', ')}` : '';
    throw new Error(`Unknown tool "${toolName}".${suggestionText}`);
  }

  const validationResult = validateToolParameters(registry, toolName, params);
  if (!validationResult.valid) {
    throw new Error(`Parameter validation failed for ${toolName}: ${validationResult.errors.join(' | ')}`);
  }

  const ticket = {
    accountId,
    senderOpenId: userOpenId,
    messageId: messageId || `cli:${toolName}:${randomUUID()}`,
    chatId: chatId || 'cli',
    chatType,
    threadId,
    startTime: Date.now(),
  };

  const rawResult = await withPreparedParams({
    toolName,
    params,
    registry,
    ticket,
    tool,
    run: async (effectiveParams) => {
      return registry.withTicket(ticket, () => tool.execute(ticket.messageId, effectiveParams));
    },
  });
  const rawPayload = extractToolPayload(rawResult);
  const payload = await enrichToolPayload({
    toolName,
    payload: rawPayload,
    params,
    registry,
    ticket,
    tool,
  });

  return {
    ticket,
    tool,
    rawResult,
    payload,
  };
}
