#!/usr/bin/env python3
"""EduFlow canvas linter — the acceptance gate for the design system.

Checks every .dc.html passed on the command line:

1. type     — outside <style data-ef-system>, font-size must be one of the six
              tokens (var(--fs-12/13/14/16/20/28)).
2. colour   — outside the system block, no literal hex / rgb() / hsl() colours
              (inline SVG data URIs are ignored).
3. radius   — outside the system block, border-radius must be var(--r-*) or 0/50%.
4. shadow   — outside the system block, box-shadow must be var(--sh-1/2/3) or none.
5. scale    — no transform:scale(<1) zoom of a screen/block (button :active .985 is OK).
6. nav      — every <nav class="ef-nav"> must match the standard fragment, or an
              explicitly marked data-nav-role="student" / "teacher" / "guest" variant.
7. links    — no external http(s) asset URLs.

Exit code 0 = clean, 1 = violations, 2 = usage / missing file.
"""

from __future__ import annotations

import re
import sys
from dataclasses import dataclass
from pathlib import Path

SYSTEM_STYLE = re.compile(r"<style\s+data-ef-system\b[^>]*>.*?</style>", re.S | re.I)
GLASS_BLOCK = re.compile(r"<div\s+data-ef-glass\b[^>]*>.*?</div>\s*", re.S | re.I)
STYLE_BLOCK = re.compile(r"<style\b([^>]*)>(.*?)</style>", re.S | re.I)
INLINE_STYLE = re.compile(r"""\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')""", re.S | re.I)
COMMENT = re.compile(r"/\*.*?\*/", re.S)
HTML_COMMENT = re.compile(r"<!--.*?-->", re.S)
DATA_URI = re.compile(r"data:[^\s\"')]+", re.I)

HEX = re.compile(r"#[0-9a-fA-F]{3,8}\b")
RGB = re.compile(r"\b(?:rgb|rgba|hsl|hsla)\s*\(", re.I)
URL_FN = re.compile(r"url\s*\([^)]*\)", re.I)

FONT_SIZE = re.compile(r"font-size\s*:\s*([^;}]+)", re.I)
RADIUS = re.compile(r"border-radius\s*:\s*([^;}]+)", re.I)
SHADOW = re.compile(r"box-shadow\s*:\s*([^;}]+)", re.I)
TRANSFORM = re.compile(r"transform\s*:\s*([^;}]+)", re.I)
SCALE_FN = re.compile(r"scale\(\s*([0-9]*\.?[0-9]+)\s*\)", re.I)
EXTERNAL_URL = re.compile(r"https?://[^\s\"'<>)]+", re.I)

FS_OK = re.compile(r"^var\(--fs-(?:12|13|14|16|20|28)\)$")
R_OK = re.compile(r"^var\(--r-(?:8|12|16|24|full)\)$")
SH_OK = re.compile(r"^var\(--sh-(?:1|2|3)\)$")

NAV_LABELS = {
    None: ["首页", "档案", "作品", "记录", "教学", "管理"],
    "standard": ["首页", "档案", "作品", "记录", "教学", "管理"],
    "student": ["首页", "档案", "作品", "记录"],
    "teacher": ["首页", "档案", "作品", "记录", "教学", "管理"],
    "guest": ["首页", "档案"],
}


@dataclass
class Violation:
    path: Path
    line: int
    rule: str
    message: str

    def render(self) -> str:
        return f"{self.path}:{self.line}: [{self.rule}] {self.message}"


@dataclass
class CssChunk:
    text: str
    line: int          # 1-based line of the chunk start in the source file
    col: int           # 1-based column of the chunk start


def line_col(source: str, offset: int) -> tuple[int, int]:
    line = source.count("\n", 0, offset) + 1
    last = source.rfind("\n", 0, offset)
    col = offset + 1 if last < 0 else offset - last
    return line, col


def clean_css(text: str) -> str:
    text = COMMENT.sub(" ", text)
    text = HTML_COMMENT.sub(" ", text)
    text = DATA_URI.sub(" ", text)
    text = URL_FN.sub(" ", text)
    return text


