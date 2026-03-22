# Task

## Tool Map

- `feishu_task_task`
  单任务操作：`create` `get` `list` `patch`
- `feishu_task_tasklist`
  清单操作：`create` `get` `list` `tasks` `patch` `delete` `add_members` `remove_members`
- `feishu_task_comment`
  评论：`create` `list` `get`
- `feishu_task_subtask`
  子任务：`create` `list`

## Hard Rules

- 时间使用 RFC 3339 / ISO 8601，带时区。
- 创建任务时尽量传 `current_user_id`
  这通常应是当前授权用户的 `open_id`，这样创建者会被自动加为 follower，后续还能编辑任务。
- `patch` / `get` 需要 `task_guid`
- `tasklist.tasks` 需要 `tasklist_guid`
- 标记完成时传 `completed_at`
  恢复未完成用字符串 `"0"`，不是数字 `0`。

## Role Model

- `assignee`
  负责人，可执行任务。
- `follower`
  关注人，主要接收通知。
- tasklist 创建者自动是 `owner`
  不要再在 `members` 里重复加同一个人。

## Common Failure Patterns

- 创建后自己不能改任务
  大多是没传 `current_user_id`，或没把自己加入成员体系。
- 时间不对
  先看时区是否丢失。
- `completed_at` 反完成失败
  传成了数字 `0` 或其他格式。
