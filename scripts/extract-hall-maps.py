#!/usr/bin/env python3
"""从官方参观指南 PDF 转出可高亮的 SVG。

底图用页面矢量。普通展位整格盖白再写回展位号（没编号也盖白，避免店名漏出）。
并格剩角同样整块盖白。彩色活动区、休息/舞台/论坛不盖。走廊标题不盖。高亮格由前端叠店名。

用法
----
    python scripts/extract-hall-maps.py \\
        --a-pdf "A区参观指南图.pdf" \\
        --b-pdf "B区参观指南图.pdf" \\
        --out apps/h5/public/maps
"""

from __future__ import annotations

import argparse
import io
import json
import re
from pathlib import Path

import pymupdf

HALL_RE = re.compile(r"^\d{1,2}\.\d$")
CODE_RE = re.compile(r"^[A-Z]\d{2,3}[A-Z]?(-\d)?$")
STRUCT_LABEL_RE = re.compile(r"(通往|出入口)")
# 休息/舞台/论坛/预告这类功能字要露出来。OCR 失败的展商格不能因为没编号就跳过盖白。
KEEP_LABEL_RE = re.compile(
    r"(休息|预告|告区|舞台|论坛|峰会|后台区|礼品区|活动区|直播间|"
    r"好市|生活节|抖音美播节|指南针|服务台|注册处)"
)

# 展位方框的尺寸范围（PDF pt）。下限要收到 4.2 馆 9.5×6.4 那种扁格，上限甩掉整馆外框。
# 活动横幅与展商格的面积分界。低于此值的彩色格按展商格处理（盖白只留展位号）。
EVENT_BANNER_MIN_AREA = 900

# 判定「格内有转曲店名」的最少笔画数。一个汉字通常十几笔，两个字远超此值；
# 空格子偶尔蹭到的一两笔不会触发。
NAME_STROKE_MIN = 5

BOOTH_MIN_EDGE = 6.0
BOOTH_MAX_W, BOOTH_MAX_H = 260, 260
BOOTH_MIN_AREA = 55
# 大方格里约 8×8 的虚线分割块，不是独立展位。
GRID_MAX_EDGE = 9.5
GRID_MIN_ASPECT = 0.85
# 面积超过整页这个比例的图形是页面底板/外框，不是展位。
PAGE_AREA_LIMIT = 0.55
# 页眉（馆号徽标、标题装饰线）与展位区之间的垂直空隙，用来切掉页眉。
HEADER_GAP = 18
VIEWBOX_PAD = 6
# 遮罩略内缩，让 PDF 原细线露在边缘。店名偶尔探出格外，盖白最多再外扩这么多。
MASK_INSET = 0.25
NAME_BLEED = 3.2


def _fmt(value: float) -> str:
    return f"{value:.1f}".rstrip("0").rstrip(".")


def _code_font_size(rect, code: str) -> float:
    """大格子大号、小格子小号。"""
    return max(
        1.2,
        min(rect.width * 0.9 / max(len(code) * 0.62, 1), rect.height * 0.36, 6.2),
    )


def _native_svg_inner(page) -> str:
    """页面矢量原文，去掉外层 <svg>，坐标仍是 PDF 点阵。"""
    raw = page.get_svg_image()
    start = raw.find(">")
    end = raw.rfind("</svg>")
    if start < 0 or end < 0:
        return ""
    inner = raw[start + 1 : end]
    inner = re.sub(r"\sxmlns:inkscape=\"[^\"]*\"", "", inner)
    inner = re.sub(r"\sinkscape:[A-Za-z0-9_-]+=\"[^\"]*\"", "", inner)
    return inner


def _esc(text: str) -> str:
    """展区名称里有 & 和引号，直接拼进 SVG 会破坏标记。"""
    return (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
    )


def _path_data(items) -> str:
    """把 PyMuPDF 的路径片段转成 SVG path 的 d 属性。"""
    out: list[str] = []
    cursor = None
    for item in items:
        kind = item[0]
        if kind == "l":
            p1, p2 = item[1], item[2]
            if cursor is None or abs(cursor.x - p1.x) > 0.01 or abs(cursor.y - p1.y) > 0.01:
                out.append(f"M{_fmt(p1.x)} {_fmt(p1.y)}")
            out.append(f"L{_fmt(p2.x)} {_fmt(p2.y)}")
            cursor = p2
        elif kind == "c":
            p1, p2, p3, p4 = item[1], item[2], item[3], item[4]
            if cursor is None or abs(cursor.x - p1.x) > 0.01 or abs(cursor.y - p1.y) > 0.01:
                out.append(f"M{_fmt(p1.x)} {_fmt(p1.y)}")
            out.append(
                f"C{_fmt(p2.x)} {_fmt(p2.y)} {_fmt(p3.x)} {_fmt(p3.y)} {_fmt(p4.x)} {_fmt(p4.y)}"
            )
            cursor = p4
        elif kind == "re":
            r = item[1]
            out.append(f"M{_fmt(r.x0)} {_fmt(r.y0)}H{_fmt(r.x1)}V{_fmt(r.y1)}H{_fmt(r.x0)}Z")
            cursor = None
        elif kind == "qu":
            q = item[1]
            out.append(
                f"M{_fmt(q.ul.x)} {_fmt(q.ul.y)}L{_fmt(q.ur.x)} {_fmt(q.ur.y)}"
                f"L{_fmt(q.lr.x)} {_fmt(q.lr.y)}L{_fmt(q.ll.x)} {_fmt(q.ll.y)}Z"
            )
            cursor = None
    return "".join(out)


def _is_chromatic(fill) -> bool:
    """红/绿/紫等活动色，排除黑白灰。"""
    if not fill or len(fill) < 3:
        return False
    r, g, b = fill[0], fill[1], fill[2]
    if max(r, g, b) < 0.25 or min(r, g, b) > 0.9:
        return False
    return (max(r, g, b) - min(r, g, b)) >= 0.15


def _event_fills(page):
    """面积足够大的彩色填色块 = 活动/主题区，遮罩不能盖上去。"""
    boxes = []
    for drawing in page.get_drawings():
        fill = drawing.get("fill")
        if not _is_chromatic(fill):
            continue
        rect = drawing["rect"]
        if rect.width * rect.height < 80:
            continue
        boxes.append(rect)
    return boxes


