"""Every `data-i18n` key a page uses must exist in both tables, and both tables must agree.

`GT.t` returns the key itself when it does not find it, and `applyI18n` writes that over whatever
was in the element — so a mistyped key does not fail, it publishes. A page shipped reading
"P.SCALE" next to the zoom level because the key was `p.zoom`, and nothing anywhere said so.

    python tools/web/check_i18n.py          # exits non-zero on the first problem

It checks three things:

  missing      a key used in HTML or JS that neither table defines
  half         a key defined in Turkish but not English, or the other way round
  placeholder  a {token} in one language that the other does not carry

Keys built at runtime (`GT.t('x.' + kind)`) cannot be checked and are not guessed at; the scan
only looks at literals, which is every key on these pages today.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

WEB = Path(__file__).resolve().parents[2] / "apps" / "web"
GT = WEB / "assets" / "js" / "gt.js"


def tables(text: str) -> dict[str, dict[str, str]]:
    """The two i18n tables, as {lang: {key: value}}.

    The file builds them with an object literal and then a series of `Object.assign(I18N.tr, {...})`
    calls, so the tables are read by walking the assignments rather than by parsing JavaScript."""
    out: dict[str, dict[str, str]] = {"tr": {}, "en": {}}
    lang = None
    depth = 0
    for line in text.splitlines():
        s = line.strip()
        m = re.match(r"Object\.assign\(I18N\.(tr|en),", s)
        if m:
            lang = m.group(1)
            depth = 1
        elif re.match(r"^(tr|en):\s*\{", s):
            lang = s.split(":", 1)[0]
            depth = 1
        if lang is None:
            continue
        for key, _quote, value in re.findall(r"'([a-zA-Z0-9_.]+)':\s*(['\"])(.*?)(?<!\\)\2", s):
            out[lang][key] = value
        if s.endswith("});") or s.endswith("},"):
            depth -= 1
            if depth <= 0:
                lang = None
    return out


def used(paths: list[Path]) -> dict[str, set[str]]:
    """Every literal key a page asks for, and where it asked."""
    where: dict[str, set[str]] = {}
    for p in paths:
        text = p.read_text(encoding="utf-8")
        keys = set(re.findall(r"data-i18n(?:-aria|-placeholder)?=\"([a-zA-Z0-9_.]+)\"", text))
        keys |= set(re.findall(r"GT\.t\(\s*'([a-zA-Z0-9_.]+)'", text))
        for k in keys:
            # `GT.t('ops.' + p.status)` leaves the literal `ops.` behind: a prefix the page
            # completes at runtime, which this scan cannot follow and must not report.
            if k.endswith("."):
                continue
            where.setdefault(k, set()).add(p.name)
    return where


def placeholders(value: str) -> set[str]:
    return set(re.findall(r"\{([a-zA-Z0-9_]+)\}", value))


def main() -> int:
    i18n = tables(GT.read_text(encoding="utf-8"))
    tr, en = i18n["tr"], i18n["en"]
    if len(tr) < 50 or len(en) < 50:
        print(f"could not read the tables ({len(tr)} tr, {len(en)} en) — has gt.js changed shape?")
        return 2

    pages = sorted(WEB.glob("*.html")) + sorted((WEB / "assets" / "js").glob("*.js"))
    pages = [p for p in pages if p.name != "gt.js"]
    problems: list[str] = []

    for key, files in sorted(used(pages).items()):
        if key not in tr and key not in en:
            problems.append(f"missing   {key:<22} used in {', '.join(sorted(files))}")

    for key in sorted(set(tr) | set(en)):
        if key not in en:
            problems.append(f"half      {key:<22} Turkish only")
        elif key not in tr:
            problems.append(f"half      {key:<22} English only")
        elif placeholders(tr[key]) != placeholders(en[key]):
            problems.append(
                f"placeholder {key:<20} tr {sorted(placeholders(tr[key]))} "
                f"vs en {sorted(placeholders(en[key]))}"
            )

    if problems:
        print(f"{len(problems)} problem(s):", file=sys.stderr)
        for line in problems:
            print("  " + line, file=sys.stderr)
        return 1

    print(f"i18n ok: {len(tr)} keys, both languages, {len(pages)} files checked")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
