#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
VanManga scraper CLI — thin wrapper over modules/* for the NestJS side
to invoke via child_process.

Contract:
  * argv defines source + command (parsed by argparse)
  * Cloudflare state may be passed via --cf-state '<json>' or stdin
  * Existing modules' print() statements are redirected to stderr
  * The ONLY thing written to stdout is one JSON line of the form:
      { "ok": true, "data": <result> }
      { "ok": false, "errorCode": <int|null>, "error": "<msg>" }
  * Process exit code is 0 on success and 1 on uncaught error

Usage:
  python scrape_cli.py --source dgmanga search "fate"
  python scrape_cli.py --source dgmanga metadata <manga_id>
  python scrape_cli.py --source dgmanga chapters <manga_id>
  python scrape_cli.py --source dgmanga chapter-images <chapter_url>

Adding a new source:
  1. Drop a new module under modules/<NewSource>.py implementing
     modules.MangaSite.MangaSite.
  2. Add an entry to SOURCE_REGISTRY below — a dict that maps each
     command to a callable. Re-use helpers in modules/* and utils/*.
  3. NestJS adds the matching IMangaSource implementation.
"""

import argparse
import json
import re
import sys
import traceback
from typing import Any, Callable, Dict


# ---------------------------------------------------------------------------
# stdout/stderr separation
# ---------------------------------------------------------------------------
_REAL_STDOUT = sys.stdout
sys.stdout = sys.stderr  # all module-level print() goes to stderr from here


def _emit(payload: Dict[str, Any]) -> None:
    """Write the single JSON result line to the real stdout fd."""
    _REAL_STDOUT.write(json.dumps(payload, ensure_ascii=False))
    _REAL_STDOUT.write("\n")
    _REAL_STDOUT.flush()


# ---------------------------------------------------------------------------
# CF state — match the dict shape main.py passes to scrapers.
# ---------------------------------------------------------------------------
def _build_cf_dict(raw: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "cf_activate": bool(raw.get("active", False)),
        "cf_clearance_value": raw.get("cfClearance") or "",
        "cf_userAgent": raw.get("userAgent") or "",
        "updateTime": None,
    }


def _read_cf_state(arg_value: str) -> Dict[str, Any]:
    if arg_value:
        return json.loads(arg_value)
    if not sys.stdin.isatty():
        text = sys.stdin.read().strip()
        if text:
            return json.loads(text)
    return {}


# ===========================================================================
# Source: dgmanga
# ===========================================================================
def _dgmanga_search(query: str, cf: Dict[str, Any]) -> Any:
    from modules.DGmanga import DGmanga

    site = DGmanga(manga_id="")
    return site.search_manga(query, cf)


def _dgmanga_metadata(manga_id: str, cf: Dict[str, Any]) -> Any:
    from modules.DGmanga import DGmanga

    site = DGmanga(manga_id=manga_id)
    result = site.check_manga_length(cf)
    # legacy returns [count, serialization] or [501, 0]
    count, serialization = result[0], result[1]
    if count == 501:
        return {"errorCode": 501, "chapterCount": 0, "serialization": 0}
    return {"chapterCount": count, "serialization": serialization}


def _dgmanga_chapters(manga_id: str, cf: Dict[str, Any]) -> Any:
    from modules.DGmanga import DGmanga

    site = DGmanga(manga_id=manga_id)
    raw = site.comic_main_page(manga_id, cf)  # returns [[title, link], ...] or 501
    if raw == 501:
        return {"errorCode": 501, "chapters": []}

    raw.reverse()  # source returns newest-first; we want chronological
    chapters = [
        {"index": idx + 1, "title": title, "url": link}
        for idx, (title, link) in enumerate(raw)
    ]
    return {"chapters": chapters}


def _dgmanga_chapter_images(chapter_url: str, cf: Dict[str, Any]) -> Any:
    """Extract image URLs for one DGmanga chapter without downloading.
    Logic mirrors modules/DGmanga.py:scrape_each_chapter lines 240-262
    but stops short of download_img — NestJS owns the download."""
    from bs4 import BeautifulSoup
    from DrissionPage import SessionPage

    session = SessionPage()
    if cf["cf_activate"]:
        session.get(
            chapter_url,
            headers={"User-Agent": cf["cf_userAgent"]},
            cookies={"cf_clearance": cf["cf_clearance_value"]},
        )
    else:
        session.get(chapter_url)

    response = session.response
    if response is None:
        return {"errorCode": 503, "chapterTitle": "", "imageUrls": []}
    if response.status_code == 429:
        return {"errorCode": 429, "chapterTitle": "", "imageUrls": []}

    soup = BeautifulSoup(response.text, "lxml")
    page_re = re.compile(r"第\s\d+\s[页|頁]")

    try:
        site_reader = soup.find("div", class_="site-reader")
        img_collection = site_reader.find_all(
            "img", attrs={"data-page-image-url": True}
        )
    except Exception:
        return {"errorCode": 503, "chapterTitle": "", "imageUrls": []}

    images = []
    for img_tag in img_collection:
        page_match = page_re.findall(img_tag.get("alt", ""))
        page_label = page_match[0] if page_match else ""
        img_id = img_tag["data-page-image-url"].split("/")[-1]
        images.append(
            {"page": page_label, "url": f"https://dogemanga.com/images/pages/{img_id}?l=zh"}
        )

    headers: Dict[str, str] = {}
    if cf["cf_activate"]:
        headers["User-Agent"] = cf["cf_userAgent"]
        headers["Cookie"] = f"cf_clearance={cf['cf_clearance_value']}"

    return {
        "chapterTitle": "",  # NestJS already knows the title from getChapters()
        "imageUrls": [img["url"] for img in images],
        "imagePages": [img["page"] for img in images],
        "requestHeaders": headers,
    }


# ===========================================================================
# Source registry — the only thing that needs editing for a new source.
# ===========================================================================
Handler = Callable[..., Any]
SOURCE_REGISTRY: Dict[str, Dict[str, Handler]] = {
    "dgmanga": {
        "search": _dgmanga_search,
        "metadata": _dgmanga_metadata,
        "chapters": _dgmanga_chapters,
        "chapter-images": _dgmanga_chapter_images,
    },
}


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def main() -> int:
    parser = argparse.ArgumentParser(prog="scrape_cli")
    parser.add_argument("--source", required=True, choices=list(SOURCE_REGISTRY.keys()))
    parser.add_argument(
        "--cf-state",
        default="",
        help="JSON Cloudflare state ({active, cfClearance, userAgent}); "
        "if omitted, read from stdin when piped.",
    )

    sub = parser.add_subparsers(dest="command", required=True)

    p_search = sub.add_parser("search")
    p_search.add_argument("query")

    p_meta = sub.add_parser("metadata")
    p_meta.add_argument("manga_id")

    p_chapters = sub.add_parser("chapters")
    p_chapters.add_argument("manga_id")

    p_imgs = sub.add_parser("chapter-images")
    p_imgs.add_argument("chapter_url")

    args = parser.parse_args()

    handlers = SOURCE_REGISTRY[args.source]
    handler = handlers.get(args.command)
    if handler is None:
        _emit({"ok": False, "errorCode": None, "error": f"Unsupported command: {args.command}"})
        return 2

    try:
        cf_dict = _build_cf_dict(_read_cf_state(args.cf_state))
        if args.command == "search":
            data = handler(args.query, cf_dict)
        elif args.command == "metadata":
            data = handler(args.manga_id, cf_dict)
        elif args.command == "chapters":
            data = handler(args.manga_id, cf_dict)
        elif args.command == "chapter-images":
            data = handler(args.chapter_url, cf_dict)
        else:
            data = None

        # legacy code sometimes returns sentinel ints (e.g. 457 for search failure)
        if isinstance(data, int):
            _emit({"ok": False, "errorCode": data, "error": f"Source returned status {data}"})
            return 0

        _emit({"ok": True, "data": data})
        return 0
    except Exception as e:  # noqa: BLE001 — any exception goes through one channel
        traceback.print_exc()
        _emit({"ok": False, "errorCode": None, "error": str(e)})
        return 1


if __name__ == "__main__":
    sys.exit(main())