def _overlap_area(a, b) -> float:
    x0, y0 = max(a.x0, b.x0), max(a.y0, b.y0)
    x1, y1 = min(a.x1, b.x1), min(a.y1, b.y1)
    if x1 <= x0 or y1 <= y0:
        return 0.0
    return (x1 - x0) * (y1 - y0)


def _contains(outer, inner, slack: float = 0.6) -> bool:
    if outer.width * outer.height <= inner.width * inner.height * 1.15:
        return False
    return (
        outer.x0 <= inner.x0 + slack
        and outer.y0 <= inner.y0 + slack
        and outer.x1 + slack >= inner.x1
        and outer.y1 + slack >= inner.y1
    )


def _leaf_booths(booths):
    """只保留最小格子。外框/并格会把分区画成一块白板。"""
    rects = [rect for rect, _ in booths]
    leaves = []
    for i, item in enumerate(booths):
        rect = item[0]
        if any(j != i and _contains(rect, other) for j, other in enumerate(rects)):
            continue
        leaves.append(item)
    return leaves


def _same_rect(a, b, tol: float = 0.6) -> bool:
    return (
        abs(a.x0 - b.x0) <= tol
        and abs(a.y0 - b.y0) <= tol
        and abs(a.x1 - b.x1) <= tol
        and abs(a.y1 - b.y1) <= tol
    )


def _subtract_rect(outer, hole):
    """outer 减去 hole 的相交部分，得到若干轴对齐矩形。整块盖满，不给原字留洞。"""
    x0, y0 = max(outer.x0, hole.x0), max(outer.y0, hole.y0)
    x1, y1 = min(outer.x1, hole.x1), min(outer.y1, hole.y1)
    if x1 <= x0 + 0.3 or y1 <= y0 + 0.3:
        return [outer]
    parts = []
    if y0 - outer.y0 > 0.4:
        parts.append(pymupdf.Rect(outer.x0, outer.y0, outer.x1, y0))
    if outer.y1 - y1 > 0.4:
        parts.append(pymupdf.Rect(outer.x0, y1, outer.x1, outer.y1))
    if x0 - outer.x0 > 0.4:
        parts.append(pymupdf.Rect(outer.x0, y0, x0, y1))
    if outer.x1 - x1 > 0.4:
        parts.append(pymupdf.Rect(x1, y0, outer.x1, y1))
    return parts


def _try_merge(a, b):
    """把同一并格切开的相邻剩角拼回一块，避免 G02A 被拆成上下两格。"""
    if abs(a.x0 - b.x0) <= 0.6 and abs(a.x1 - b.x1) <= 0.6:
        if abs(a.y1 - b.y0) <= 0.8 or abs(b.y1 - a.y0) <= 0.8:
            return pymupdf.Rect(a.x0, min(a.y0, b.y0), a.x1, max(a.y1, b.y1))
    if abs(a.y0 - b.y0) <= 0.6 and abs(a.y1 - b.y1) <= 0.6:
        if abs(a.x1 - b.x0) <= 0.8 or abs(b.x1 - a.x0) <= 0.8:
            return pymupdf.Rect(min(a.x0, b.x0), a.y0, max(a.x1, b.x1), a.y1)
    return None


def _try_merge_vertical(a, b):
    if abs(a.x0 - b.x0) <= 0.6 and abs(a.x1 - b.x1) <= 0.6:
        if abs(a.y1 - b.y0) <= 0.8 or abs(b.y1 - a.y0) <= 0.8:
            return pymupdf.Rect(a.x0, min(a.y0, b.y0), a.x1, max(a.y1, b.y1))
    return None


def _merge_rects_vertical(rects):
    pieces = list(rects)
    changed = True
    while changed:
        changed = False
        for i in range(len(pieces)):
            for j in range(i + 1, len(pieces)):
                merged = _try_merge_vertical(pieces[i], pieces[j])
                if merged is None:
                    continue
                pieces = [merged] + [p for k, p in enumerate(pieces) if k not in (i, j)]
                changed = True
                break
            if changed:
                break
    return pieces


def _merge_rects(rects):
    pieces = list(rects)
    changed = True
    while changed:
        changed = False
        for i in range(len(pieces)):
            for j in range(i + 1, len(pieces)):
                merged = _try_merge(pieces[i], pieces[j])
                if merged is None:
                    continue
                pieces = [merged] + [p for k, p in enumerate(pieces) if k not in (i, j)]
                changed = True
                break
            if changed:
                break
    return pieces


def _dedupe_overlaps(booths):
    """同一位置叠了两块几乎一样的填色，只留一块，避免盖白盖住已经切开的小格。"""
    items = list(booths)
    dropped = set()
    for i, (a, _) in enumerate(items):
        if i in dropped:
            continue
        area_a = a.width * a.height
        for j in range(i + 1, len(items)):
            if j in dropped:
                continue
            b = items[j][0]
            overlap = _overlap_area(a, b)
            if overlap <= 0:
                continue
            area_b = b.width * b.height
            if overlap / min(area_a, area_b) < 0.7:
                continue
            dropped.add(j if area_a >= area_b else i)
            if i in dropped:
                break
    return [item for k, item in enumerate(items) if k not in dropped]


def _touches_exhibitor_name(rect, glyphs, words) -> bool:
    """店名与格子有重叠（不要求中心在格内）。

    店名常骑在两格之间：9.1 馆「一龄呈娇」中心落在右下格，字形却从左下格就开始。
    左下格没编号、也没有哪个词的中心在里面，按「中心判定」会被整格跳过、不盖白，
    结果左半截「一龄」直接露在图上。只要有重叠就得盖。
    """
    for word in words:
        text = word[4].strip()
        if not text or not re.search(r"[一-鿿]", text):
            continue
        if KEEP_LABEL_RE.search(text) or STRUCT_LABEL_RE.search(text):
            continue
        if rect.intersects(pymupdf.Rect(word[0], word[1], word[2], word[3])):
            return True
    # B 区店名是整块的活文字/大字形，一块就够判定。
    touching = 0
    for glyph in glyphs:
        if not rect.intersects(glyph):
            continue
        if glyph.width >= 3.2 and glyph.height >= 3.2:
            return True
        touching += 1
        # A 区的字被转成了轮廓，一个汉字散成十几笔、每笔都远小于 3.2，
        # 按「单笔够大」判会全部漏掉——5.2 馆 J07D「神龙本草」、H07K「美微」、
        # B56「女人传说」就是这样露在图上的。改成看笔画密度。
        if touching >= NAME_STROKE_MIN:
            return True
    return False


