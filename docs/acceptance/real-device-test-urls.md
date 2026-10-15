# 真机测试用大批量样例数据

**目的**：真机验收（微信内置浏览器 / iOS Safari / Android Chrome）需要在真实设备上
反复点开大量不同的详情页、地图展位，才能测出「长文本折行」「缺失字段是否正确隐藏」
「多展位选择」「徽标换行」这类只有 1-2 条样例测不出来的边界情况。

数据来源：[`apps/bff/src/entities/fixture-entity-data.ts`](../../apps/bff/src/entities/fixture-entity-data.ts)，
仅在 `BFF_ENTITY_DETAIL_PROVIDER=fixture`（联调/验收环境）下生效，生产环境不会加载。
字段严格取自 `chat.schema.json` 的 `ExhibitorEntity`/`ProductEntity`/`EventEntity`
定义，未新增任何业务字段；全部 84 条样例都过了一遍 schema 校验，见
[`entities.test.ts`](../../apps/bff/test/entities.test.ts)（原有 3 条锚点用例）和构建时的
一次性 schema 校验（84 条、0 失败、无重复 ID）。

## 现在可以直接在聊天里搜名字了

Mock B 仍然是 Task 4 要求的「关键词路由」，不是真搜索——但在原有 20 条固定
fixture 之外，`chat-exhibitor`/`chat-product`/`chat-event` 这三类场景现在会
额外检查一遍：query 里如果精确包含下面 84 条样例中某一条的展商名/产品名/
活动名，就动态拼一份对应的卡片返回，而不是永远回落到锁死的默认卡片。匹配
规则是确定性的子串匹配（不分词、不模糊、不做语义理解），实现见
[`apps/mock-b/src/entity-search.ts`](../../apps/mock-b/src/entity-search.ts)，
数据源见 [`packages/demo-catalog`](../../packages/demo-catalog/src/index.ts)
（BFF 的 E07 详情页和 Mock B 的聊天卡片共用同一份数据，保证 ID 对得上）。

例如直接在输入框打「帮我找悦肌美妆」「射频美容仪的产品信息」「闭幕式几点开始」，
就会分别搜到对应的展商/产品/活动卡片，点「查看详情」进去的也是同一条数据。

**已知限制**：
- 只支持精确子串匹配，打错字/同义词/缩写搜不到——这仍然是确定性 mock，不是真检索。
- 关键词优先级是 Task 4 原有设计：query 里如果同时命中「展位」「产品」等更具体的
  关键词，会先按那个关键词路由，不一定落到展商匹配分支。用展商/产品/活动的
  **完整名字**去搜最稳（例如展商名超过 11 个用了很长的后缀，得连后缀一起打）。
- 三条锚点样例（`华研生物科技`/`胶原焕颜精华`/`AI赋能美业论坛`，来自最初的
  20 条契约 fixture）不参与这套动态匹配，搜索它们走的还是原来锁死的静态内容，
  行为跟之前完全一致。

下面的直接 URL 清单依然有效（比如要测多展位选择、地图降级提示这些不方便靠
打字凑出来的边界情况，直接开链接更快）。

## 使用方法

1. 把手机和这台机器接入同一个局域网。
2. 把下面所有 URL 里的 `localhost` 换成这台机器的局域网 IP（例如 `192.168.1.5`），
   在真机浏览器里逐条打开。
3. 微信里测试需要通过公众号/小程序的 webview 跳转规则单独配置，此清单只覆盖
   直接用浏览器打开 H5 的场景。

## 会话页（先访问一次，避免详情页因为没有 session 而报错）

```
http://localhost:8081/
```

## 展位地图（官方馆图，19 个馆）

占位图已换成官方参观指南图：A 区 9 个馆、B 区 10 个馆，共 2086 个展位。
详见 [`hall-maps.md`](./hall-maps.md)。

**能高亮的展位（B 区，1104 个）**——打开后目标展位有品牌色描边与轻微呼吸：

