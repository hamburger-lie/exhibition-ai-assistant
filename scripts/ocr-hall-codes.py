#!/usr/bin/env python3
"""对 A 区馆图做逐展位 OCR，补出无法作为文字提取的展位编号。

为什么需要它
------------
A 区源 PDF 的展位编号被设计软件转成了矢量轮廓，`extract-hall-maps.py` 读不到
文字，导致 A 区 923 个展位里只有 28 个可定位。本脚本把每个展位左上角的编号
区域单独裁出来放大后交给 OCR，把可定位率提到 90% 左右。

实测准确率（在 B 区上测的——B 区编号是活文字，可以当标准答案）
--------------------------------------------------------------
以最密集的 9.1 馆（196 个有编号的展位）为例：

* 整页 600 DPI 一次性 OCR：正确 62%
* **逐展位裁剪放大到 1400 DPI：正确 92.9%、漏识别 5.6%、识别错 1.5%**
* 三个分辨率交叉验证：正确率反而降到 89.8%，且**挡不住误识别**——错误是
  系统性的（`G02A→G02C`、`E12E→E12H` 这类末位字母混淆，三个分辨率读出同样
  的错），不是随机噪声，所以投票没有意义。

因此本脚本采用「逐展位裁剪 + 置信度阈值」，并把结果标记为 OCR 来源：

* **漏识别是安全的**：该展位只是不可定位，页面会显示「暂无该展位的地图坐标」。
* **误识别是危险的**：会把观众指到错误展位。约 1.5% 的展位存在这个风险，
  因此生成的 SVG 会给这些展位打 `data-source="ocr"`，并在验收文档里如实记录。

**根治办法**：向主办方索取 A 区未转曲（文字未转轮廓）的 PDF，直接跑
`extract-hall-maps.py` 即可 100% 准确，不需要本脚本。

用法
----
    python scripts/ocr-hall-codes.py \
        --pdf "A区参观指南图.pdf" --region A \
        --out scripts/hall-codes-ocr.json

依赖：`pip install pymupdf rapidocr-onnxruntime numpy`（仅重新生成时需要；
日常构建不依赖本脚本，它的产物 JSON 已经提交进仓库）。
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path

import numpy as np
import pymupdf
from rapidocr_onnxruntime import RapidOCR

from importlib.util import module_from_spec, spec_from_file_location

_EXTRACT = spec_from_file_location(
    "extract_hall_maps", Path(__file__).with_name("extract-hall-maps.py")
)
_extract = module_from_spec(_EXTRACT)
_EXTRACT.loader.exec_module(_extract)

CODE_RE = re.compile(r"^[A-Z]\d{2,3}[A-Z]?(-\d)?$")
HALL_RE = re.compile(r"^\d{1,2}\.\d$")

# 展位编号印在展位左上角，只裁这一小块，避免中间的展商名干扰识别。
CORNER_W, CORNER_H = 34, 9
CROP_DPI = 1400
MIN_CONFIDENCE = 0.6


def collect_booths(page):
    """必须和 extract-hall-maps.page_booths 同一份列表，窄格才能对上编号。"""
    booths, _, _ = _extract.page_booths(page)
    return [rect for rect, _ in booths]


def read_code(page, rect, ocr) -> str | None:
    if rect.width < 12:
        clip = pymupdf.Rect(
            rect.x0,
            rect.y0,
            rect.x1,
            min(rect.y1, rect.y0 + max(rect.height * 0.6, 16)),
        )
    else:
        corner_h = CORNER_H
        if rect.height > 24:
            corner_h = min(rect.height * 0.4, 16)
        clip = pymupdf.Rect(
            rect.x0,
            rect.y0,
            min(rect.x1, rect.x0 + CORNER_W),
            min(rect.y1, rect.y0 + corner_h),
        )
    pix = page.get_pixmap(clip=clip, dpi=CROP_DPI)
    img = np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width, pix.n)
    if pix.n == 4:
        img = img[:, :, :3]
    result, _ = ocr(img)
    for _, text, confidence in result or []:
        candidate = text.strip().upper().replace(" ", "")
        candidate = re.sub(r"(?<=[A-Z])O(?=\d)", "0", candidate)
        candidate = re.sub(r"(?<=\d)O(?=[A-Z]|$)", "0", candidate)
        if re.fullmatch(r"[A-Z]\d{2}0", candidate):
            candidate = candidate[:-1] + "C"
        if CODE_RE.match(candidate) and confidence > MIN_CONFIDENCE:
            return candidate
    return None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--region", required=True, help="区标识，例如 A")
    parser.add_argument("--out", required=True, help="输出 JSON")
    args = parser.parse_args()

    ocr = RapidOCR()
    doc = pymupdf.open(args.pdf)
    payload: dict[str, dict[str, str]] = {}

    for index in range(len(doc)):
        page = doc[index]
        words = page.get_text("words")
        halls = [w[4].strip() for w in words if HALL_RE.match(w[4].strip())]
        hall = halls[0] if halls else f"{args.region}{index + 1}"
        slug = args.region.lower() + hall.replace(".", "")

        booths = collect_booths(page)
        # 源文件里本来就是活文字的编号优先，OCR 只补缺口。
        live = set()
        for w in words:
            token = w[4].strip()
            if CODE_RE.match(token):
                live.add(token)

        hall_codes: dict[str, str] = {}
        used: dict[str, tuple[str, float]] = {}
        for token in live:
            used[token] = ("", 0.0)
        for rect in booths:
            code = read_code(page, rect, ocr)
            if not code or code in live:
                continue
            key = f"{rect.x0:.1f},{rect.y0:.1f}"
            area = rect.width * rect.height
            if code in used:
                old_key, old_area = used[code]
                if area <= old_area:
                    continue
                if old_key:
                    hall_codes.pop(old_key, None)
            used[code] = (key, area)
            hall_codes[key] = code

        payload[slug] = hall_codes
        print(f"{hall}馆: 展位={len(booths)} OCR补出={len(hall_codes)}")

    doc.close()
    Path(args.out).write_text(json.dumps(payload, ensure_ascii=False, indent=1), encoding="utf-8")
    total = sum(len(v) for v in payload.values())
    print(f"合计 OCR 补出 {total} 个展位编号 -> {args.out}")


if __name__ == "__main__":
    main()
