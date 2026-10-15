#!/usr/bin/env python3
"""从 参观指南 PDF 抽出「馆 + 展位号 → 图上短称」。

只写名字，不写展位清单：可定位展位号以 packages/demo-catalog/src/venue.ts
为准（含 A 区 OCR 补出的编号）。功能区/活动区文字不当作展商名。
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
from pathlib import Path

import pymupdf

spec = importlib.util.spec_from_file_location(
    "ehm", Path(__file__).with_name("extract-hall-maps.py")
)
ehm = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(ehm)

HALL_RE, CODE_RE = ehm.HALL_RE, ehm.CODE_RE
LABEL_RE = re.compile(
    r"(通往|出入口|观众|通道|休息区|预告区|形象区|展示区|服务台|"
    r"咨询|洗手间|餐厅|电梯|楼梯|扶梯|饮水|急救|母婴|报名|登记|大会|"
    r"东方美学|爆品|好品|峰会|论坛|发布会|专场|集市|街区|评选|对接会|"
    r"咖啡区|走秀)"
)


def is_code(text: str) -> bool:
    text = text.strip()
    return bool(CODE_RE.match(text) or HALL_RE.match(text))


def join_name(texts: list[str]) -> str:
    if not texts:
        return ""
    if all(len(t) <= 2 for t in texts):
        return "".join(texts)
    return "".join(texts)


def hall_id(region: str, hall: str) -> str:
    return f"hall_{region.lower()}{hall.replace('.', '')}"


def extract_pdf(pdf_path: Path, region: str) -> dict[str, dict[str, str]]:
    doc = pymupdf.open(pdf_path)
    by_hall: dict[str, dict[str, str]] = {}
    for i, page in enumerate(doc):
        page_w, page_h = page.rect.width, page.rect.height
        words = [w for w in page.get_text("words") if w[4].strip()]
        hall_hits = [w[4].strip() for w in words if HALL_RE.match(w[4].strip())]
        hall = hall_hits[0] if hall_hits else f"{region}{i + 1}"
        booths, structs = ehm._collect_shapes(page, page_w, page_h)
        wall_y, widest_stroke = None, 0.0
        for rect, drawing in structs:
            if rect.height >= 3 or rect.width < page_w * 0.4 or rect.y0 > page_h * 0.35:
                continue
            stroke = drawing.get("width") or 0.0
            if stroke > widest_stroke or (
                stroke == widest_stroke and wall_y is not None and rect.y0 > wall_y
            ):
                widest_stroke, wall_y = stroke, rect.y0
        booths.sort(key=lambda t: t[0].y0)
        if wall_y is not None:
            booths = [(r, d) for r, d in booths if r.y1 > wall_y]
        assigned = ehm._assign_codes(
            booths, [w for w in words if CODE_RE.match(w[4].strip())]
        )
        names: dict[str, str] = {}
        for idx, (rect, _) in enumerate(booths):
            code = assigned.get(idx)
            if not code:
                continue
            texts: list[str] = []
            for w in words:
                t = w[4].strip()
                if not t or is_code(t):
                    continue
                cx, cy = (w[0] + w[2]) / 2, (w[1] + w[3]) / 2
                if rect.x0 <= cx <= rect.x1 and rect.y0 <= cy <= rect.y1:
                    texts.append(t)
            name = join_name(texts).strip()
            if not name or LABEL_RE.search(name):
                continue
            if len(name) > 40:
                continue
            names[code] = name
        if names:
            by_hall[hall_id(region, hall)] = names
    doc.close()
    return by_hall


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--a-pdf", required=True)
    parser.add_argument("--b-pdf", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    merged: dict[str, dict[str, str]] = {}
    merged.update(extract_pdf(Path(args.a_pdf), "A"))
    merged.update(extract_pdf(Path(args.b_pdf), "B"))
    Path(args.out).write_text(
        json.dumps(merged, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    named = sum(len(v) for v in merged.values())
    print(f"halls={len(merged)} named_booths={named} -> {args.out}")


if __name__ == "__main__":
    main()
