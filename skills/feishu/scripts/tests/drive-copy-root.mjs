import assert from 'node:assert/strict';

import { resolveExecutionContext } from '../lib/config.mjs';
import { callRegisteredTool, isToolErrorPayload } from '../lib/registry.mjs';

function uniqueName(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}.txt`;
}

async function main() {
  const context = await resolveExecutionContext();
  const createdTokens = [];

  async function invoke(toolName, params) {
    const result = await callRegisteredTool({
      toolName,
      params,
      clawConfig: context.clawConfig,
      accountId: context.account.accountId,
      userOpenId: context.userOpenId,
    });

    if (isToolErrorPayload(result.payload)) {
      throw new Error(`${toolName} failed: ${JSON.stringify(result.payload)}`);
    }

    return result.payload;
  }

  try {
    const upload = await invoke('feishu_drive_file', {
      action: 'upload',
      file_name: uniqueName('drive-copy-src'),
      file_content_base64: Buffer.from('drive copy root regression\n', 'utf8').toString('base64'),
      size: Buffer.byteLength('drive copy root regression\n', 'utf8'),
    });

    assert.ok(upload.file_token, 'upload should return file_token');
    createdTokens.push(upload.file_token);

    const copy = await invoke('feishu_drive_file', {
      action: 'copy',
      file_token: upload.file_token,
      type: 'file',
      name: uniqueName('drive-copy-dst'),
    });

    const copiedFile = copy.file;
    assert.ok(copiedFile?.token, 'copy should return copied file token');
    assert.equal(copiedFile.type, 'file', 'copy should preserve file type');
    createdTokens.push(copiedFile.token);
  } finally {
    for (const token of createdTokens.reverse()) {
      try {
        await callRegisteredTool({
          toolName: 'feishu_drive_file',
          params: {
            action: 'delete',
            file_token: token,
            type: 'file',
          },
          clawConfig: context.clawConfig,
          accountId: context.account.accountId,
          userOpenId: context.userOpenId,
        });
      } catch {
        // Cleanup is best-effort for live smoke tests.
      }
    }
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
