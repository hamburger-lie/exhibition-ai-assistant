# 固定 Mock Fixtures

`manifest.json` 是 20 条场景 Fixture 的唯一清单；`scenario.schema.json` 只描述测试传输行为，不计入场景数。

- `429`、`503` 在首个 SSE 事件前返回 JSON 错误。
- `initial-timeout` 在首事件前延迟超过 30 秒，随后以公共超时错误收束。
- `chat-interrupted` 在两个合法事件后断流且没有终止事件。
- `chat-unknown-event` 中的 `debug.trace` 供解析器忽略；其余已知事件仍逐条验证。
- `old-expo` 对 `expo_demo_2025_spring` 使用硬过滤，禁止静默回落到最新届次。

Task 4 加载场景时仍必须先以 `path.resolve` 解析目标，再确认结果的父目录严格等于本目录；basename Schema 是第一道约束，不能代替运行时根目录校验。
