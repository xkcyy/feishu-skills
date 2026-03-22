# Calendar

## Tool Map

- `feishu_calendar_calendar`
  日历读取：`list` `get` `primary`
- `feishu_calendar_event`
  日程：`create` `list` `get` `patch` `delete` `search` `reply` `instances` `instance_view`
- `feishu_calendar_event_attendee`
  参会人：`create` `list` `batch_delete`
- `feishu_calendar_freebusy`
  忙闲查询：`list`

## Hard Rules

- 时间统一用带时区的 RFC 3339。
- 创建日程时尽量传 `user_open_id`
  通常应与当前授权用户一致，这样发起人能稳定出现在日程上下文里。
- 参会人 ID 要分清类型：
  用户 `ou_...`
  群 `oc_...`
  会议室 `omm_...`
  第三方邮箱直接用邮箱地址
- `instances` 只适用于重复日程
  先 `get`，确认存在 `recurrence` 再用。
- 会议室预定是异步的
  初始可能是 `needs_action`，后续再查最终状态。

## Common Failure Patterns

- 发起人不在参会列表
  常见原因是没传 `user_open_id`。
- 时间偏 8 小时
  基本是丢了时区。
- 改日程报权限错误
  当前用户不是组织者，或创建时没给参会人足够能力。
