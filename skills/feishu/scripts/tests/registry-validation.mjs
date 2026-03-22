import assert from 'node:assert/strict';

import { createPlaceholderClawConfig } from '../lib/config.mjs';
import { loadToolRegistry, validateToolParameters } from '../lib/registry.mjs';

async function main() {
  const registry = await loadToolRegistry(createPlaceholderClawConfig());

  const validCases = [
    {
      toolName: 'feishu_doc_comments',
      params: {
        action: 'list',
        file_token: 'dummy-token',
        file_type: 'docx',
      },
    },
    {
      toolName: 'feishu_wiki_space_node',
      params: {
        action: 'get',
        token: 'dummy-token',
        obj_type: 'wiki',
      },
    },
    {
      toolName: 'feishu_calendar_event',
      params: {
        action: 'delete',
        event_id: 'event-id',
        need_notification: false,
      },
    },
  ];

  for (const { toolName, params } of validCases) {
    const result = validateToolParameters(registry, toolName, params);
    assert.equal(
      result.valid,
      true,
      `${toolName} should accept valid params, got: ${result.errors.join(' | ')}`,
    );
  }

  const invalidResult = validateToolParameters(registry, 'feishu_wiki_space_node', {
    action: 'get',
    token: 'dummy-token',
    obj_type: 'not-a-real-type',
  });
  assert.equal(invalidResult.valid, false, 'invalid enum value should be rejected');
  assert.ok(invalidResult.errors.length > 0, 'invalid enum should produce at least one error');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
