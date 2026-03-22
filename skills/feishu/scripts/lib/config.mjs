import fs from 'node:fs/promises';
import path from 'node:path';

import {
  CONFIG_EXAMPLE_PATH,
  DEFAULT_CONFIG_PATH,
  DEFAULT_STATE_PATH,
} from './paths.mjs';

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeAccountId(accountId) {
  return String(accountId || 'default').trim();
}

function normalizeAccount(accountId, rawAccount, fallback = {}) {
  if (!isObject(rawAccount)) {
    throw new Error(`Account "${accountId}" must be an object`);
  }

  const merged = {
    ...fallback,
    ...rawAccount,
  };

  const appId = typeof merged.appId === 'string' ? merged.appId.trim() : '';
  const appSecret = typeof merged.appSecret === 'string' ? merged.appSecret.trim() : '';
  const domainRaw =
    typeof merged.domain === 'string'
      ? merged.domain.trim()
      : typeof merged.brand === 'string'
        ? merged.brand.trim()
        : 'feishu';
  const mcpEndpoint =
    typeof merged.mcpEndpoint === 'string'
      ? merged.mcpEndpoint.trim()
      : typeof merged.mcp_url === 'string'
        ? merged.mcp_url.trim()
        : undefined;

  return {
    accountId: normalizeAccountId(accountId),
    name: typeof merged.name === 'string' ? merged.name.trim() : undefined,
    appId,
    appSecret,
    domain: domainRaw || 'feishu',
    enabled: merged.enabled !== false,
    mcpEndpoint: mcpEndpoint || undefined,
    defaultUserOpenId:
      typeof merged.defaultUserOpenId === 'string' && merged.defaultUserOpenId.trim()
        ? merged.defaultUserOpenId.trim()
        : undefined,
  };
}

function normalizeAccounts(rawConfig) {
  const accounts = {};

  if (isObject(rawConfig.accounts)) {
    for (const [accountId, rawAccount] of Object.entries(rawConfig.accounts)) {
      accounts[normalizeAccountId(accountId)] = normalizeAccount(accountId, rawAccount);
    }
  }

  if (Object.keys(accounts).length === 0) {
    if (typeof rawConfig.appId === 'string' && typeof rawConfig.appSecret === 'string') {
      accounts.default = normalizeAccount('default', rawConfig);
    }
  }

  return accounts;
}

