#!/usr/bin/env node

import { parseArgs } from 'node:util';

import { resolveExecutionContext } from './lib/config.mjs';
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
    console.log('Usage: node skills/feishu/scripts/auth-status.mjs [--account default] [--user-open-id ou_xxx]');
    return;
  }

  const context = await resolveExecutionContext({
    configPath: values.config,
    accountId: values.account,
    userOpenId: values['user-open-id'],
  });

  if (!context.userOpenId) {
    console.log(
      JSON.stringify(
        {
          authorized: false,
          accountId: context.account.accountId,
          userOpenId: null,
          userOpenIdSource: context.userResolution.source,
          userResolution: context.userResolution,
          message: 'No userOpenId resolved. Run auth-login first or pass --user-open-id.',
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  await ensureRuntime();

  const [{ getStoredToken, tokenStatus }] = await Promise.all([
    importFromRuntime('@larksuite/openclaw-lark/src/core/token-store.js'),
  ]);

  const storedToken = await getStoredToken(context.account.appId, context.userOpenId);

  if (!storedToken) {
    console.log(
      JSON.stringify(
        {
          authorized: false,
          accountId: context.account.accountId,
          userOpenId: context.userOpenId,
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    JSON.stringify(
      {
        authorized: true,
        accountId: context.account.accountId,
        userOpenId: context.userOpenId,
        userOpenIdSource: context.userResolution.source,
        userResolution: context.userResolution,
        status: tokenStatus(storedToken),
        grantedAt: new Date(storedToken.grantedAt).toISOString(),
        expiresAt: new Date(storedToken.expiresAt).toISOString(),
        refreshExpiresAt: new Date(storedToken.refreshExpiresAt).toISOString(),
        scope: storedToken.scope,
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
