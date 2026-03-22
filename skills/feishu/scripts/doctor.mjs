#!/usr/bin/env node

import { parseArgs } from 'node:util';

import { resolveExecutionContext } from './lib/config.mjs';
import { ensureRuntime, importFromRuntime } from './lib/runtime.mjs';

async function main() {
  const { values } = parseArgs({
    options: {
      account: { type: 'string' },
      config: { type: 'string' },
      json: { type: 'boolean' },
      help: { type: 'boolean' },
    },
  });

  if (values.help) {
    console.log('Usage: node skills/feishu/scripts/doctor.mjs [--account default] [--json]');
    return;
  }

  const context = await resolveExecutionContext({
    configPath: values.config,
    accountId: values.account,
  });

  await ensureRuntime();

  const [{ runDiagnosis, formatDiagReportCli }, { LarkClient }] = await Promise.all([
    importFromRuntime('@larksuite/openclaw-lark/src/commands/diagnose.js'),
    importFromRuntime('@larksuite/openclaw-lark/src/core/lark-client.js'),
  ]);

  LarkClient.setGlobalConfig(context.clawConfig);

  const report = await runDiagnosis({
    config: context.clawConfig,
    logger: console,
  });

  if (values.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(formatDiagReportCli(report));
  }

  if (report.overallStatus === 'unhealthy') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