def css_chunks(source: str) -> list[CssChunk]:
    """Collect board CSS only: <style> blocks (system block removed) + style attrs."""
    stripped = SYSTEM_STYLE.sub(lambda m: "\n" * m.group(0).count("\n"), source)
    stripped = GLASS_BLOCK.sub(lambda m: "\n" * m.group(0).count("\n"), stripped)
    chunks: list[CssChunk] = []

    for m in STYLE_BLOCK.finditer(stripped):
        attrs = m.group(1) or ""
        if re.search(r"data-ef-system", attrs, re.I):
            continue
        body_start = m.start(2)
        line, col = line_col(stripped, body_start)
        chunks.append(CssChunk(clean_css(m.group(2)), line, col))

    for m in INLINE_STYLE.finditer(stripped):
        raw = m.group(1) if m.group(1) is not None else m.group(2)
        start = m.start(1) if m.group(1) is not None else m.start(2)
        line, col = line_col(stripped, start)
        chunks.append(CssChunk(clean_css(raw or ""), line, col))

    return chunks


def offset_line(chunk: CssChunk, pos: int) -> int:
    return chunk.line + chunk.text.count("\n", 0, pos)


def check_typography(chunks: list[CssChunk]) -> list[Violation]:
    out: list[Violation] = []
    for chunk in chunks:
        for m in FONT_SIZE.finditer(chunk.text):
            value = m.group(1).strip().lower()
            value = re.sub(r"\s*!important$", "", value)
            if not FS_OK.match(value):
                out.append(Violation(Path(), offset_line(chunk, m.start()), "type",
                                     f"font-size:{m.group(1).strip()} — 只允许 var(--fs-12/13/14/16/20/28)"))
    return out


def check_colors(chunks: list[CssChunk]) -> list[Violation]:
    out: list[Violation] = []
    for chunk in chunks:
        text = chunk.text
        for rx, label in ((HEX, "hex"), (RGB, "rgb/hsl")):
            for m in rx.finditer(text):
                # Ignore colour-looking text inside custom properties that are
                # explicitly design-token demos? No: board CSS must use vars too.
                snippet = text[max(0, m.start() - 24): m.end() + 16].strip()
                out.append(Violation(Path(), offset_line(chunk, m.start()), "color",
                                     f"{label} 颜色 `{snippet}` — 请使用 token 变量"))
    return out


def check_radius(chunks: list[CssChunk]) -> list[Violation]:
    out: list[Violation] = []
    for chunk in chunks:
        for m in RADIUS.finditer(chunk.text):
            value = re.sub(r"\s*!important$", "", m.group(1).strip().lower())
            parts = [p for p in re.split(r"[\s/]+", value) if p]
            bad = [p for p in parts if not (R_OK.match(p) or p in {"0", "0px", "50%"})]
            if bad:
                out.append(Violation(Path(), offset_line(chunk, m.start()), "radius",
                                     f"border-radius:{m.group(1).strip()} — 只允许 var(--r-8/12/16/24/full) 或 0/50%"))
    return out


def check_shadows(chunks: list[CssChunk]) -> list[Violation]:
    out: list[Violation] = []
    for chunk in chunks:
        for m in SHADOW.finditer(chunk.text):
            value = re.sub(r"\s*!important$", "", m.group(1).strip().lower())
            if value == "none":
                continue
            parts = [p for p in re.split(r"\s*,\s*", value) if p]
            if not all(SH_OK.match(p) for p in parts):
                out.append(Violation(Path(), offset_line(chunk, m.start()), "shadow",
                                     f"box-shadow:{m.group(1).strip()} — 只允许 var(--sh-1/2/3) 或 none"))
    return out


def selector_before(text: str, pos: int) -> str:
    close = text.rfind("}", 0, pos)
    open_ = text.rfind("{", 0, pos)
    if open_ < 0:
        return ""
    start = max(close + 1, 0)
    return text[start:open_].strip()


def check_scale(chunks: list[CssChunk]) -> list[Violation]:
    out: list[Violation] = []
    for chunk in chunks:
        for m in TRANSFORM.finditer(chunk.text):
            value = m.group(1)
            for sm in SCALE_FN.finditer(value):
                try:
                    factor = float(sm.group(1))
                except ValueError:
                    continue
                if factor >= 1:
                    continue
                selector = selector_before(chunk.text, m.start())
                if abs(factor - 0.985) < 1e-9 and ":active" in selector:
                    continue
                out.append(Violation(Path(), offset_line(chunk, m.start()), "scale",
                                     f"transform:scale({sm.group(1)}) < 1（{selector or '未知选择器'}）— 禁止整屏/整块缩放"))
    return out


def strip_tags(fragment: str) -> str:
    fragment = re.sub(r"<[^>]+>", "", fragment)
    fragment = fragment.replace("&nbsp;", " ")
    return re.sub(r"\s+", "", fragment)


