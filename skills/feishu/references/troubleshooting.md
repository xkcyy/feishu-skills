# Troubleshooting

## First Checks

1. 先跑 `scripts/doctor.mjs`
2. 再看 `scripts/auth-status.mjs`
3. 最后用 `scripts/call-tool.mjs --describe <tool>` 核对参数

## Common Failures

### No enabled Feishu accounts configured

- `skills/feishu/.local/config.json` 缺失
- `defaultAccountId` 指向了不存在的账号
- 账号缺少 `appId` 或 `appSecret`

### User authorization required

- 先跑 `scripts/auth-login.mjs`
- 如果已经授权过但 scope 不够，重新跑一次 `auth-login`

### App scope missing

- 这是应用权限没有在飞书开放平台开通，不是用户重新登录能解决的问题
- 先补应用 scope，再重试

### Docs tool failed with MCP HTTP error

- 默认 endpoint 是飞书官方 MCP 网关
- 如果你显式配置了 `mcpEndpoint`，先确认地址是否可达
- 再确认授权用户具备对应文档 scope

### Bitable / task / calendar 写入失败

- 先查字段或对象 schema，再写入
- 检查是否把用户 ID、时间格式、批量上限写错

## What This Skill Does Not Need

- 不需要本地 OpenClaw gateway
- 不需要本地编译这个仓库
- 不需要额外安装本地 MCP 插件

## When To Drop To Raw Debugging

- doctor 结果不清楚
- 你怀疑是多账号切错了
- 你怀疑工具 schema 和实际传参不一致

这时优先做两件事：

- `scripts/call-tool.mjs --describe <tool>`
- `scripts/call-tool.mjs <tool> --raw --json "<params>"`
