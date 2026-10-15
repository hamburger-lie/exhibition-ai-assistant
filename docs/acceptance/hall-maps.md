# 展馆平面图（官方参观指南图）

> **公开展示版说明**：主办方的原图、OCR 识别出的编号文件（`scripts/hall-codes-ocr.json`）和补名表没有放进公开版。`apps/h5/public/maps/` 里是按真实展位编号生成的格子示意图，展位 id 规则相同，定位和高亮照常工作。下面记录的是正式版的做法。

占位图已被官方真实馆图取代。素材由
[`scripts/extract-hall-maps.py`](../../scripts/extract-hall-maps.py) 从主办方提供的
两份矢量 PDF 提取，输出到 `apps/h5/public/maps/`：**19 个馆、2774 个叶子展位，其中
2517 个可在图上精确高亮**。

## 呈现方式

底图是 PDF 矢量。普通展位**整格盖白再写回展位号**（大格大号、小格小号），用来挡住店名。
**没识别到编号的展商格也要盖白**，不能因为 OCR 失败就露出店名。
并格大框减掉内部小格后的剩角同样整块盖白（不要挖洞）。
彩色活动区不盖。休息区 / 舞台 / 论坛 / 预告区不盖。走廊「通往 X 馆」和出入口不盖。页脚方位（南S / 指南针）不盖。店名只在当前高亮格由前端叠上。

不要改成 L 形/局部留白盖名：那一版会切残展位号，店名仍会漏，已经回滚。

## 改完必须截图自检

改提取脚本或 SVG 之后，用 Playwright 把 SVG innerHTML 注入 HTML 再截图
（不要直接打开 `.svg` 文件）。至少看 9.1 馆 H06A：编号完整、养生好市还在、
高亮能看见店名。`4173` 预览读 `apps/h5/dist`，改 `public/maps` 后要 rebuild。

## 各馆明细

| 区 | 馆 | hallId | 展位数 | 可定位 | 编号来源 |
| --- | --- | --- | --- | --- | --- |
| A 区 | 1.1馆 | `hall_a11` | 87 | 86 | OCR |
| A 区 | 2.1馆 | `hall_a21` | 78 | 73 | OCR |
| A 区 | 2.2馆 | `hall_a22` | 163 | 153 | OCR |
| A 区 | 3.1馆 | `hall_a31` | 130 | 116 | OCR |
| A 区 | 3.2馆 | `hall_a32` | 195 | 171 | OCR |
| A 区 | 4.1馆 | `hall_a41` | 173 | 170 | OCR |
| A 区 | 4.2馆 | `hall_a42` | 264 | 220 | OCR |
| A 区 | 5.1馆 | `hall_a51` | 128 | 121 | OCR |
| A 区 | 5.2馆 | `hall_a52` | 212 | 182 | OCR |
| B 区 | 9.1馆 | `hall_b91` | 267 | 249 | 活文字 |
| B 区 | 9.2馆 | `hall_b92` | 63 | 61 | 活文字 |
| B 区 | 10.1馆 | `hall_b101` | 197 | 178 | 活文字 |
| B 区 | 10.2馆 | `hall_b102` | 83 | 81 | 活文字 |
| B 区 | 10.3馆 | `hall_b103` | 113 | 95 | 活文字 |
| B 区 | 11.1馆 | `hall_b111` | 202 | 182 | 活文字 |
| B 区 | 11.2馆 | `hall_b112` | 136 | 123 | 活文字 |
| B 区 | 11.3馆 | `hall_b113` | 103 | 93 | 活文字 |
| B 区 | 12.2馆 | `hall_b122` | 115 | 101 | 活文字 |
| B 区 | 13.2馆 | `hall_b132` | 49 | 46 | 活文字 |

## 两种编号来源的可靠性差异

展位方框在两个区都是从矢量路径精确提取的，**图形本身完全准确**。差别只在编号：

### B 区：活文字，100% 准确

源 PDF 的展位编号是可提取的文字，直接读出来与方框配对，不存在识别误差。

### A 区：OCR 补出，实测约 1.5% 可能识别错

