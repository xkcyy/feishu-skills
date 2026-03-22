# Feishu Skill Runtime

## Files

- `skills/feishu/.config.example.json`
  可提交的示例模板。不要把真实密钥填进这个文件。
- `skills/feishu/.local/config.json`
  默认真实配置文件。存放 `appId`、`appSecret`、账号、多账号覆盖、`tools.deny` 等信息。这个目录已加入忽略列表。
- `skills/feishu/.state.json`
  脚本写入的本地状态，例如最近一次成功授权的 `userOpenId`。
- `skills/feishu/.runtime/`
  脚本首次运行时自动安装的 npm 运行时依赖，不需要手动维护。

如果你不想用默认位置，也可以：

- 通过环境变量 `FEISHU_SKILL_CONFIG` 指向自定义配置文件
- 或在命令行上显式传 `--config <path>`

## Minimal Config

```json
{
  "defaultAccountId": "default",
  "defaultUserOpenId": "ou_xxx",
  "accounts": {
    "default": {
      "name": "main",
      "appId": "cli_xxxxxxxxxxxxx",
      "appSecret": "xxxxxxxxxxxxxxxx",
      "domain": "feishu"
    }
  },
  "tools": {
    "deny": []
  }
}
```

## Multi-Account Config

```json
{
  "defaultAccountId": "prod",
  "accounts": {
    "prod": {
      "appId": "cli_prod",
      "appSecret": "secret_prod",
      "domain": "feishu",
      "defaultUserOpenId": "ou_prod_owner"
    },
    "boe": {
      "appId": "cli_boe",
      "appSecret": "secret_boe",
      "domain": "lark"
    }
  },
  "tools": {
    "deny": ["feishu_im_user_message.send"]
  }
}
```

## Script Entry Points

- `scripts/auth-login.mjs`
  发起 Device Flow。默认尝试授权当前应用已开通的全部 user scopes，并把成功授权的用户写入 `.state.json`。
- `scripts/auth-status.mjs`
  查看当前用户 token 是否有效、是否需要 refresh。
- `scripts/auth-logout.mjs`
  删除本地存储的用户 token。
- `scripts/whoami.mjs`
  用当前授权用户调用 `feishu_get_user`。
- `scripts/doctor.mjs`
  跑诊断，检查配置、账号、API 连通性、权限和最近错误。
- `scripts/call-tool.mjs`
  通用入口。支持列工具、看 schema、直接执行工具。

## call-tool Workflow

先看工具列表：

```bash
node skills/feishu/scripts/call-tool.mjs --list
```

再看单个工具定义：

```bash
node skills/feishu/scripts/call-tool.mjs --describe feishu_bitable_app
```

最后执行：

```bash
node skills/feishu/scripts/call-tool.mjs feishu_bitable_app --json "{\"action\":\"list\"}"
```

如果 shell 转义麻烦，优先走 stdin。

## Identity Resolution

调用工具时按这个顺序决定用户身份：

1. `--user-open-id`
2. `.state.json` 里该账号最近一次授权成功的用户
3. `skills/feishu/.local/config.json` 里的 `defaultUserOpenId`

有些工具除了上下文里的用户身份，还要求在参数里显式传用户 ID：

- `task.create` 常用 `current_user_id`
- `calendar.create` 常用 `user_open_id`

这两类参数通常应与当前授权用户保持一致。

## Runtime Notes

- 脚本会优先使用当前仓库 `package.json` 里的版本来安装运行时。
- 文档类工具默认直接调用飞书官方 MCP 网关。
- 不需要本地 `openclaw gateway`，也不需要额外安装 MCP 插件。
