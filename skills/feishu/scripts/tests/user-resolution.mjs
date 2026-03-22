import assert from 'node:assert/strict';

import { resolveUserOpenIdResolution } from '../lib/config.mjs';

function baseConfig() {
  return {
    defaultUserOpenId: 'ou_global',
    accounts: {
      default: {
        defaultUserOpenId: 'ou_account',
      },
    },
  };
}

function baseState() {
  return {
    accounts: {
      default: {
        lastAuthorizedUserOpenId: 'ou_state',
        lastAuthorizedAt: '2026-03-22T06:10:46.827Z',
        lastAuthorizedUserName: 'State User',
      },
    },
  };
}

function main() {
  const explicit = resolveUserOpenIdResolution({
    explicitUserOpenId: 'ou_explicit',
    skillConfig: baseConfig(),
    state: baseState(),
    accountId: 'default',
  });
  assert.equal(explicit.userOpenId, 'ou_explicit');
  assert.equal(explicit.source, 'explicit');

  const fromState = resolveUserOpenIdResolution({
    skillConfig: baseConfig(),
    state: baseState(),
    accountId: 'default',
  });
  assert.equal(fromState.userOpenId, 'ou_state');
  assert.equal(fromState.source, 'state');
  assert.equal(fromState.stateLastAuthorizedUserName, 'State User');

  const fromAccountConfig = resolveUserOpenIdResolution({
    skillConfig: baseConfig(),
    state: { accounts: {} },
    accountId: 'default',
  });
  assert.equal(fromAccountConfig.userOpenId, 'ou_account');
  assert.equal(fromAccountConfig.source, 'account-config');

  const fromGlobalConfig = resolveUserOpenIdResolution({
    skillConfig: {
      defaultUserOpenId: 'ou_global',
      accounts: {
        default: {},
      },
    },
    state: { accounts: {} },
    accountId: 'default',
  });
  assert.equal(fromGlobalConfig.userOpenId, 'ou_global');
  assert.equal(fromGlobalConfig.source, 'global-config');

  const unresolved = resolveUserOpenIdResolution({
    skillConfig: {
      accounts: {
        default: {},
      },
    },
    state: { accounts: {} },
    accountId: 'default',
  });
  assert.equal(unresolved.userOpenId, undefined);
  assert.equal(unresolved.source, 'unresolved');
}

main();
