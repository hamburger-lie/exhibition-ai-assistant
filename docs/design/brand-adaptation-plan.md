# 宿主视觉适配方案：主办方小程序品牌红/粉/白体系

**状态：等待官方资产，本文档不改任何代码/token 值。**

背景：H5 当前的 `--brand-*` 全部是中性石墨色占位（[tokens.css:24-28](../../apps/h5/src/styles/tokens.css)
的注释里写明是刻意选的无彩色，等官方规范落地后只换这一组变量），与 主办方小程序现有的
红/粉/白品牌体系不一致。本文档先完成两件事：

1. 列出需要向小程序侧（代码仓库/设计稿/品牌规范文档）要的**具体资产**，不从截图取色。
2. 给出拿到资产之后的 **token 映射方案**——每个 token 改哪里、影响界面上的哪些元素、
   哪些颜色故意保持不变。

代码本身要等官方色值到位后才改；这里只锁定"改的时候改哪、不改哪"。

---

## 1. 需要的品牌资产清单

请从小程序**现有代码或设计稿**（不是截图）里提供以下内容：

| # | 资产 | 用途 | 备注 |
| --- | --- | --- | --- |
| 1 | 官方品牌红 hex 值 | `--brand-primary`：主按钮、发送按钮、选中态、地图高亮描边 | 需要精确值，不是"看起来像"的红 |
| 2 | 品牌红 hover/active 深色版 hex 值（如果官方定义了的话） | `--brand-primary-strong`：按钮按下态 | 如果官方没有单独定义深色版，我们会用 HSL 降低亮度**派生**一个，需要你确认这种派生方式可接受，否则要另给一个深色值 |
| 3 | 官方浅粉色 hex 值 | `--brand-primary-tint`：用户消息气泡背景、聚焦光晕、地图高亮填充、反馈原因选中背景 | **这个必须是官方定义的粉色，不能靠算法把红色调淡**——算法淡化出来的粉大概率跟小程序里其它页面用的浅粉对不上，会产生新的不一致 |
| 4 | 按钮上文字色 | `--brand-on-primary` | 默认沿用现在的纯白 `#ffffff`，除非官方按钮文字不是纯白 |
| 5 | 官方金色 hex 值 + 使用场景说明 | 新增语义色，只用于展会活动/届次相关内容（例如届次徽标、活动状态标签），**不**替换 Chat 主操作色 | 需要你确认具体哪些位置要用金色（当前 H5 里没有任何金色使用点，这是全新的语义色，需要先定场景再定实现） |
| 6 | 官方 Logo 文件（SVG 优先，否则 2x/3x PNG，透明背景） | 替换 [chat-header\_\_logo](../../apps/h5/src/features/chat/ChatPage.tsx) 当前的黑色 "AI" 占位方块 | 见第 4 节——占位块不会被我们自行设计成正式 Logo，必须等文件 |
| 7 | Logo 最小间距/安全区规范（如果有品牌手册） | 保证 Logo 在 28px 高度的头部区域里不被裁切变形 | 没有的话我们按常规四周留白处理 |
| 8 | 小程序 `.json` 页面配置里 `navigationStyle` 的值（`custom` 还是默认） | 判断小程序原生导航栏是否显示 | 见第 5 节，直接影响 H5 内部 Header 要不要精简 |
| 9 | 若原生导航栏显示：其背景色、标题文字色、返回按钮样式 | 让 H5 页面顶部与原生导航栏衔接不突兀 | 只在原生导航栏保留的情况下需要 |
| 10 | 品牌规范文档（VI 手册）里关于文字对比度的例外说明（如果有） | 万一官方红本身对白底文字对比度不够 4.5:1，需要知道是否有官方认可的降级方案 | 见第 6 节 |

> 我在这个仓库里搜过：没有小程序源码、没有设计稿文件，三份需求/契约 Word 文档里唯一能提取到的色值
> 是文档表格自带的状态徽标配色（绿/红/蓝/紫，用于"已完成/待定"这类文档格式），跟小程序 App 的品牌色无关，
> 不能当成官方色值使用。所以第 1-9 项目前在本仓库内没有任何来源，必须从你那边拿。

---

## 2. Token 映射方案

不改值，只锁映射关系。左边是现有 token（保留变量名不变），右边是拿到资产后要填的内容。