def _has_exhibitor_name(rect, glyphs, words) -> bool:
    """格内有店名（活文字或转曲汉字块）。空缺角没有店名，不要盖白。"""
    for word in words:
        text = word[4].strip()
        if not text or not re.search(r"[\u4e00-\u9fff]", text):
            continue
        if KEEP_LABEL_RE.search(text) or STRUCT_LABEL_RE.search(text):
            continue
        cx, cy = (word[0] + word[2]) / 2, (word[1] + word[3]) / 2
        if rect.x0 <= cx <= rect.x1 and rect.y0 <= cy <= rect.y1:
            return True
    for glyph in glyphs:
        if glyph.width < 3.2 or glyph.height < 3.2:
            continue
        cx, cy = (glyph.x0 + glyph.x1) / 2, (glyph.y0 + glyph.y1) / 2
        if rect.x0 <= cx <= rect.x1 and rect.y0 <= cy <= rect.y1:
            return True
    return False


def _is_inner_grid(w: float, h: float) -> bool:
    """H10A/H11A 这类大格里的虚线小方块。"""
    longest = max(w, h)
    shortest = min(w, h)
    return longest <= GRID_MAX_EDGE and shortest / longest >= GRID_MIN_ASPECT


def _plausible_booth(rect) -> bool:
    w, h = rect.width, rect.height
    if min(w, h) < BOOTH_MIN_EDGE or w * h < BOOTH_MIN_AREA:
        return False
    if _is_inner_grid(w, h):
        return False
    if max(w, h) / min(w, h) > 5.5:
        return False
    if w > 80 and h < 30:
        return False
    return True


def _split_along_children(piece, children):
    """并格只有分割线、没有独立填色时，沿子格边切开剩角（F07A/F07K）。"""
    parts = [piece]
    for child in children:
        nxt = []
        for part in parts:
            cut_x = part.x0 + 1.2 < child.x0 < part.x1 - 1.2
            cut_y = part.y0 + 1.2 < child.y0 < part.y1 - 1.2
            if abs(part.y1 - child.y0) <= 0.8 and cut_x:
                nxt.append(pymupdf.Rect(part.x0, part.y0, child.x0, part.y1))
                nxt.append(pymupdf.Rect(child.x0, part.y0, part.x1, part.y1))
            elif abs(part.x1 - child.x0) <= 0.8 and cut_y:
                nxt.append(pymupdf.Rect(part.x0, part.y0, part.x1, child.y0))
                nxt.append(pymupdf.Rect(part.x0, child.y0, part.x1, part.y1))
            elif abs(part.y0 - child.y1) <= 0.8 and cut_x:
                nxt.append(pymupdf.Rect(part.x0, part.y0, child.x0, part.y1))
                nxt.append(pymupdf.Rect(child.x0, part.y0, part.x1, part.y1))
            elif abs(part.x0 - child.x1) <= 0.8 and cut_y:
                nxt.append(pymupdf.Rect(part.x0, part.y0, part.x1, child.y0))
                nxt.append(pymupdf.Rect(part.x0, child.y0, part.x1, part.y1))
            else:
                nxt.append(part)
        parts = nxt
    return parts


def _remainders(parent, children):
    pieces = [parent]
    for child in children:
        nxt = []
        for piece in pieces:
            nxt.extend(_subtract_rect(piece, child))
        pieces = nxt
    pieces = _merge_rects(pieces)
    split = []
    for piece in pieces:
        split.extend(_split_along_children(piece, children))
    # 只竖向合并（F07A 上下两块），不要把刚切开的 F07K 又拼回去。
    return [piece for piece in _merge_rects_vertical(split) if _plausible_booth(piece)]


def _split_remainders(all_booths, leaves):
    """并格大框被叶子滤掉后，剩下的那一角仍有店名，补成独立格再整格盖白。

    和失败的 L 形留白不同：剩角整块盖白并写回编号，不在原编号处挖洞。
    """
    rects = [rect for rect, _ in all_booths]
    leaf_rects = [rect for rect, _ in leaves]
    extra = []
    for i, (rect, drawing) in enumerate(all_booths):
        children = [other for j, other in enumerate(rects) if j != i and _contains(rect, other)]
        if not children or len(children) > 8:
            continue
        for rem in _remainders(rect, children):
            if any(_same_rect(rem, leaf) for leaf in leaf_rects):
                continue
            if any(_same_rect(rem, existing) for existing, _ in extra):
                continue
            extra.append((rem, drawing))
    return extra


def _is_legend_frame(rect, drawing, page_h: float) -> bool:
    """页脚/页眉里那条扁框是图例和方位（南S），不是展位。"""
    if drawing.get("type") != "s":
        return False
    w, h = rect.width, rect.height
    if h < 8 or h > 36 or w < 40:
        return False
    return rect.y1 > page_h * 0.86 or rect.y0 < page_h * 0.18


def _inside_legend(rect, frames) -> bool:
    return any(_overlap_area(rect, frame) > rect.width * rect.height * 0.45 for frame in frames)