def check_nav(source: str) -> list[Violation]:
    out: list[Violation] = []
    for m in re.finditer(r"<nav\b([^>]*)>(.*?)</nav\s*>", source, re.S | re.I):
        attrs, body = m.group(1), m.group(2)
        classes = re.search(r'class\s*=\s*"([^"]*)"', attrs, re.I)
        if not classes or "ef-nav" not in classes.group(1).split():
            continue
        line = source.count("\n", 0, m.start()) + 1

        role_m = re.search(r'data-nav-role\s*=\s*"([^"]*)"', attrs, re.I)
        role = role_m.group(1) if role_m else None
        if role not in NAV_LABELS:
            out.append(Violation(Path(), line, "nav", f"未知 data-nav-role=\"{role}\""))
            continue

        if not re.search(r'aria-label\s*=\s*"[^"]*主导航[^"]*"', attrs):
            out.append(Violation(Path(), line, "nav", "缺少 aria-label=\"主导航\""))

        if "ef-nav-logo" not in body:
            out.append(Violation(Path(), line, "nav", "缺少 .ef-nav-logo"))

        item_re = re.compile(r"<(a|button)\b([^>]*class\s*=\s*\"[^\"]*ef-nav-item[^\"]*\"[^>]*)>(.*?)</\1\s*>", re.S | re.I)
        labels: list[str] = []
        first_item = None
        last_item_end = -1
        for item in item_re.finditer(body):
            label = strip_tags(item.group(3))
            labels.append(label)
            if first_item is None:
                first_item = item.start()
            last_item_end = item.end()

        expected = NAV_LABELS[role]
        if labels != expected:
            out.append(Violation(Path(), line, "nav",
                                 f"导航项 {labels} ≠ 标准片段 {expected}（role={role or 'standard'}）"))

        for required in ("ef-nav-me", "ef-me-avatar"):
            if required not in body:
                out.append(Violation(Path(), line, "nav", f"缺少底部账户入口 `{required}`"))
        account_names = ("王老师",) if role == "teacher" else ("小林",)
        if not any(name in body for name in account_names):
            out.append(Violation(Path(), line, "nav",
                                 f"缺少底部账户入口 `{account_names[0]}`"))

        me_pos = body.find("ef-nav-me")
        if me_pos >= 0 and last_item_end >= 0 and me_pos < last_item_end:
            out.append(Violation(Path(), line, "nav", "账户入口必须在导航项之后（底部）"))

        logo_pos = body.find("ef-nav-logo")
        if logo_pos >= 0 and first_item is not None and logo_pos > first_item:
            out.append(Violation(Path(), line, "nav", "logo 必须在导航项之前"))
    return out


def check_external_urls(source: str) -> list[Violation]:
    out: list[Violation] = []
    stripped = SYSTEM_STYLE.sub(" ", source)
    stripped = GLASS_BLOCK.sub(" ", stripped)
    stripped = DATA_URI.sub(" ", stripped)
    for m in EXTERNAL_URL.finditer(stripped):
        if "www.w3.org" in m.group(0):
            continue
        out.append(Violation(Path(), source.count("\n", 0, m.start()) + 1, "url",
                             f"外部 URL `{m.group(0)}` — 画板只允许内联资源"))
    return out


def lint(path: Path) -> list[Violation]:
    source = path.read_text(encoding="utf-8")
    violations: list[Violation] = []
    if not SYSTEM_STYLE.search(source):
        violations.append(Violation(path, 1, "system", "缺少 <style data-ef-system> 注入块"))
    chunks = css_chunks(source)
    violations += check_typography(chunks)
    violations += check_colors(chunks)
    violations += check_radius(chunks)
    violations += check_shadows(chunks)
    violations += check_scale(chunks)
    violations += check_nav(source)
    violations += check_external_urls(source)
    for v in violations:
        v.path = path
    return violations


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__.strip())
        return 2

    total = 0
    for raw in argv[1:]:
        path = Path(raw)
        if not path.is_absolute():
            path = (Path.cwd() / path).resolve()
        if not path.exists():
            print(f"{raw}: file not found", file=sys.stderr)
            return 2
        violations = lint(path)
        total += len(violations)
        if violations:
            print(f"\n{raw}: {len(violations)} violation(s)")
            for v in violations:
                print("  " + v.render())
        else:
            print(f"{raw}: clean")

    print(f"\n{len(argv) - 1} file(s), {total} violation(s)")
    return 0 if total == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