```
http://localhost:8081/map?hall_id=hall_b92&booths=%5B%7B%22booth_id%22%3A+%22booth_b92_E01%22%2C+%22display_code%22%3A+%22E01%22%2C+%22map_shape_id%22%3A+%22shape_b92_E01%22%7D%5D
http://localhost:8081/map?hall_id=hall_b91&booths=%5B%7B%22booth_id%22%3A+%22booth_b91_E01A%22%2C+%22display_code%22%3A+%22E01A%22%2C+%22map_shape_id%22%3A+%22shape_b91_E01A%22%7D%5D
http://localhost:8081/map?hall_id=hall_b103&booths=%5B%7B%22booth_id%22%3A+%22booth_b103_A01%22%2C+%22display_code%22%3A+%22A01%22%2C+%22map_shape_id%22%3A+%22shape_b103_A01%22%7D%5D
http://localhost:8081/map?hall_id=hall_b132&booths=%5B%7B%22booth_id%22%3A+%22booth_b132_E01%22%2C+%22display_code%22%3A+%22E01%22%2C+%22map_shape_id%22%3A+%22shape_b132_E01%22%7D%5D
```

其余展位把上面 URL 里的 `E01` 换成
[`packages/demo-catalog/src/venue.ts`](../../packages/demo-catalog/src/venue.ts)
里该馆的任意编号即可（`hall_id`、`booth_id`、`map_shape_id` 三处要一起换）。

**多展位选择**——该展商有两个展位，应先出现「请选择」列表：

```
http://localhost:8081/map?hall_id=hall_b92&booths=%5B%7B%22booth_id%22%3A+%22booth_b92_E01%22%2C+%22display_code%22%3A+%22E01%22%2C+%22map_shape_id%22%3A+%22shape_b92_E01%22%7D%2C+%7B%22booth_id%22%3A+%22booth_b92_E02%22%2C+%22display_code%22%3A+%22E02%22%2C+%22map_shape_id%22%3A+%22shape_b92_E02%22%7D%5D
```

**降级提示**——展位号真实但没有地图坐标，应显示「暂无该展位的地图坐标，无法在
图上高亮」而不是空白或假高亮：

```
http://localhost:8081/map?hall_id=hall_b92&booths=%5B%7B%22booth_id%22%3A+%22booth_b92_F99%22%2C+%22display_code%22%3A+%22F99%22%7D%5D
```

**A 区馆图**——编号由 OCR 补出（约 1.5% 可能识别错，见 `hall-maps.md`），
830 个展位同样可以高亮。真机上如果发现高亮位置与展位号对不上，就是那 1.5%：

```
http://localhost:8081/map?hall_id=hall_a11&booths=%5B%7B%22booth_id%22%3A+%22booth_a11_E21%22%2C+%22display_code%22%3A+%22E21%22%2C+%22map_shape_id%22%3A+%22shape_a11_E21%22%7D%5D
http://localhost:8081/map?hall_id=hall_a41&booths=%5B%7B%22booth_id%22%3A+%22booth_a41_E04E%22%2C+%22display_code%22%3A+%22E04E%22%2C+%22map_shape_id%22%3A+%22shape_a41_E04E%22%7D%5D
```

A 区没被 OCR 认出来的展位（约 6%）走降级提示：

```
http://localhost:8081/map?hall_id=hall_a11&booths=%5B%7B%22booth_id%22%3A+%22booth_a11_X01%22%2C+%22display_code%22%3A+%22X01%22%7D%5D
```

其余馆把 `hall_a11` 换成 `hall_a21` / `hall_a22` / `hall_a31` / `hall_a32` /
`hall_a41` / `hall_a42` / `hall_a51` / `hall_a52`，B 区换成 `hall_b91` /
`hall_b92` / `hall_b101` / `hall_b102` / `hall_b103` / `hall_b111` /
`hall_b112` / `hall_b113` / `hall_b122` / `hall_b132`。

真机上重点看：**双指缩放后展位描边是否依然清晰**（用了
`vector-effect: non-scaling-stroke`）、大馆（9.1 馆 209 个展位）**拖动是否跟手**。

## 展商详情页（36 条）

