#!/usr/bin/env node

import fs from 'node:fs/promises';
import { parseArgs } from 'node:util';

import { createPlaceholderClawConfig, resolveExecutionContext } from './lib/config.mjs';
import {
  callRegisteredTool,
  describeRegisteredTool,
  isToolErrorPayload,
  listRegisteredTools,
  loadToolRegistry,
} from './lib/registry.mjs';

async function readJsonFromStdin() {
  if (process.stdin.isTTY) {
    return undefined;
  }

  let content = '';
  for await (const chunk of process.stdin) {
    content += chunk;
  }

  const trimmed = content.trim();
  if (!trimmed) {
    return undefined;
  }

  return JSON.parse(trimmed);
}

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      account: { type: 'string' },
      'user-open-id': { type: 'string' },
      config: { type: 'string' },
      json: { type: 'string' },
      'json-file': { type: 'string' },
      list: { type: 'boolean' },
      describe: { type: 'string' },
      pattern: { type: 'string' },
      raw: { type: 'boolean' },
      'message-id': { type: 'string' },
      'chat-id': { type: 'string' },
      'chat-type': { type: 'string' },
      'thread-id': { type: 'string' },
      help: { type: 'boolean' },
    },
    allowPositionals: true,
  });

  if (values.help) {
    console.log(`Usage:
  node skills/feishu/scripts/call-tool.mjs --list [--pattern bitable]
  node skills/feishu/scripts/call-tool.mjs --describe feishu_bitable_app
  node skills/feishu/scripts/call-tool.mjs <tool-name> [--json '{"action":"list"}']
`);
    return;
  }

  if (values.list || values.describe) {
    const registry = await loadToolRegistry(createPlaceholderClawConfig());

    if (values.list) {
      const tools = listRegisteredTools(registry, values.pattern);
      console.log(JSON.stringify(tools, null, 2));
      return;
    }

    const description = describeRegisteredTool(registry, values.describe);
    console.log(JSON.stringify(description, null, 2));
    return;
  }

  const toolName = positionals[0];
  if (!toolName) {
    throw new Error('Tool name is required unless --list or --describe is used');
  }

  const context = await resolveExecutionContext({
    configPath: values.config,
    accountId: values.account,
    userOpenId: values['user-open-id'],
  });

  let params;
  if (values.json) {
    params = JSON.parse(values.json);
  } else if (values['json-file']) {
    params = JSON.parse(await fs.readFile(values['json-file'], 'utf8'));
  } else {
    params = (await readJsonFromStdin()) ?? {};
  }

  const result = await callRegisteredTool({
    toolName,
    params,
    clawConfig: context.clawConfig,
    accountId: context.account.accountId,
    userOpenId: context.userOpenId,
    messageId: values['message-id'],
    chatId: values['chat-id'],
    chatType: values['chat-type'],
    threadId: values['thread-id'],
  });

  console.log(JSON.stringify(values.raw ? result.rawResult : result.payload, null, 2));

  if (isToolErrorPayload(result.payload)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
