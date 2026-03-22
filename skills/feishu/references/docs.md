# Docs And Drive

## Scope

这组能力覆盖：

- 云文档创建、读取、更新
- wiki 节点解析和操作
- 云盘文件元数据、复制、移动、上传下载
- 文档媒体下载或插入
- 电子表格读写
- 文档/知识库搜索

## Tool Map

- `feishu_create_doc` `feishu_fetch_doc` `feishu_update_doc`
  文档正文主入口
- `feishu_doc_media`
  文档中的图片、文件、白板资源
- `feishu_drive_file`
  云盘文件元数据和文件搬运
- `feishu_wiki_space` `feishu_wiki_space_node`
  wiki 空间和节点
- `feishu_sheet`
  电子表格：`info` `read` `write` `append` `find` `create`
- `feishu_search_doc_wiki`
  文档和知识库搜索

## Important Notes

- 文档三件套默认通过飞书官方 MCP 网关调用
  不需要本地安装 MCP 插件。
- wiki 链接不一定真的是 docx
  先解析 wiki node，确认 `obj_type` 再决定是走 doc、sheet 还是 bitable。
- `update-doc` 优先局部更新
  少用 `overwrite`，否则容易覆盖掉评论、媒体或复杂块结构。
- 文档中的图片、文件、白板常常要配合 `feishu_doc_media`
  `fetch_doc` 返回的 Markdown 里会带 token 占位。
- 表格类数据不要硬塞进 doc 更新
  真正是电子表格就走 `feishu_sheet`。

## Lark-Flavored Markdown

- 创建和更新文档时使用飞书扩展 Markdown，而不是只按 CommonMark 思考。
- 需要语法细节时读 [lark-markdown.md](lark-markdown.md)。

## Common Failure Patterns

- `replace_range` 定位不稳
  缩小替换范围，避免整段大替换。
- wiki URL 读错类型
  先走 wiki node `get`。
- 文档媒体丢失
  通常是粗暴 `overwrite` 导致。