A 区源 PDF 的展位编号**已被设计软件转成矢量轮廓**，在 PDF 里是图形不是文字，
读不出来（只有个位数是后期补的活文字）。改用
[`scripts/ocr-hall-codes.py`](../../scripts/ocr-hall-codes.py) 把每个展位左上角的
编号区域单独裁出、放大到 1400 DPI 再识别，把 A 区可定位率从 3% 提到 90%。

准确率是**在 B 区上实测的**——B 区编号是活文字，可以当标准答案跑同一套流程：

| 做法 | 正确 | 漏识别 | 识别错 |
| --- | --- | --- | --- |
| 整页 600 DPI 一次性 OCR（9.1 馆） | 62% | 37% | 1% |
| 全部 10 个 B 区馆整页 OCR | 76.6% | 22.9% | 0.5% |
| **逐展位裁剪放大（9.1 馆）** | **92.9%** | **5.6%** | **1.5%** |
| 三分辨率交叉验证 | 89.8% | 8.7% | 1.5% |

**交叉验证没有用**：错误是系统性的（`G02A→G02C`、`E12E→E12H` 这类末位字母混淆，
三个分辨率会读出同样的错），不是随机噪声，所以多次投票挡不住，反而因为更严格
而丢掉了一些本来正确的结果。因此最终采用「逐展位裁剪 + 置信度阈值」。

两种失败模式的后果不同：

- **漏识别（约 6%）是安全的**：该展位不可定位，页面显示「暂无该展位的地图坐标」。
- **识别错（约 1.5%）是危险的**：会把观众指到错误展位。A 区约 802 个 OCR 编号里
  预计有 **12 个左右**存在这个风险。

因此所有 OCR 来源的展位在 SVG 里都带 `data-source="ocr"` 标记，排查定位问题时
先看这个属性；`packages/demo-catalog/src/venue.ts` 里也用 `codeSource` 字段区分。

### 根治办法

**向主办方索取一份 A 区未转曲（文字未转轮廓）的 PDF**，直接跑
`extract-hall-maps.py`（不加 `--ocr-codes`）即可 100% 准确：

```bash
python scripts/extract-hall-maps.py \
  --a-pdf <未转曲的A区PDF> \
  --b-pdf <B区PDF> \
  --out apps/h5/public/maps
```

对设计方来说这只是导出选项的差别（不勾选「文字转曲线 / Create Outlines」），
通常几分钟就能重新导出。在拿到之前，当前的 OCR 结果已经可用于真机测试与演示。

## 重新生成

官方更新导览图后：

```bash
# 1) A 区编号需要 OCR 补（B 区不需要）
python scripts/ocr-hall-codes.py --pdf <A区PDF> --region A \
  --out scripts/hall-codes-ocr.json

# 2) 生成 19 张 SVG
python scripts/extract-hall-maps.py --a-pdf <A区PDF> --b-pdf <B区PDF> \
  --out apps/h5/public/maps --ocr-codes scripts/hall-codes-ocr.json
```

`extract-hall-maps.py` 是确定性的：同一份 PDF + 同一份 OCR JSON 会生成逐字节
相同的 SVG。生成后需要同步两处：

1. [`apps/h5/src/features/map/map-registry.ts`](../../apps/h5/src/features/map/map-registry.ts)
   —— 馆号到 SVG 的映射；
2. [`packages/demo-catalog/src/venue.ts`](../../packages/demo-catalog/src/venue.ts)
   —— 真机测试演示数据用到的展位编号清单。

OCR 步骤需要 `pip install rapidocr-onnxruntime numpy`；日常构建不依赖它，
产物 `scripts/hall-codes-ocr.json` 已经提交进仓库。

## 保留的占位图

`apps/h5/public/maps/demo-hall.svg` 与 `hall_52` 仍然保留：契约锚点 fixture
（`chat-stream-exhibitor.sse` 等 20 条被契约测试锁定的样例）使用
`booth_52_C18` / `shape_52_C18`，改动它们会破坏契约测试。真实馆图使用
`hall_a*` / `hall_b*` 命名，与占位图不冲突。