def _collect_shapes(page, page_w: float, page_h: float):
    """把页面图形分成「展位方框」和「结构线」，并丢掉被转曲的文字笔画。"""
    booths, structs, seen = [], [], set()
    for drawing in page.get_drawings():
        rect = drawing["rect"]
        w, h = rect.width, rect.height
        if min(w, h) < 2.5:
            continue  # 线
        if w < 6.5 and h < 6.5:
            continue  # 单个字形
        if w * h >= page_w * page_h * PAGE_AREA_LIMIT:
            continue  # 页面底板
        key = (
            round(rect.x0, 1),
            round(rect.y0, 1),
            round(rect.x1, 1),
            round(rect.y1, 1),
            drawing["type"],
        )
        if key in seen:
            continue
        seen.add(key)
        if _is_legend_frame(rect, drawing, page_h):
            structs.append((rect, drawing))
            continue
        is_booth = (
            BOOTH_MIN_EDGE <= w <= BOOTH_MAX_W
            and BOOTH_MIN_EDGE <= h <= BOOTH_MAX_H
            and w * h >= BOOTH_MIN_AREA
            and not _is_inner_grid(w, h)
        )
        (booths if is_booth else structs).append((rect, drawing))
    legend_frames = [rect for rect, drawing in structs if _is_legend_frame(rect, drawing, page_h)]
    if legend_frames:
        booths = [(rect, drawing) for rect, drawing in booths if not _inside_legend(rect, legend_frames)]
    return booths, structs


def _name_glyph_rects(page):
    """A 区店名是转曲小黑块。格边外探出的那一两笔也要盖住。"""
    glyphs = []
    for drawing in page.get_drawings():
        rect = drawing["rect"]
        if rect.width < 1.2 or rect.height < 1.2:
            continue
        if rect.width > 8 or rect.height > 8:
            continue
        fill = drawing.get("fill")
        if not fill or max(fill[0], fill[1], fill[2]) > 0.4:
            continue
        glyphs.append(rect)
    return glyphs


def _expand_to_span(x0, y0, x1, y1, rect, span):
    if span.x0 < x0 and rect.x0 - span.x0 <= NAME_BLEED:
        x0 = span.x0
    if span.y0 < y0 and rect.y0 - span.y0 <= NAME_BLEED:
        y0 = span.y0
    if span.x1 > x1 and span.x1 - rect.x1 <= NAME_BLEED:
        x1 = span.x1
    if span.y1 > y1 and span.y1 - rect.y1 <= NAME_BLEED:
        y1 = span.y1
    return x0, y0, x1, y1


def _cover_box(rect, words, glyphs=(), others=()):
    """盖白矩形：略内缩露细线；格边外一点点的店名也一并盖住。"""
    x0 = rect.x0 + MASK_INSET
    y0 = rect.y0 + MASK_INSET
    x1 = rect.x1 - MASK_INSET
    y1 = rect.y1 - MASK_INSET
    for word in words:
        text = word[4].strip()
        if not text or CODE_RE.match(text) or KEEP_LABEL_RE.search(text):
            continue
        if STRUCT_LABEL_RE.search(text) or HALL_RE.match(text):
            continue
        span = pymupdf.Rect(word[0], word[1], word[2], word[3])
        cx, cy = (span.x0 + span.x1) / 2, (span.y0 + span.y1) / 2
        inside = rect.x0 <= cx <= rect.x1 and rect.y0 <= cy <= rect.y1
        near = (
            rect.x0 - NAME_BLEED <= cx <= rect.x1 + NAME_BLEED
            and rect.y0 - NAME_BLEED <= cy <= rect.y1 + NAME_BLEED
        )
        if not inside and not near:
            continue
        x0, y0, x1, y1 = _expand_to_span(x0, y0, x1, y1, rect, span)
    for glyph in glyphs:
        cx, cy = (glyph.x0 + glyph.x1) / 2, (glyph.y0 + glyph.y1) / 2
        if any(other.x0 <= cx <= other.x1 and other.y0 <= cy <= other.y1 for other in others):
            continue
        in_x = rect.x0 - 1.0 <= cx <= rect.x1 + 1.0
        in_y = rect.y0 - NAME_BLEED <= cy <= rect.y1 + NAME_BLEED
        if not (in_x and in_y):
            continue
        x0, y0, x1, y1 = _expand_to_span(x0, y0, x1, y1, rect, glyph)
    for other in others:
        if _overlap_area(pymupdf.Rect(x0, y0, x1, y1), other) <= 2:
            continue
        if other.y1 <= rect.y0 + 2:
            y0 = max(y0, other.y1)
        elif other.y0 >= rect.y1 - 2:
            y1 = min(y1, other.y0)
        elif other.x1 <= rect.x0 + 2:
            x0 = max(x0, other.x1)
        elif other.x0 >= rect.x1 - 2:
            x1 = min(x1, other.x0)
    return x0, y0, max(x1 - x0, 0.6), max(y1 - y0, 0.6)


def _booth_keep_label(rect, words) -> bool:
    """格内是休息/舞台/论坛等功能字，不要盖白。"""
    for word in words:
        text = word[4].strip()
        if not text or not KEEP_LABEL_RE.search(text):
            continue
        span = pymupdf.Rect(word[0], word[1], word[2], word[3])
        if _overlap_area(rect, span) > 6:
            return True
        cx, cy = (word[0] + word[2]) / 2, (word[1] + word[3]) / 2
        if rect.x0 <= cx <= rect.x1 and rect.y0 <= cy <= rect.y1:
            return True
    return False


def _assign_codes(booths, code_words):
    """把展位编号文字落到包含它的最小方框上。

    同一个编号在源图上可能出现两次（例如跨区标注），此时只认第一个方框，
    否则会生成重复的 SVG id，高亮就会定位到错误的展位。
    """
    assigned, used_rects, used_codes = {}, set(), set()
    for word in code_words:
        code = word[4].strip()
        if code in used_codes:
            continue
        cx, cy = (word[0] + word[2]) / 2, (word[1] + word[3]) / 2
        best, best_area = None, float("inf")
        for idx, (rect, _) in enumerate(booths):
            if idx in used_rects:
                continue
            if rect.x0 <= cx <= rect.x1 and rect.y0 <= cy <= rect.y1:
                area = rect.width * rect.height
                if area < best_area:
                    best_area, best = area, idx
        if best is not None:
            assigned[best] = code
            used_rects.add(best)
            used_codes.add(code)
    return assigned


