#!/usr/bin/env node

import { parseArgs } from 'node:util';

import {
  forgetAuthorizedUser,
  loadSkillState,
  resolveExecutionContext,
  saveSkillState,
} from './lib/config.mjs';
import { ensureRuntime, importFromRuntime } from './lib/runtime.mjs';

async function main() {
  const { values } = parseArgs({
    options: {
      account: { type: 'string' },
      'user-open-id': { type: 'string' },
      config: { type: 'string' },
      help: { type: 'boolean' },
    },
  });

  if (values.help) {
    console.log('Usage: node skills/feishu/scripts/auth-logout.mjs [--account default] [--user-open-id ou_xxx]');
    return;
  }

  const context = await resolveExecutionContext({
    configPath: values.config,
    accountId: values.account,
    userOpenId: values['user-open-id'],
  });

  if (!context.userOpenId) {
    throw new Error('No userOpenId resolved. Pass --user-open-id or authorize first.');
  }

  await ensureRuntime();

  const [{ removeStoredToken }] = await Promise.all([
    importFromRuntime('@larksuite/openclaw-lark/src/core/token-store.js'),
  ]);

  await removeStoredToken(context.account.appId, context.userOpenId);

  const state = await loadSkillState();
  forgetAuthorizedUser(state, context.account.accountId, context.userOpenId);
  await saveSkillState(state);

  console.log(
    JSON.stringify(
      {
        success: true,
        accountId: context.account.accountId,
        userOpenId: context.userOpenId,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
