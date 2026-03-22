# IM Read

## Tool Map

- `feishu_im_user_get_messages`
  按会话读取历史消息
- `feishu_im_user_get_thread_messages`
  读取话题回复
- `feishu_im_user_search_messages`
  跨会话搜索消息
- `feishu_im_user_fetch_resource`
  下载图片、文件、音视频资源
- `feishu_chat`
  查 chat 信息
- `feishu_chat_members`
  查群成员

## Hard Rules

- `chat_id` 和 `open_id` 二选一
- 只读用户有权限访问的会话
- 发现 `thread_id` 时，按意图决定是否继续拉话题回复
- 下载资源需要 `message_id + file_key + type`

## Time Filtering

- `relative_time` 和 `start_time/end_time` 互斥
- 没给明确时间范围时，按用户意图补一个合理窗口
- 需要完整结果时检查 `has_more` 并继续翻页

## Common Failure Patterns

- 结果太少
  时间范围太窄，或者没有继续翻页。
- 上下文不完整
  发现 `thread_id` 但没有展开。
- 资源下载失败
  `file_key` 不属于对应 `message_id`，或者类型传错。