export async function readJsonFile(filePath, { allowMissing = false } = {}) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    if (allowMissing && error?.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function writeJsonFile(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export async function loadSkillConfig({
  configPath = process.env.FEISHU_SKILL_CONFIG || DEFAULT_CONFIG_PATH,
  allowMissing = false,
} = {}) {
  let rawConfig;

  try {
    rawConfig = await readJsonFile(configPath, { allowMissing });
  } catch (error) {
    if (!allowMissing && error?.code === 'ENOENT') {
      if (configPath === DEFAULT_CONFIG_PATH) {
        throw new Error(
          `Config file not found: ${configPath}. Copy ${CONFIG_EXAMPLE_PATH} to ${configPath}, then fill appId/appSecret.`,
        );
      }

      throw new Error(
        `Config file not found: ${configPath}. Pass a valid --config path or set FEISHU_SKILL_CONFIG.`,
      );
    }

    throw error;
  }

  if (!rawConfig) {
    return {
      configPath,
      rawConfig: null,
      defaultAccountId: 'default',
      defaultUserOpenId: undefined,
      toolsDeny: [],
      accounts: {},
    };
  }

  if (!isObject(rawConfig)) {
    throw new Error('Skill config must be a JSON object');
  }

  const accounts = normalizeAccounts(rawConfig);
  const accountIds = Object.keys(accounts);

  const defaultAccountIdRaw =
    typeof rawConfig.defaultAccountId === 'string' && rawConfig.defaultAccountId.trim()
      ? rawConfig.defaultAccountId.trim()
      : accountIds.includes('default')
        ? 'default'
        : accountIds[0];

  if (accountIds.length > 0 && !accounts[defaultAccountIdRaw]) {
    throw new Error(`defaultAccountId "${defaultAccountIdRaw}" does not exist in accounts`);
  }

  const toolsDeny = Array.isArray(rawConfig.tools?.deny)
    ? rawConfig.tools.deny.filter((value) => typeof value === 'string' && value.trim()).map((value) => value.trim())
    : [];

  return {
    configPath,
    rawConfig,
    defaultAccountId: defaultAccountIdRaw || 'default',
    defaultUserOpenId:
      typeof rawConfig.defaultUserOpenId === 'string' && rawConfig.defaultUserOpenId.trim()
        ? rawConfig.defaultUserOpenId.trim()
        : undefined,
    toolsDeny,
    accounts,
  };
}

export async function loadSkillState(statePath = DEFAULT_STATE_PATH) {
  const rawState = await readJsonFile(statePath, { allowMissing: true });

  if (!rawState || !isObject(rawState)) {
    return {
      statePath,
      accounts: {},
    };
  }

  return {
    statePath,
    accounts: isObject(rawState.accounts) ? rawState.accounts : {},
  };
}

export async function saveSkillState(state, statePath = DEFAULT_STATE_PATH) {
  await writeJsonFile(statePath, {
    accounts: isObject(state.accounts) ? state.accounts : {},
  });
}

export function resolveAccount(skillConfig, requestedAccountId) {
  const accountId = normalizeAccountId(requestedAccountId || skillConfig.defaultAccountId || 'default');
  const account = skillConfig.accounts[accountId];

  if (!account) {
    const available = Object.keys(skillConfig.accounts);
    if (available.length === 0) {
      throw new Error(
        `No accounts found in ${skillConfig.configPath}. Create ${path.basename(skillConfig.configPath)} first.`,
      );
    }
    throw new Error(`Unknown account "${accountId}". Available accounts: ${available.join(', ')}`);
  }

  if (!account.appId || !account.appSecret) {
    throw new Error(`Account "${accountId}" is missing appId or appSecret`);
  }

  return account;
}

export function resolveUserOpenId({
  explicitUserOpenId,
  skillConfig,
  state,
  accountId,
}) {
  return resolveUserOpenIdResolution({
    explicitUserOpenId,
    skillConfig,
    state,
    accountId,
  }).userOpenId;
}

export function resolveUserOpenIdResolution({
  explicitUserOpenId,
  skillConfig,
  state,
  accountId,
}) {
  const normalizedExplicitUserOpenId =
    typeof explicitUserOpenId === 'string' && explicitUserOpenId.trim()
      ? explicitUserOpenId.trim()
      : undefined;
  const stateAccount = state.accounts?.[accountId] ?? {};
  const stateUserOpenId =
    typeof stateAccount.lastAuthorizedUserOpenId === 'string' &&
    stateAccount.lastAuthorizedUserOpenId.trim()
      ? stateAccount.lastAuthorizedUserOpenId.trim()
      : undefined;
  const accountDefaultUserOpenId =
    typeof skillConfig.accounts?.[accountId]?.defaultUserOpenId === 'string' &&
    skillConfig.accounts[accountId].defaultUserOpenId.trim()
      ? skillConfig.accounts[accountId].defaultUserOpenId.trim()
      : undefined;
  const globalDefaultUserOpenId =
    typeof skillConfig.defaultUserOpenId === 'string' && skillConfig.defaultUserOpenId.trim()
      ? skillConfig.defaultUserOpenId.trim()
      : undefined;
  const baseResolution = {
    explicitUserOpenId: normalizedExplicitUserOpenId,
    stateUserOpenId,
    stateLastAuthorizedAt:
      typeof stateAccount.lastAuthorizedAt === 'string' ? stateAccount.lastAuthorizedAt : undefined,
    stateLastAuthorizedUserName:
      typeof stateAccount.lastAuthorizedUserName === 'string'
        ? stateAccount.lastAuthorizedUserName
        : undefined,
    accountDefaultUserOpenId,
    globalDefaultUserOpenId,
  };
  const withResult = (userOpenId, source) => ({
    userOpenId,
    source,
    ...baseResolution,
  });

  if (normalizedExplicitUserOpenId) {
    return withResult(normalizedExplicitUserOpenId, 'explicit');
  }

  if (stateUserOpenId) {
    return withResult(stateUserOpenId, 'state');
  }

  if (accountDefaultUserOpenId) {
    return withResult(accountDefaultUserOpenId, 'account-config');
  }

  if (globalDefaultUserOpenId) {
    return withResult(globalDefaultUserOpenId, 'global-config');
  }

  return withResult(undefined, 'unresolved');
}

export function createPlaceholderClawConfig() {
  return {
    plugins: {
      entries: {
        feishu: {
          enabled: false,
        },
      },
    },
    channels: {
      feishu: {
        appId: 'placeholder-app',
        appSecret: 'placeholder-secret',
        domain: 'feishu',
      },
    },
  };
}

export function buildClawConfig(skillConfig, { activeAccountId } = {}) {
  const defaultAccount = resolveAccount(skillConfig, skillConfig.defaultAccountId);
  const activeAccount = resolveAccount(skillConfig, activeAccountId || defaultAccount.accountId);

  const channelConfig = {
    appId: defaultAccount.appId,
    appSecret: defaultAccount.appSecret,
    enabled: defaultAccount.enabled,
    domain: defaultAccount.domain,
  };

  const topLevelMcpEndpoint = activeAccount.mcpEndpoint || defaultAccount.mcpEndpoint;
  if (topLevelMcpEndpoint) {
    channelConfig.mcpEndpoint = topLevelMcpEndpoint;
  }

  if (skillConfig.toolsDeny.length > 0) {
    channelConfig.tools = {
      deny: [...skillConfig.toolsDeny],
    };
  }

  const accountOverrides = Object.entries(skillConfig.accounts)
    .filter(([accountId]) => accountId !== defaultAccount.accountId)
    .map(([accountId, account]) => {
      const override = {
        appId: account.appId,
        appSecret: account.appSecret,
        enabled: account.enabled,
        domain: account.domain,
      };

      if (account.name) {
        override.name = account.name;
      }

      if (account.mcpEndpoint) {
        override.mcpEndpoint = account.mcpEndpoint;
      }

      return [accountId, override];
    });

  if (accountOverrides.length > 0) {
    channelConfig.accounts = Object.fromEntries(accountOverrides);
  }

  return {
    plugins: {
      entries: {
        feishu: {
          enabled: false,
        },
      },
    },
    channels: {
      feishu: channelConfig,
    },
  };
}

export async function resolveExecutionContext({
  configPath,
  accountId,
  userOpenId,
} = {}) {
  const skillConfig = await loadSkillConfig({ configPath });
  const state = await loadSkillState();
  const account = resolveAccount(skillConfig, accountId);
  const userResolution = resolveUserOpenIdResolution({
    explicitUserOpenId: userOpenId,
    skillConfig,
    state,
    accountId: account.accountId,
  });

  return {
    skillConfig,
    state,
    account,
    userOpenId: userResolution.userOpenId,
    userResolution,
    clawConfig: buildClawConfig(skillConfig, { activeAccountId: account.accountId }),
  };
}

export function rememberAuthorizedUser(state, accountId, user) {
  const current = state.accounts?.[accountId] ?? {};
  state.accounts = state.accounts ?? {};
  state.accounts[accountId] = {
    ...current,
    lastAuthorizedUserOpenId: user.openId,
    lastAuthorizedAt: new Date().toISOString(),
    lastAuthorizedUserName: user.name,
  };
}

export function forgetAuthorizedUser(state, accountId, userOpenId) {
  const current = state.accounts?.[accountId];
  if (!current) {
    return;
  }

  if (!userOpenId || current.lastAuthorizedUserOpenId === userOpenId) {
    delete state.accounts[accountId];
  }
}