def _has_corner_code(rect, glyphs, words) -> bool:
    """左上角有展位号：活文字，或转曲编号那种细短黑块。"""
    band_h = min(max(rect.height * 0.5, 3.6), 6.0)
    band_w = min(max(rect.width * 0.9, 5.0), rect.width)
    for word in words:
        text = word[4].strip()
        if not CODE_RE.match(text):
            continue
        cx, cy = (word[0] + word[2]) / 2, (word[1] + word[3]) / 2
        if rect.x0 <= cx <= rect.x0 + band_w and rect.y0 <= cy <= rect.y0 + band_h:
            return True
    hits = 0
    for glyph in glyphs:
        if not (1.0 <= glyph.width <= 3.6 and 1.8 <= glyph.height <= 4.0):
            continue
        cx, cy = (glyph.x0 + glyph.x1) / 2, (glyph.y0 + glyph.y1) / 2
        if rect.x0 - 0.5 <= cx <= rect.x0 + band_w and rect.y0 - 0.5 <= cy <= rect.y0 + band_h:
            hits += 1
            if hits >= 2:
                return True
    return False


# A 区靠字形聚类找编号位置；开启前必须先按新几何重跑 OCR，否则新格子没有编号。
_ALLOW_GLYPH_ANCHORS = False


# 补名字号的上下界。官方图上的店名是 2.3~6.1，而补的是法人全名、字数多得多，
# 只能更小；低于下界就看不清了，宁可截断也不再缩。
EXTRA_NAME_MAX_SIZE = 3.0
EXTRA_NAME_MIN_SIZE = 1.4


def _fit_name_lines(names, width, height):
    """把公司名折行塞进格子，返回 (字号, 行列表)；实在放不下就截断。

    官方图给的是两三个字的商号，这里拿到的是十几个字的法人全名，只能靠缩字号
    加折行。从上界逐档往下试，取放得下的最大字号。
    """
    usable_w = width * 0.9
    usable_h = max(height, 0.1)
    size = EXTRA_NAME_MAX_SIZE
    while size >= EXTRA_NAME_MIN_SIZE:
        per_line = int(usable_w / size)
        if per_line >= 2:
            lines = []
            for name in names:
                lines.extend(name[i : i + per_line] for i in range(0, len(name), per_line))
            if len(lines) * size * 1.15 <= usable_h:
                return size, lines
        size -= 0.2
    # 最小字号仍放不下：按行数上限截断并加省略号，不让文字溢出格子压到邻居。
    size = EXTRA_NAME_MIN_SIZE
    per_line = max(int(usable_w / size), 2)
    max_lines = max(int(usable_h / (size * 1.15)), 1)
    lines = []
    for name in names:
        lines.extend(name[i : i + per_line] for i in range(0, len(name), per_line))
    if len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = lines[-1][: max(per_line - 1, 1)] + "…"
    return size, lines


def _code_anchor_xs(rect, glyphs, words):
    """并格里每个编号的左边缘 x。

    展位号一律印在各自格子的左上角，所以顶部编号带里出现几个编号、就说明这块填色
    其实并了几格；后一个编号的左边缘就是分隔线的位置。B 区编号是活文字，A 区被转成
    了矢量轮廓，只能按小字块的 x 聚类还原。
    """
    band_h = min(max(rect.height * 0.5, 3.6), 6.0)
    y0, y1 = rect.y0 - 0.5, rect.y0 + band_h
    xs = [
        word[0]
        for word in words
        if CODE_RE.match(word[4].strip())
        and y0 <= (word[1] + word[3]) / 2 <= y1
        and rect.x0 - 0.5 <= word[0] <= rect.x1
    ]
    if xs:
        return sorted(xs)

    # A 区编号是矢量轮廓，只能按小字块聚类。但拆出来的新格子拿不到编号——
    # ocr-hall-codes.py 的产物以「矩形原点坐标」为键，新原点不在表里，结果会是
    # 图上多一个没编号的空白格，比并在一起更糟。所以 A 区先不拆，等 OCR 能按新
    # 几何重跑之后再放开（重跑一次即可）。
    if not _ALLOW_GLYPH_ANCHORS:
        return []

    hits = sorted(
        glyph.x0
        for glyph in glyphs
        if 1.0 <= glyph.width <= 3.6
        and 1.8 <= glyph.height <= 4.0
        and y0 <= (glyph.y0 + glyph.y1) / 2 <= y1
        and rect.x0 - 0.5 <= glyph.x0 <= rect.x1
    )
    clusters = []
    for x in hits:
        if clusters and x - clusters[-1][-1] <= 2.2:
            clusters[-1].append(x)
        else:
            clusters.append([x])
    # 单个字块多半是噪点；一个编号至少 3 个字符。
    return [c[0] for c in clusters if len(c) >= 2]


def _code_anchor_ys(rect, words):
    """并格里每一「行」编号的中心 y。

    纵向并格（10.3 馆 A09/A10）在格内上下各印一个编号。这里只用活文字：
    A 区编号是轮廓，按字形聚类分不出行，宁可不切也不要切错。
    """
    ys = sorted(
        (word[1] + word[3]) / 2
        for word in words
        if CODE_RE.match(word[4].strip())
        and rect.x0 <= (word[0] + word[2]) / 2 <= rect.x1
        and rect.y0 <= (word[1] + word[3]) / 2 <= rect.y1
    )
    rows = []
    for y in ys:
        if rows and y - rows[-1][-1] <= 2.5:
            rows[-1].append(y)
        else:
            rows.append([y])
    return [sum(r) / len(r) for r in rows]


def _split_at_code_rows(rect, words):
    """按编号行切开纵向并格，切点取相邻两行的中点。

    横向那边用「后一个编号的左边缘」，因为编号统一印在格子左上角；纵向没有这个
    对齐关系（10.3 馆 A09 在上缘、A10 在下缘），取中点更稳。
    """
    ys = _code_anchor_ys(rect, words)
    if len(ys) < 2:
        return None
    bounds = [rect.y0]
    for prev, cur in zip(ys, ys[1:]):
        cut = (prev + cur) / 2
        if cut - bounds[-1] >= BOOTH_MIN_EDGE and rect.y1 - cut >= BOOTH_MIN_EDGE:
            bounds.append(cut)
    if len(bounds) < 2:
        return None
    bounds.append(rect.y1)
    parts = [
        pymupdf.Rect(rect.x0, bounds[i], rect.x1, bounds[i + 1])
        for i in range(len(bounds) - 1)
    ]
    return parts if all(_plausible_booth(part) for part in parts) else None