```
http://localhost:8081/entity/exhibitor/exhibitor_huayan?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/exhibitor/exhibitor_e02?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/exhibitor/exhibitor_e03?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/exhibitor/exhibitor_e04?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/exhibitor/exhibitor_e05?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/exhibitor/exhibitor_e06?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/exhibitor/exhibitor_e07?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/exhibitor/exhibitor_e08?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/exhibitor/exhibitor_e09?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/exhibitor/exhibitor_e10?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/exhibitor/exhibitor_e11?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/exhibitor/exhibitor_e12?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/exhibitor/exhibitor_e13?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/exhibitor/exhibitor_e14?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/exhibitor/exhibitor_e15?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/exhibitor/exhibitor_e16?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/exhibitor/exhibitor_e17?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/exhibitor/exhibitor_e18?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/exhibitor/exhibitor_e19?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/exhibitor/exhibitor_e20?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/exhibitor/exhibitor_e21?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/exhibitor/exhibitor_e22?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/exhibitor/exhibitor_e23?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/exhibitor/exhibitor_e24?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/exhibitor/exhibitor_e25?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/exhibitor/exhibitor_e26?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/exhibitor/exhibitor_e27?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/exhibitor/exhibitor_e28?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/exhibitor/exhibitor_e29?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/exhibitor/exhibitor_e30?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/exhibitor/exhibitor_e31?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/exhibitor/exhibitor_e32?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/exhibitor/exhibitor_e33?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/exhibitor/exhibitor_e34?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/exhibitor/exhibitor_e35?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/exhibitor/exhibitor_e36?expo_id=expo_demo_2026_spring
```

覆盖点：每 6 条里有 1 条是多展位（会走「该展商有多个展位，请选择」分支，见地图页）；
约 1/4 缺 `brands`、1/5 缺 `categories`、1/3 缺 `tags`、1/3 缺 `description`；
约 1/11 用了很长的展商名，1/9 用了长简介，专门测折行和截断。

## 产品详情页（30 条）

```
http://localhost:8081/entity/product/product_collagen_serum?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/product/product_p02?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/product/product_p03?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/product/product_p04?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/product/product_p05?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/product/product_p06?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/product/product_p07?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/product/product_p08?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/product/product_p09?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/product/product_p10?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/product/product_p11?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/product/product_p12?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/product/product_p13?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/product/product_p14?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/product/product_p15?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/product/product_p16?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/product/product_p17?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/product/product_p18?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/product/product_p19?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/product/product_p20?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/product/product_p21?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/product/product_p22?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/product/product_p23?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/product/product_p24?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/product/product_p25?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/product/product_p26?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/product/product_p27?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/product/product_p28?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/product/product_p29?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/product/product_p30?expo_id=expo_demo_2026_spring
```

覆盖点：约 1/3 缺 `functions`、1/4 缺 `brand`、1/5 缺 `tags`；约 1/5 没有展位动作
（不显示「去展位」按钮）。

## 活动详情页（18 条）

```
http://localhost:8081/entity/event/event_ai_forum?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/event/event_ev02?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/event/event_ev03?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/event/event_ev04?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/event/event_ev05?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/event/event_ev06?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/event/event_ev07?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/event/event_ev08?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/event/event_ev09?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/event/event_ev10?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/event/event_ev11?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/event/event_ev12?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/event/event_ev13?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/event/event_ev14?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/event/event_ev15?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/event/event_ev16?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/event/event_ev17?expo_id=expo_demo_2026_spring
http://localhost:8081/entity/event/event_ev18?expo_id=expo_demo_2026_spring
```

覆盖点：四种活动状态（`scheduled`/`ongoing`/`ended`/`cancelled`）循环出现；约 1/4
没有 `hall`（场地显示为「中央活动广场」）；约 1/3 没有 `speakers`；讲者人数在
1-3 人之间变化，测多行文本换行。

## 真正来自聊天的原始 3 条样例（仍然可用，跟之前一致）

- `华研生物科技` / `胶原焕颜精华` / `AI赋能美业论坛`：这三条 ID 跟聊天里
  `chat-stream-exhibitor.sse` 等固定 SSE 卡片强绑定，内容没有变，聊天里搜「展商」
  「产品」「活动」关键词依然会回到这三条。
