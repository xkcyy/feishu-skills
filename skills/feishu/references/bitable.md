# Bitable

## When To Load Extra Files

- 需要知道字段值怎么写：读 [bitable-record-values.md](bitable-record-values.md)
- 需要知道字段 `property` 怎么构造：读 [bitable-field-properties.md](bitable-field-properties.md)
- 需要完整 JSON 示例：读 [bitable-examples.md](bitable-examples.md)

## Tool Map

- `feishu_bitable_app`
  管理 bitable app 本体：`create` `get` `list` `patch` `copy`
- `feishu_bitable_app_table`
  管理数据表：`create` `list` `patch` `delete` `batch_create` `batch_delete`
- `feishu_bitable_app_table_field`
  管理字段：`create` `list` `update` `delete`
- `feishu_bitable_app_table_record`
  管理记录：`create` `update` `delete` `batch_create` `batch_update` `batch_delete` `list`
- `feishu_bitable_app_table_view`
  管理视图：`create` `get` `list` `patch` `delete`

## Hard Rules

- 写记录前先跑 `feishu_bitable_app_table_field.list`
  必须先确认 `type` / `ui_type`，再构造字段值。
- `app.create` 自带默认表和空行
  批量导入前先清理默认空记录，避免脏数据。
- 人员字段默认用 `open_id`
  值通常是 `[{ "id": "ou_xxx" }]`，不是字符串。
- 日期字段用毫秒时间戳
  不要直接传 `"2026-03-22"` 这类字符串，除非工具明确做了转换。
- 单次批量写入最多 500 条
  超过就分批。
- 同一张表不要并发写
  顺序执行更稳。

## Common Failure Patterns

- `1254015` / field type mismatch
  基本都是字段值格式不对，先回到字段列表和 `bitable-record-values.md`。
- `125406x`
  通常是转换失败，如日期、URL、人员、附件格式不合法。
- `1254291`
  同表并发写冲突。
- `1254303`
  附件没有先上传到当前 bitable。