def _split_at_code_anchors(rect, glyphs, words):
    """按编号位置切开并格，切点取后一个编号的左边缘。

    比对半切更准：G01J/G01A 实际是 23.5 : 35.5，对半切两边都会错位。
    """
    xs = _code_anchor_xs(rect, glyphs, words)
    if len(xs) < 2:
        return None
    bounds = [rect.x0]
    for x in xs[1:]:
        cut = x - 0.6
        if cut - bounds[-1] >= BOOTH_MIN_EDGE and rect.x1 - cut >= BOOTH_MIN_EDGE:
            bounds.append(cut)
    if len(bounds) < 2:
        return None
    bounds.append(rect.x1)
    parts = [
        pymupdf.Rect(bounds[i], rect.y0, bounds[i + 1], rect.y1)
        for i in range(len(bounds) - 1)
    ]
    return parts if all(_plausible_booth(part) for part in parts) else None


def _split_fused_pairs(booths, glyphs, words):
    """两格共用一个 2:1 填色（4.2 馆 F06A/F06D）：左右或上下各有编号就切开。

    真正的通栏大格（F21A、F01A）只有一角有编号，不会切开。
    """
    out = []
    for rect, drawing in booths:
        w, h = rect.width, rect.height
        # 先按编号位置切：不要求 2:1，也不假设等分，能覆盖 G01J/G01A 这种 23.5:35.5。
        parts = _split_at_code_anchors(rect, glyphs, words)
        if parts and len(parts) >= 2:
            out.extend((part, drawing) for part in parts)
            continue
        parts = _split_at_code_rows(rect, words)
        if parts and len(parts) >= 2:
            out.extend((part, drawing) for part in parts)
            continue
        parts = None
        if h >= 6 and abs(w - 2 * h) <= 3.2:
            mid = rect.x0 + w / 2
            left = pymupdf.Rect(rect.x0, rect.y0, mid, rect.y1)
            right = pymupdf.Rect(mid, rect.y0, rect.x1, rect.y1)
            if _has_corner_code(left, glyphs, words) and _has_corner_code(right, glyphs, words):
                parts = [left, right]
        elif w >= 6 and abs(h - 2 * w) <= 3.2:
            mid = rect.y0 + h / 2
            top = pymupdf.Rect(rect.x0, rect.y0, rect.x1, mid)
            bot = pymupdf.Rect(rect.x0, mid, rect.x1, rect.y1)
            if _has_corner_code(top, glyphs, words) and _has_corner_code(bot, glyphs, words):
                parts = [top, bot]
        if parts:
            out.extend((part, drawing) for part in parts if _plausible_booth(part))
        else:
            out.append((rect, drawing))
    return out


def _split_stacked_twins(booths):
    """G09F/G09H 这种两格共用一个竖长填色：宽≥10 且高≈2倍宽、旁边还有同样的一列，就对半切开。"""
    items = list(booths)
    consumed = set()
    out = []
    for i, (rect, drawing) in enumerate(items):
        if i in consumed:
            continue
        w, h = rect.width, rect.height
        if w < 10 or abs(h - 2 * w) > 2.8:
            out.append((rect, drawing))
            continue
        twin = None
        for j, (other, _) in enumerate(items):
            if i == j or j in consumed:
                continue
            if abs(other.width - w) > 1.2 or abs(other.height - h) > 1.2:
                continue
            same_row = abs(other.y0 - rect.y0) <= 1.2
            adjacent = abs(other.x0 - rect.x1) <= 1.5 or abs(other.x1 - rect.x0) <= 1.5
            if same_row and adjacent:
                twin = j
                break
        if twin is None:
            out.append((rect, drawing))
            continue
        mid = rect.y0 + h / 2
        out.append((pymupdf.Rect(rect.x0, rect.y0, rect.x1, mid), drawing))
        out.append((pymupdf.Rect(rect.x0, mid, rect.x1, rect.y1), drawing))
        other, other_d = items[twin]
        omid = other.y0 + other.height / 2
        out.append((pymupdf.Rect(other.x0, other.y0, other.x1, omid), other_d))
        out.append((pymupdf.Rect(other.x0, omid, other.x1, other.y1), other_d))
        consumed.add(i)
        consumed.add(twin)
    return out


def _cjk_near(rect, glyphs, y_from, y_to) -> bool:
    for glyph in glyphs:
        if glyph.width < 3.2 or glyph.height < 3.2:
            continue
        cx, cy = (glyph.x0 + glyph.x1) / 2, (glyph.y0 + glyph.y1) / 2
        if rect.x0 <= cx <= rect.x1 and y_from <= cy <= y_to:
            return True
    return False


def _absorb_uncoded(cells, glyphs):
    """假切开的下半格（3.2 馆 F07D 宏豪）并回有编号的上半格。

    下格没编号、且汉字贴着公共边、上格底部也有汉字 = 同一个店名被切成两半。
    F07F 洛爵丝贴边上格却没有汉字，不会并进 F07E。
    """
    changed = True
    while changed:
        changed = False
        for i, (ra, ca, oa) in enumerate(cells):
            if ca:
                continue
            for j, (rb, cb, from_ocr) in enumerate(cells):
                if i == j or not cb:
                    continue
                if abs(ra.x0 - rb.x0) > 0.8 or abs(ra.x1 - rb.x1) > 0.8:
                    continue
                if abs(ra.y0 - rb.y1) > 0.8:
                    continue
                # ra 在 rb 正下方。两边都贴着公共边有汉字，才是同一个店名被切开。
                # 空缺角没有汉字，不要并进 F07D。
                if not _cjk_near(ra, glyphs, ra.y0, ra.y0 + 6.5):
                    continue
                if not _cjk_near(rb, glyphs, rb.y1 - 6.5, rb.y1 + 1.5):
                    continue
                cells[j] = [
                    pymupdf.Rect(rb.x0, rb.y0, rb.x1, max(rb.y1, ra.y1)),
                    cb,
                    from_ocr,
                ]
                cells.pop(i)
                changed = True
                break
            if changed:
                break
    return cells