| Token | 现状（占位） | 映射到 | 变更范围 |
| --- | --- | --- | --- |
| `--brand-primary` | `#33404d` 石墨灰 | 官方品牌红（资产 #1） | 主按钮/发送按钮/选中态/地图高亮/文字链接色 |
| `--brand-primary-strong` | `#232d37` | 官方深红或从 #1 派生（资产 #2） | 按钮 hover/active |
| `--brand-primary-tint` | `#edf0f3` | 官方浅粉（资产 #3） | 用户气泡、聚焦光晕、地图高亮填充、反馈选中背景 |
| `--brand-on-primary` | `#ffffff` | 大概率不变（资产 #4 待确认） | 按钮文字色 |
| *(新增)* `--color-gold` / `--color-gold-surface` | 不存在 | 官方金色 + 场景（资产 #5） | 仅限展会活动/届次相关内容，不接入任何 `--brand-*` 的引用点 |
| `--color-danger` / `--color-success` / `--color-warning` 及各自 `-surface` | 现有独立语义色 | **不变** | 错误/成功/警告继续用现在这套，不跟品牌色混 |
| `--color-focus` | `#1a4f8a` 中性蓝焦点环 | **暂定不变**，见下方说明 | 键盘焦点可见性 |
| `--logo-size` / 占位块 | 28px 黑底 "AI" 文字块 | 等 Logo 文件（资产 #6/#7）到位后**整体替换**，不是换底色 | 头部 Logo 位 |
| `--color-bg` / `--color-surface` / `--color-text` / `--color-text-muted` | 浅灰底/白卡/深灰字 | **不变** | 呼应你的原则 1：页面卡片继续白底、正文继续深灰，Chat 阅读性不受品牌色影响 |

**关于 `--color-focus` 暂定不变**：焦点环的作用是给键盘用户一个和内容色系"跳出来"的强提示，
业界通常故意让它和品牌主色区分开（避免焦点环被误认成品牌强调色，或者被品牌红盖过导致不够醒目）。
如果官方规范里明确要求焦点环也用品牌红，我们会照做，但要单独验证红色焦点环在白底/浅粉底上的
3:1 对比度是否还够（见第 6 节）——如果不够会跟你确认降级方案，而不是自己降低标准。

**关于占位 Logo 块（对应你的原则 7）**：现在的黑底 "AI" 方块是纯中性占位，我们**不会**把它的
底色换成品牌红来"装扮成正式 Logo"——那样反而会造成一个假 Logo 长期存在的风险。它会保持中性，
直到拿到资产 #6（真实 Logo 文件）后整体替换整个头部 Logo 区域。

---

## 3. 换色后受影响的具体 UI 元素（对照当前代码）

| 元素 | 文件 | 当前引用的 token |
| --- | --- | --- |
| 发送按钮、生成中的停止按钮 | [Composer.tsx](../../apps/h5/src/features/chat/Composer.tsx) / `.composer__btn` | `--brand-primary` |
| 快捷入口图标（找展商/找产品/找展位/查活动） | [WelcomeScreen.tsx](../../apps/h5/src/features/home/WelcomeScreen.tsx) / `.quick-action__icon` | `--brand-primary` |
| 问题示例文字链接 | `.example-link` | `--brand-primary` |
| 用户消息气泡背景 | `.msg__bubble`（`.msg--user`） | `--brand-primary-tint` |
| 卡片主操作按钮（查看展商/展位定位等） | `.entity-card__action--primary` | `--brand-primary` / `--brand-primary-strong` / `--brand-on-primary` |
| 推荐追问 chip：文字色 + hover 描边/背景 | [SuggestionList](../../apps/h5/src/features/chat/SuggestionList.tsx) / `.suggestions__item` | `--brand-primary`（文字），hover 态用 `--brand-primary-tint` 背景 + `--brand-primary` 描边——这正好对应你原则 4 说的"白底、品牌红文字/描边" |
| "展开其余 N 个结果" / 引用文字色相关按钮 | `.card-stack__more` | `--brand-primary` |
| 反馈按钮选中态、原因选中背景 | [FeedbackSheet.tsx](../../apps/h5/src/features/feedback/FeedbackSheet.tsx) / `.feedback__btn[aria-pressed]` / `.sheet__reason[aria-pressed]` | `--brand-primary` / `--brand-primary-tint` |
| 输入框聚焦光晕 | `.composer__input:focus-visible` | `--brand-primary`（描边）+ `--brand-primary-tint`（光晕） |
| 地图展位高亮描边/填充 | [MapPage.tsx](../../apps/h5/src/features/map/MapPage.tsx) / `.map-canvas__viewport [data-highlighted]` | `--brand-primary`（描边）+ `--brand-primary-tint`（填充）——对应你原则 2 的"地图高亮改为品牌红" |
| "新对话"按钮、重试按钮、弹层提交按钮 | 多处 `.chat-header__action` / `.screen-state__retry` / `.sheet__submit` | `--brand-primary` |

