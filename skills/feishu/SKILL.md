---
name: feishu
description: "Use when working with Feishu/Lark from this local skill package instead of the OpenClaw channel plugin: authenticating a user, invoking Feishu tools, or operating bitable, task, calendar, docs, wiki, drive, sheets, or IM history from Codex, Claude Code, OpenCode, or similar agents."
---

# Feishu

统一使用这个 skill，不再拆成多个 `feishu-*` skill。它通过 `scripts/` 里的本地胶水脚本复用已发布的 `@larksuite/openclaw-lark` 运行时，不需要编译，也不需要本地再安装一个 OpenClaw channel plugin。

## Quick Start

1. 复制 [`.config.example.json`](./.config.example.json) 到 `skills/feishu/.local/config.json`。
2. 在 `skills/feishu/.local/config.json` 里填入真实 `appId` 和 `appSecret`。
3. 先运行 `scripts/auth-login.mjs` 完成一次用户 OAuth 授权。
4. 用 `scripts/call-tool.mjs --list` 查看工具，或 `--describe <tool>` 查看参数 schema。
5. 正式操作时优先直接调用 `scripts/call-tool.mjs`，不要自己重写 Feishu API 请求。

## Working Rules

- 优先用脚本，不要重复造轮子。
- 传 JSON 参数时优先走 stdin 或 `--json`，避免 shell 转义问题。
- 需要用户身份的工具默认使用最近一次成功授权的用户；必要时显式传 `--user-open-id`。
- 文档类工具默认走飞书官方 MCP 网关，不需要本地 MCP 插件。只有你明确要改 endpoint 时，才在 `skills/feishu/.local/config.json` 里设置 `mcpEndpoint`。
- 不熟悉的工具先跑 `--describe`，确认 `action`、必填字段和 schema 之后再调用。

## Reference Routing

- 配置、鉴权、脚本入口、运行时机制：读 [references/common.md](references/common.md)
- 多维表格：读 [references/bitable.md](references/bitable.md)
- 任务：读 [references/task.md](references/task.md)
- 日历：读 [references/calendar.md](references/calendar.md)
- 文档、知识库、云盘、表格、文档媒体：读 [references/docs.md](references/docs.md)
- IM 历史消息、话题回复、资源下载：读 [references/im-read.md](references/im-read.md)
- 飞书消息输出风格和 Markdown 子集：读 [references/channel-output.md](references/channel-output.md)
- 授权失败、scope 缺失、MCP/运行时异常：读 [references/troubleshooting.md](references/troubleshooting.md)

## Bitable Detail Files

只有在需要字段值格式、字段 property 结构或完整示例时，再加载这些大文件：

- [references/bitable-record-values.md](references/bitable-record-values.md)
- [references/bitable-field-properties.md](references/bitable-field-properties.md)
- [references/bitable-examples.md](references/bitable-examples.md)
