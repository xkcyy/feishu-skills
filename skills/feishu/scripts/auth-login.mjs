#!/usr/bin/env node

import { parseArgs } from 'node:util';

import {
  loadSkillState,
  rememberAuthorizedUser,
  resolveExecutionContext,
  saveSkillState,
} from './lib/config.mjs';
import { ensureRuntime, importFromRuntime } from './lib/runtime.mjs';

async function fetchCurrentUser(brand, accessToken) {
  const baseUrl = brand === 'lark' ? 'https://open.larksuite.com' : 'https://open.feishu.cn';
  const response = await fetch(`${baseUrl}/open-apis/authen/v1/user_info`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();
  if (!response.ok || data.code !== 0 || !data.data?.open_id) {
    throw new Error(`Failed to fetch current user info: ${data.msg || response.statusText}`);
  }

  return {
    openId: data.data.open_id,
    unionId: data.data.union_id,
    userId: data.data.user_id,
    name: data.data.name,
    enName: data.data.en_name,
    email: data.data.email,
  };
}

async function main() {
  const { values } = parseArgs({
    options: {
      account: { type: 'string' },
      config: { type: 'string' },
      scope: { type: 'string' },
      'expect-open-id': { type: 'string' },
      'no-save-default-user': { type: 'boolean' },
      help: { type: 'boolean' },
    },
  });

  if (values.help) {
    console.log(`Usage:
  node skills/feishu/scripts/auth-login.mjs [--account default]
  node skills/feishu/scripts/auth-login.mjs --scope "calendar:calendar:read task:task:read"
`);
    return;
  }

  const context = await resolveExecutionContext({
    configPath: values.config,
    accountId: values.account,
  });

  await ensureRuntime();

  const [
    { requestDeviceAuthorization, pollDeviceToken },
    { getAppGrantedScopes },
    { filterSensitiveScopes },
    { setStoredToken },
    { LarkClient },
  ] = await Promise.all([
    importFromRuntime('@larksuite/openclaw-lark/src/core/device-flow.js'),
    importFromRuntime('@larksuite/openclaw-lark/src/core/app-scope-checker.js'),
    importFromRuntime('@larksuite/openclaw-lark/src/core/tool-scopes.js'),
    importFromRuntime('@larksuite/openclaw-lark/src/core/token-store.js'),
    importFromRuntime('@larksuite/openclaw-lark/src/core/lark-client.js'),
  ]);

  let requestedScope = values.scope;
  let scopeSource = 'explicit';

  if (!requestedScope) {
    try {
      const sdk = LarkClient.fromAccount({
        accountId: context.account.accountId,
        appId: context.account.appId,
        appSecret: context.account.appSecret,
        configured: true,
        enabled: true,
        brand: context.account.domain,
        config: {},
      }).sdk;

      const appScopes = await getAppGrantedScopes(sdk, context.account.appId, 'user');
      const safeScopes = filterSensitiveScopes(appScopes);
      requestedScope = safeScopes.join(' ');
      scopeSource = 'app-granted';
    } catch {
      requestedScope = '';
      scopeSource = 'offline-access-only';
    }
  }

  const auth = await requestDeviceAuthorization({
    appId: context.account.appId,
    appSecret: context.account.appSecret,
    brand: context.account.domain,
    scope: requestedScope,
  });

  console.log(`Open this URL to authorize:\n${auth.verificationUriComplete}\n`);
  console.log(`User code: ${auth.userCode}`);
  console.log(`Polling every ${auth.interval}s. Waiting for authorization...`);

  const result = await pollDeviceToken({
    appId: context.account.appId,
    appSecret: context.account.appSecret,
    brand: context.account.domain,
    deviceCode: auth.deviceCode,
    interval: auth.interval,
    expiresIn: auth.expiresIn,
  });

  if (!result.ok) {
    throw new Error(result.message || result.error || 'Authorization failed');
  }

  const currentUser = await fetchCurrentUser(context.account.domain, result.token.accessToken);

  if (values['expect-open-id'] && values['expect-open-id'] !== currentUser.openId) {
    throw new Error(
      `Authorized user mismatch: expected ${values['expect-open-id']}, got ${currentUser.openId}`,
    );
  }

  const now = Date.now();
  await setStoredToken({
    userOpenId: currentUser.openId,
    appId: context.account.appId,
    accessToken: result.token.accessToken,
    refreshToken: result.token.refreshToken,
    expiresAt: now + result.token.expiresIn * 1000,
    refreshExpiresAt: now + result.token.refreshExpiresIn * 1000,
    scope: result.token.scope,
    grantedAt: now,
  });

  if (!values['no-save-default-user']) {
    const state = await loadSkillState();
    rememberAuthorizedUser(state, context.account.accountId, currentUser);
    await saveSkillState(state);
  }

  console.log(
    JSON.stringify(
      {
        success: true,
        accountId: context.account.accountId,
        user: currentUser,
        scopeSource,
        grantedScope: result.token.scope,
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