def page_booths(page):
    """出图和 OCR 共用同一套展位列表，避免窄格被盖白却没编号。"""
    page_w, page_h = page.rect.width, page.rect.height
    booths, structs = _collect_shapes(page, page_w, page_h)

    # 切掉页眉（馆号徽标与标题装饰线），保留展位区。
    wall_y, widest_stroke = None, 0.0
    for rect, drawing in structs:
        if rect.height >= 3 or rect.width < page_w * 0.4 or rect.y0 > page_h * 0.35:
            continue
        stroke = drawing.get("width") or 0.0
        if stroke > widest_stroke or (stroke == widest_stroke and wall_y is not None and rect.y0 > wall_y):
            widest_stroke, wall_y = stroke, rect.y0

    booths.sort(key=lambda t: t[0].y0)
    if wall_y is not None:
        booths = [(r, d) for r, d in booths if r.y1 > wall_y]
    else:
        # 只切第一段页眉空隙。再往下扫会把走廊空隙当成页眉，
        # 9.2 塑围美、13.2 菲洛嘉/百肤谜 那一整排就会从展位列表里消失。
        cut = 0
        limit = min(len(booths) - 1, max(3, int(len(booths) * 0.2)))
        for j in range(limit):
            if booths[j + 1][0].y0 - booths[j][0].y1 > HEADER_GAP:
                cut = j + 1
                break
        booths = booths[cut:]
    if not booths:
        return [], structs, wall_y
    leaves = _leaf_booths(booths)
    if not leaves:
        return [], structs, wall_y
    combined = _dedupe_overlaps(leaves + _split_remainders(booths, leaves))
    glyphs = _name_glyph_rects(page)
    words = page.get_text("words")
    return _split_fused_pairs(_split_stacked_twins(combined), glyphs, words), structs, wall_y


