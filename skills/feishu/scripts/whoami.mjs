#!/usr/bin/env node

import { parseArgs } from 'node:util';

import { resolveExecutionContext } from './lib/config.mjs';
import { callRegisteredTool, isToolErrorPayload } from './lib/registry.mjs';

async function main() {
  const { values } = parseArgs({
    options: {
      account: { type: 'string' },
      'user-open-id': { type: 'string' },
      config: { type: 'string' },
      raw: { type: 'boolean' },
      help: { type: 'boolean' },
    },
  });

  if (values.help) {
    console.log('Usage: node skills/feishu/scripts/whoami.mjs [--account default]');
    return;
  }

  const context = await resolveExecutionContext({
    configPath: values.config,
    accountId: values.account,
    userOpenId: values['user-open-id'],
  });

  const result = await callRegisteredTool({
    toolName: 'feishu_get_user',
    params: {},
    clawConfig: context.clawConfig,
    accountId: context.account.accountId,
    userOpenId: context.userOpenId,
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
