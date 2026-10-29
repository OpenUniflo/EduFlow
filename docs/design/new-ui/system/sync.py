#!/usr/bin/env python3
"""EduFlow design-system synchroniser.

Injects the single source of truth (ef-system/tokens.css + glass-defs.html)
into one or more .dc.html canvases.

- tokens go into  <style data-ef-system>…</style>
  (created before the first <style> inside <helmet> when missing)
- lens SVG defs go into  <div data-ef-glass>…</div>
  (created right after </helmet> when missing)

The operation is idempotent: an existing generated block is replaced in
place, and running the command twice produces byte-identical files.

Usage:
    python3 ef-system/sync.py eduflow-canvas/project/C01-Foundations.dc.html …
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
TOKENS_PATH = HERE / "tokens.css"
GLASS_PATH = HERE / "glass-defs.html"

STYLE_BLOCK = re.compile(r"<style\s+data-ef-system\b[^>]*>.*?</style>", re.S | re.I)
STYLE_OPEN = re.compile(r"<style\b", re.I)
GLASS_BLOCK = re.compile(r"<div\s+data-ef-glass\b[^>]*>.*?</div>\s*", re.S | re.I)


def _indent_block(block: str) -> str:
    """Keep generated markup flush with the canvas (no leading indentation)."""
    return block.strip("\n")


def inject_style(html: str, css: str) -> str:
    block = f"<style data-ef-system>\n{css.strip()}\n</style>"
    if STYLE_BLOCK.search(html):
        return STYLE_BLOCK.sub(lambda _m: block, html, count=1)

    helmet = re.search(r"<helmet\b[^>]*>", html, re.I)
    if not helmet:
        # No helmet: put the system block at the top of <head>.
        head = re.search(r"<head\b[^>]*>", html, re.I)
        if head:
            pos = head.end()
            return html[:pos] + "\n" + block + html[pos:]
        return block + "\n" + html

    first_style = STYLE_OPEN.search(html, helmet.end())
    if first_style:
        pos = first_style.start()
        return html[:pos] + block + "\n" + html[pos:]
    pos = helmet.end()
    return html[:pos] + "\n" + block + html[pos:]


def inject_glass(html: str, glass: str) -> str:
    block = _indent_block(glass)
    if GLASS_BLOCK.search(html):
        return GLASS_BLOCK.sub(lambda _m: block + "\n", html, count=1)

    helmet_close = re.search(r"</helmet\s*>", html, re.I)
    if helmet_close:
        pos = helmet_close.end()
        rest = html[pos:].lstrip("\n\r\t ")
        return html[:pos] + "\n" + block + "\n" + rest

    body = re.search(r"<body\b[^>]*>", html, re.I)
    if body:
        pos = body.end()
        return html[:pos] + "\n" + block + "\n" + html[pos:]
    return html + "\n" + block + "\n"


def sync_file(path: Path, css: str, glass: str) -> bool:
    original = path.read_text(encoding="utf-8")
    updated = inject_glass(inject_style(original, css), glass)
    if updated != original:
        path.write_text(updated, encoding="utf-8")
        return True
    return False


def main(argv: list[str]) -> int:
    if len(argv) < 2:
        print(__doc__.strip())
        return 2

    css = TOKENS_PATH.read_text(encoding="utf-8")
    glass = GLASS_PATH.read_text(encoding="utf-8")

    changed = 0
    for raw in argv[1:]:
        path = Path(raw)
        if not path.is_absolute():
            path = (Path.cwd() / path).resolve()
        if not path.exists():
            print(f"missing  {raw}", file=sys.stderr)
            return 1
        if path.suffix.lower() not in {".html", ".htm"}:
            print(f"skip     {raw} (not .html)", file=sys.stderr)
            continue
        ok = sync_file(path, css, glass)
        changed += int(ok)
        print(f"{'updated ' if ok else 'unchanged'} {raw}")

    print(f"ef-system: {changed} updated, {len(argv) - 1 - changed} unchanged")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
