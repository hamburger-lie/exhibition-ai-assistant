# 契约变更提案：产品卡图片字段

**状态：待甲方确认。本提案未修改任何已冻结的 Schema，确认前不实施。**

| 项目 | 内容 |
| --- | --- |
| 提案编号 | CR-001 |
| 提出方 | A 方 |
| 日期 | 2026-08-25 |
| 影响契约 | `packages/contracts/schemas/card.schema.json`（可选：`chat.schema.json`） |
| 当前状态 | 未实施；等待甲方决策 |

## 1. 背景与问题

UI 规格 §4.2 要求产品卡展示「产品图片、产品名称、所属品牌/展商、分类、所在展位」。

但已冻结的 `card.schema.json` 中 `ProductPayload` 的字段为：

```
product_id, name, category, functions?, brand?, exhibitor_id, hall_id, booth_ids, tags?
```

**没有任何图片字段**，且 `additionalProperties: false`。对照之下 `ExhibitorPayload` 是有
`logo_url` 的，说明当时遗漏的是产品图，而不是有意不做图片。

A 方当前的处理：按规格 §4.2「缺失字段直接隐藏，不显示虚构占位值」，产品卡**不渲染图片**，
也绝不编造图片地址。相关说明写在 `apps/h5/src/features/cards/ProductCard.tsx` 的注释里。

## 2. 建议方案

### 2.1 字段名与位置

在 `card.schema.json` 的 `ProductPayload` 中新增：

```jsonc
"image_url": {
  "type": ["string", "null"],
  "format": "uri",
  "pattern": "^https://"
}
```

选择理由：

- 命名与既有的 `ExhibitorPayload.logo_url` 对齐（`<用途>_url`），不引入新的命名风格。
- 放在 `ProductPayload` 而不是卡片顶层：图片是产品实体的属性，与 `name`/`category` 同级；
  卡片顶层只放展示结构（`title`/`subtitle`/`badges`/`actions`）。
- 类型允许 `null`：与 `logo_url` 完全一致，B 方在没有图时可以显式给 `null`，
  而不需要在「省略字段」和「给空串」之间二选一。

### 2.2 是否可选

**可选（optional）**，不加入 `required`。

- 保证向后兼容：B 方尚未提供图片时，现有响应依然合法。
- A 方按「有则展示、无则隐藏」处理，不会因为缺图而报错或显示占位图。

### 2.3 HTTPS 限制

`pattern: "^https://"` 强制 HTTPS，与 `ExhibitorPayload.logo_url` 的现有约束一致。

原因：H5 将部署在 HTTPS 域名下，混合内容（HTTPS 页面加载 HTTP 图片）会被浏览器直接拦截，
在微信 WebView 中表现尤其不稳定。把这条限制放进 Schema，可以在契约测试阶段就拦住问题，
而不是等到真机上才发现图裂。

### 2.4 建议同步考虑（可选，非必须）

若同意本提案，建议一并评估是否给 `chat.schema.json` 的 `ProductEntity`（E07 详情用）
加同名 `image_url`，以免「卡片有图、详情页没图」。可以分两批做，但字段名应保持一致。

## 3. 对双方的影响

### B 方

- 需要在产品实体中补充图片地址，并保证是 HTTPS 可公开访问的 URL。
- 需要确认图片来源与使用授权（展商提供的产品图是否允许在小助手内展示）。
- 无图的产品显式返回 `null` 或直接省略该字段，两者都合法。

### A 方

- `ProductCard` 增加图片渲染；样式沿用已有的 `.entity-card__media`
  （已定义 `aspect-ratio: 16/9` 与占位底色，会预留空间，避免图片加载导致布局跳动）。
- 加 `loading="lazy"` 与 `alt`（用产品名称），满足可访问性与性能要求。
- 更新 `generated-types`、契约测试与卡片组件测试。
- 预估改动量：小（1 个组件 + 1 处 Schema + 若干测试）。

### 不影响

- 不影响任何现有字段、枚举、错误码或 SSE 事件顺序。
- 不影响 E03/E04/E05/E06 的请求与响应结构。

## 4. 向后兼容性

| 场景 | 结果 |
| --- | --- |
| 旧 B 方响应（无该字段）→ 新 A 方 | ✅ 合法；A 方不渲染图片 |
| 新 B 方响应（含该字段）→ 旧 A 方 | ❌ **会被拒绝**：`additionalProperties: false` 会让校验失败 |

因此这是一次**需要协调发布顺序**的变更：

1. 先合并 Schema 变更并双方同步升级契约包；
2. A 方先上线（能容忍有无该字段）；
3. B 方再开始下发 `image_url`。

若担心发布窗口，替代方案是本次先只改 Schema、双方都不下发数据，等 A 方上线后再由 B 方开闸。

## 5. 需要甲方决策的问题

1. 是否同意新增 `ProductPayload.image_url`（可选、HTTPS-only）？
2. 是否同时给 E07 的 `ProductEntity` 加同名字段？
3. 产品图片的来源与授权由谁负责确认？
4. 是否需要约定图片尺寸/比例建议（如 ≥ 800px 宽、16:9 或 1:1）以保证展示一致性？

---

确认后，A 方将按第 4 节的发布顺序实施，并在实施时补齐契约测试与组件测试。