def extract_page(page, region: str, fallback_name: str, ocr_codes: dict | None = None,
                 extra_names: dict | None = None):
    page_w, page_h = page.rect.width, page.rect.height
    words = page.get_text("words")

    halls = [w[4].strip() for w in words if HALL_RE.match(w[4].strip())]
    hall = halls[0] if halls else fallback_name
    slug = region.lower() + hall.replace(".", "")

    booths, structs, wall_y = page_booths(page)
    if not booths:
        return None

    event_boxes = _event_fills(page)

    top = min(rect.y0 for rect, _ in booths) - 6
    if wall_y is not None:
        top = min(top, wall_y - 2)
    structs = [(rect, d) for rect, d in structs if rect.y1 > top]

    extra_booth_names = (extra_names or {}).get(slug, {})

    code_words = [w for w in words if CODE_RE.match(w[4].strip())]
    assigned = _assign_codes(booths, code_words)

    # A 区的编号被转成了矢量轮廓、读不到文字，用 ocr-hall-codes.py 的产物补缺。
    # 只补活文字没覆盖到的展位，活文字永远优先（它是 100% 准确的）。
    ocr_assigned: dict[int, str] = {}
    if ocr_codes:
        hall_ocr = ocr_codes.get(slug, {})
        taken = set(assigned.values())
        parsed_ocr: list[tuple[float, float, str]] = []
        for key, value in hall_ocr.items():
            try:
                xs, ys = key.split(",")
                parsed_ocr.append((float(xs), float(ys), value))
            except ValueError:
                continue
        for idx, (rect, _) in enumerate(booths):
            if idx in assigned:
                continue
            code = hall_ocr.get(f"{rect.x0:.1f},{rect.y0:.1f}")
            if not code:
                for px, py, value in parsed_ocr:
                    if abs(rect.x0 - px) <= 1.2 and abs(rect.y0 - py) <= 1.2:
                        code = value
                        break
            if code and code not in taken:
                ocr_assigned[idx] = code
                taken.add(code)

    glyphs = _name_glyph_rects(page)
    cells = []
    for idx, (rect, _) in enumerate(booths):
        code = assigned.get(idx) or ocr_assigned.get(idx)
        from_ocr = idx in ocr_assigned and idx not in assigned
        cells.append([rect, code, from_ocr])
    cells = _absorb_uncoded(cells, glyphs)

    # 文字分三类渲染，各自保留源文件的字号：
    #   header  = 展位区上方的馆号与展区名称（观众靠它确认走进了哪个馆）
    #   struct  = 通往X馆 / 观众出入口
    # 展商名不渲染（手机宽度下看不清且会盖住图形），展位号另行居中绘制。
    header_spans, struct_spans = [], []
    for block in page.get_text("dict")["blocks"]:
        for line in block.get("lines", []):
            for span in line.get("spans", []):
                text = span["text"].strip()
                if not text:
                    continue
                sx0, _sy0, sx1, sy1 = span["bbox"]
                entry = (text, sx0, sx1, sy1, span["size"])
                if sy1 <= top:
                    header_spans.append(entry)
                elif STRUCT_LABEL_RE.search(text):
                    struct_spans.append(entry)

    # 源文件里页眉与展位区之间隔着一条被裁掉的装饰条，照搬坐标会留一大片空白。
    # 把整个页眉下移到贴着地图上沿。
    if header_spans:
        header_bottom = max(sy1 for _t, _a, _b, sy1, _s in header_spans)
        gap = top - header_bottom
        if gap > 24:
            shift = gap - 16
            header_spans = [
                (t, a, b, sy1 + shift, s) for t, a, b, sy1, s in header_spans
            ]

    xs, ys = [], []
    for rect, _ in booths + structs:
        xs += [rect.x0, rect.x1]
        ys += [rect.y0, rect.y1]
    for text, sx0, sx1, sy1, size in header_spans + struct_spans:
        xs += [sx0, sx1]
        ys += [sy1 - size, sy1]
    x0, y0 = min(xs) - VIEWBOX_PAD, min(ys) - VIEWBOX_PAD
    x1, y1 = max(xs) + VIEWBOX_PAD, max(ys) + VIEWBOX_PAD

    booth_rects = [rect for rect, _code, _ocr in cells]

    native = _native_svg_inner(page)
    svg = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{_fmt(x0)} {_fmt(y0)} '
        f'{_fmt(x1 - x0)} {_fmt(y1 - y0)}" data-hall="{hall}" data-region="{region}" role="img">',
        f"<title>{hall}馆平面图</title>",
        '<g class="map-source">',
        native,
        "</g>",
        '<g class="map-booths" fill="#ffffff" stroke="none" stroke-width="0.9">',
    ]
    for rect, code, from_ocr in cells:
        is_event = any(_overlap_area(rect, event) > 60 for event in event_boxes)
        keep_open = _booth_keep_label(rect, words)
        # 露原字的只有两类：功能标注（休息/舞台/论坛/服务台）和活动横幅。
        # 它们不是展商，原图内容就是要给观众看的。
        #
        # 「落在彩色区里」不能直接当豁免条件：特色趋势展区的底色盖住了一排普通
        # 展商格，5.2 馆 H08A「佳芙」、H08B「佳美」就这样把别家展商名暴露在非
        # 高亮格上，观众照着走会走错（业务方 2026-09-01 指出）。
        #
        # 用面积区分：活动横幅是整块的，展商格是单位格。实测两者相差 5 倍以上
        # ——最大的展商格 H08A 18×12=216，最小的活动块 F05 23×51=1173。
        if keep_open or (is_event and rect.width * rect.height >= EVENT_BANNER_MIN_AREA):
            if not code:
                continue
            extra = ' data-source="ocr"' if from_ocr else ""
            svg.append(
                f'<g class="booth-cell booth-event" id="shape_{slug}_{code}" '
                f'data-code="{code}"{extra}>'
            )
            svg.append(
                f'<rect class="booth" x="{_fmt(rect.x0)}" y="{_fmt(rect.y0)}" '
                f'width="{_fmt(rect.width)}" height="{_fmt(rect.height)}" fill="none"/>'
            )
            svg.append("</g>")
            continue
        if not code and not _touches_exhibitor_name(rect, glyphs, words):
            continue
        extra = ' data-source="ocr"' if from_ocr else ""
        id_attr = f' id="shape_{slug}_{code}" data-code="{code}"' if code else ""
        svg.append(f'<g class="booth-cell"{id_attr}{extra}>')
        others = [other for other in booth_rects if not _same_rect(other, rect)]
        mx, my, mw, mh = _cover_box(rect, words, glyphs, others)
        svg.append(
            f'<rect class="booth" x="{_fmt(mx)}" y="{_fmt(my)}" '
            f'width="{_fmt(mw)}" height="{_fmt(mh)}"/>'
        )
        if code:
            size = _code_font_size(rect, code)
            svg.append(
                f'<text class="booth-code" x="{_fmt(mx + 0.55)}" '
                f'y="{_fmt(my + size * 0.92)}" font-size="{size:.2f}">'
                f"{_esc(code)}</text>"
            )
            # 官方图印制后才定下的展商，图上这格是空白的，按数据补名。
            # 排在展位号下方，字号按剩余空间算——补的是法人全名，比官方那种
            # 两三个字的商号长得多，只能更小。
            # 表里每条是 {display, full}：图上画短名，全名留作对照。
            extra_names_here = [
                item["display"] if isinstance(item, dict) else item
                for item in extra_booth_names.get(code, [])
            ]
            if extra_names_here:
                top = my + size * 1.45
                name_size, name_lines = _fit_name_lines(
                    extra_names_here, mw, my + mh - top - 0.3
                )
                for row, line in enumerate(name_lines):
                    baseline = top + (row + 1) * name_size * 1.15
                    svg.append(
                        f'<text class="booth-extra-name" x="{_fmt(mx + 0.55)}" '
                        f'y="{_fmt(baseline)}" font-size="{name_size:.2f}">'
                        f"{_esc(line)}</text>"
                    )
        svg.append("</g>")
    svg.append("</g></svg>")

    return {
        "region": region,
        "hall": hall,
        "slug": slug,
        "file": f"hall-{slug}.svg",
        "booths": len(booths),
        "withCode": len(assigned) + len(ocr_assigned),
        "fromText": len(assigned),
        "fromOcr": len(ocr_assigned),
        "codes": sorted(list(assigned.values()) + list(ocr_assigned.values())),
        "ocrCodes": sorted(ocr_assigned.values()),
        "svg": "\n".join(svg),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--a-pdf", required=True, help="A 区参观指南图 PDF")
    parser.add_argument("--b-pdf", required=True, help="B 区参观指南图 PDF")
    parser.add_argument("--out", required=True, help="SVG 输出目录")
    parser.add_argument("--summary", help="可选：把提取统计写成 JSON")
    parser.add_argument(
        "--extra-names",
        help="可选：官方图印制后新增展商的补名表（booth-names-extra.json）",
    )
    parser.add_argument(
        "--ocr-codes",
        help="可选：ocr-hall-codes.py 产出的 JSON，用来补 A 区读不到的展位编号",
    )
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    ocr_codes = None
    if args.ocr_codes:
        ocr_codes = json.loads(Path(args.ocr_codes).read_text(encoding="utf-8"))

    extra_names = None
    if args.extra_names:
        extra_names = json.loads(Path(args.extra_names).read_text(encoding="utf-8"))

    summary = []
    for pdf_path, region in [(args.a_pdf, "A"), (args.b_pdf, "B")]:
        doc = pymupdf.open(pdf_path)
        for index in range(len(doc)):
            result = extract_page(
                doc[index], region, f"{region}{index + 1}", ocr_codes, extra_names
            )
            if not result:
                print(f"跳过 {region} 区第 {index + 1} 页：没有识别到展位")
                continue
            svg = result.pop("svg")
            (out_dir / result["file"]).write_text(svg, encoding="utf-8")
            summary.append(result)
        doc.close()

    if args.summary:
        Path(args.summary).write_text(
            json.dumps(summary, ensure_ascii=False, indent=1), encoding="utf-8"
        )

    total_booths = sum(r["booths"] for r in summary)
    total_codes = sum(r["withCode"] for r in summary)
    total_ocr = sum(r["fromOcr"] for r in summary)
    for r in summary:
        print(
            f"{r['region']} {r['hall']:>5}  展位={r['booths']:4d}  可定位={r['withCode']:4d}"
            f"  (文字={r['fromText']:4d} OCR={r['fromOcr']:4d})"
        )
    print(
        f"合计 {len(summary)} 个馆，展位 {total_booths}，可定位 {total_codes}"
        f"（其中 OCR 补出 {total_ocr}）"
    )


if __name__ == "__main__":
    main()