这些全部通过 `--brand-*` 四个变量驱动，改 token 值即可全局生效，**不需要改任何组件代码**——
这也是当初把品牌色抽成占位 token 的原因。

---

## 4. 黑色 Logo 占位块（你的原则 7）

当前实现：[ChatPage.tsx](../../apps/h5/src/features/chat/ChatPage.tsx) 里
`<span className="chat-header__logo" aria-hidden="true">AI</span>`，28×28px，黑底白字，
纯占位，代码注释里写明"官方 Logo 待提供，先用中性占位块，不猜测品牌图形"。

**明确不做**：不会给这个方块换成品牌红底色再放个图形假装是 Logo。等资产 #6（真实 Logo 文件）
到位后，直接整体替换这个 DOM 节点为 `<img>`/内联 SVG，占位块连同它的类名一起下线。

---

## 5. 宿主导航评估：小程序原生导航 vs H5 内部 Header（你的原则 8）

**现状**：H5 有自己的内部 Header（[ChatPage.tsx](../../apps/h5/src/features/chat/ChatPage.tsx) 的
`.chat-header`：占位 Logo + "AI 问答助手" 标题 + 有消息时的"新对话"按钮），这是给
`direct_h5`/`qr_code` 等非小程序入口用的。

**信息缺口**：这个仓库里没有小程序侧代码，不知道 `<web-view>` 所在页面的
`navigationStyle` 配置成什么。这直接决定要不要精简 H5 内部 Header：

| 小程序侧配置 | 结果 | H5 应对方案 |
| --- | --- | --- |
| `navigationStyle: "custom"`（隐藏原生导航栏） | 只有 H5 自己的 Header，不会重复 | 保持现状不变 |
| 默认（显示原生导航栏，标题+返回键） | **原生导航 + H5 Header 会形成双标题/双 Logo** | 需要针对 `source: 'wechat_miniprogram_webview'` 场景精简 H5 Header：去掉标题文字和 Logo，只保留"新对话"这一个功能性按钮（如果还需要的话）；返回交互交给小程序原生返回键，不在 H5 里重复 |

`source` 字段本来就已经在 [session 请求](../../apps/h5/src/shared/api/client.ts) 里区分了
`wechat_miniprogram_webview` / `direct_h5` / `qr_code` / `other`，所以技术上按来源条件渲染
Header 是现成能力，不需要新增机制——但**要不要精简、精简到什么程度，取决于资产 #8/#9**，
现在不猜测着做。

---

## 6. 换色后的 WCAG 对比度复核计划（你的原则 10）

拿到官方色值后，我们会：

1. 把新色值代入 [design-tokens.test.ts](../../apps/h5/src/styles/design-tokens.test.ts)
   里已有的 `contrast()` 计算逻辑（相对亮度公式，跟规格 §8.1 一致），复算这几组：
   - 正文 `--color-text` on `--color-surface` / `--color-bg`（应该不受影响，因为背景/正文色不换，见第 2 节）
   - 按钮文字 `--brand-on-primary` on `--brand-primary`（红色按钮上的白字，**红色饱和度较高时经常卡在 4.5:1 边缘，这是最需要重点验证的一组**）
   - 用户气泡正文 `--color-text` on `--brand-primary-tint`（深灰字压在浅粉底上）
   - 焦点环 `--color-focus`（或如果改用品牌红）on `--color-surface` / `--color-bg`，非文字元素门槛 3:1
2. 如果官方红在"按钮文字"这组测不过 4.5:1：我们不会私自调整官方色值本身，而是回来跟你确认——
   常见的合规做法是按钮维持官方红做背景，但也可能需要官方给一个"深红"变体专门用在按钮背景
   （比页面强调色更深一点，同时保留同一色相），这个需要设计侧决策，不是工程侧能单方面改的。
3. 复核结果和最终色值一起写回 `tokens.css` 的注释，取代当前"占位待替换"的说明。

---

## 7. 明确不做的事（对齐你的约束）

- 不凭截图猜测任何色值。
- 不在拿到官方资产前修改 `tokens.css` 里的任何 `--brand-*` / 新增的金色 token 值。
- 不改任何组件结构、不改路由、不改业务逻辑。
- 不把占位 Logo 块设计成正式 Logo。
- 不在没有确认 `navigationStyle` 之前调整 Header 结构。

等资产清单（第 1 节）到位后，我会按第 2 节的映射表改 `tokens.css`，跑一遍第 6 节的对比度复核，
再给你看结果——不会一步到位直接改完就收工。
