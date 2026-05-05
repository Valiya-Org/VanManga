"""
DogeManga page parser.

All HTTP calls use requests.Session (returned by session.make_session).
This module runs exclusively inside ThreadPoolExecutor threads — synchronous
requests is appropriate here and must not be replaced with async httpx.

Classification stubs
────────────────────
_classify_group(tab_id, label) → ContentType
    Fill in the if-branches once you have inspected the live HTML.
    The tab_id is the id attribute of the <div class="tab-pane"> element,
    e.g. "site-manga__tab-pane-book", "site-manga__tab-pane-serial", …
    The label is the visible tab text (stripped).
"""
import base64
import logging
import re
import time
import random
from collections import defaultdict

import requests
from bs4 import BeautifulSoup

from app.sources.base import ContentType, ContentGroup, ChapterInfo, SearchResult, MangaDetail
from app.sources.dogemanga.session import make_session

logger = logging.getLogger(__name__)

BASE_URL = "https://dogemanga.com"
MAX_SEARCH_RESULTS = 10

_RE_TRIM  = re.compile(r"^\s+|\s+$")
_RE_EMOJI = re.compile(
    "["
    "\U0001F300-\U0001F64F"
    "\U0001F680-\U0001F6FF"
    "☀-⭕"
    "\U00010000-\U0010ffff"
    "]+"
)


# ─── Classification stub ────────────────────────────────────────────────────

def _classify_group(tab_id: str, label: str) -> ContentType:
    """
    Maps DogeManga tab identifiers to ContentType.

    tab_id  — id of the <div class="tab-pane">, e.g. "site-manga__tab-pane-tankobon"
    label   — visible nav tab text, e.g. "單行本" / "單回連載" / "番外篇"

    Mapping derived from data-publication-kind values observed in the live DOM:
      tankobon  → TANKOBON
      issue     → CHAPTER
      bangaihen → OTHER
    """
    if "tankobon" in tab_id or "單行本" in label:
        return ContentType.TANKOBON
    if "issue" in tab_id or "單回連載" in label or "連載" in label:
        return ContentType.CHAPTER
    return ContentType.OTHER


# ─── Title normalisation ────────────────────────────────────────────────────

def _normalise_title(title: str) -> str:
    from app.sources.dogemanga._title_reformat import chapter_title_reformat
    return chapter_title_reformat(title)


# ─── Core scraping functions ─────────────────────────────────────────────────

def search(query: str, cf_dict: dict) -> list[SearchResult]:
    url     = f"{BASE_URL}/?q={query}&l=zh"
    session = make_session(cf_dict)

    try:
        resp = session.get(url, timeout=30)
    except requests.RequestException as exc:
        logger.error("Search request failed: %s", exc)
        return []

    soup       = BeautifulSoup(resp.text, "lxml")
    print(soup)
    scroll_row = soup.find("div", class_="site-scroll__row")
    if not scroll_row:
        return []

    cards   = scroll_row.find_all("div", class_="site-card")
    results: list[SearchResult] = []

    for card in cards[:MAX_SEARCH_RESULTS]:
        try:
            manga_id   = card["data-manga-id"]
            name       = card.find("h5", class_="card-title").text.strip()
            artist     = card.find("h6", class_="card-subtitle").text.strip()
            newest_epi = card.find("li",  class_="list-group-item").text.strip()
            thumb_url  = card.find("img", class_="card-img-top")["src"]

            # 缩略图单独请求并 base64 编码，方便前端直接嵌入 <img src> 而不依赖代理。
            # 即使缩略图获取失败也不应中断整个搜索结果，所以单独 try-except。
            thumb_b64 = ""
            try:
                thumb_resp = session.get(thumb_url, timeout=15)
                thumb_b64  = base64.b64encode(thumb_resp.content).decode()
            except Exception:
                pass

            results.append(SearchResult(
                source_manga_id=manga_id,
                name=name,
                artist=artist,
                cover_url=thumb_url,
                # 搜索结果页面不包含完结状态，设 False 作为占位符，
                # 实际状态在 get_manga_detail 中读取。
                is_completed=False,
                newest_chapter=newest_epi,
                thumbnail_b64=thumb_b64,
            ))
        except Exception as exc:
            logger.warning("Failed to parse search card: %s", exc)
            continue

    return results


def get_manga_detail(source_manga_id: str, cf_dict: dict) -> MangaDetail | int:
    """
    Returns MangaDetail on success, or 501 on parse failure.

    The chapter list is built from ALL available tab panes so that
    tankobon, serialised chapters and extras can be kept separate.
    If no per-type panes are found we fall back to the unified "all" pane
    and classify everything as OTHER.
    """
    url     = f"{BASE_URL}/m/{source_manga_id}?l=zh"
    session = make_session(cf_dict)

    try:
        resp = session.get(url, timeout=30)
    except requests.RequestException as exc:
        logger.error("Manga detail request failed: %s", exc)
        return 501

    soup = BeautifulSoup(resp.text, "lxml")

    try:
        main = soup.find("div", class_="site-main-content")

        card         = main.find("div", class_="site-card")
        status_texts = card.find("small", class_="text-muted").text.split("\n")
        # "連載中" 出现才说明仍在连载；不出现（包括空白/其他文字）则视为完结。
        is_completed = not any("連載中" in t for t in status_texts)

        cover_img = card.find("img", class_="card-img-top")
        cover_url = cover_img["src"] if cover_img else ""

        artist   = ""
        subtitle = card.find("h6", class_="card-subtitle")
        if subtitle:
            artist = subtitle.text.strip()

        name     = ""
        title_el = card.find("h5", class_="card-title")
        if title_el:
            name = title_el.text.strip()

        tab_content = soup.find("div", class_="tab-content")
        groups: list[ContentGroup] = []

        if tab_content:
            panes = tab_content.find_all("div", class_="tab-pane")
            # 优先处理类型专属 pane（不含 "all" 的），这样 tankobon/chapter/other
            # 能被分别识别；只有当不存在专属 pane 时才退回到 all pane。
            specific_panes = [p for p in panes if "all" not in p.get("id", "")]
            target_panes   = specific_panes if specific_panes else panes

            for pane in target_panes:
                pane_id = pane.get("id", "")
                if "all" in pane_id and specific_panes:
                    continue

                # 从对应 nav 链接获取可见标签文字，用于 _classify_group 和前端显示。
                # DogeManga 使用 Bootstrap 5：nav link 通过 data-bs-target 而非 href 关联 pane。
                label   = pane_id
                nav_tab = soup.find("a", attrs={"data-bs-target": f"#{pane_id}"})
                if nav_tab:
                    label = nav_tab.text.strip()

                content_type = _classify_group(pane_id, label)
                links        = pane.find_all("a", class_="site-manga-thumbnail__link")
                chapters: list[ChapterInfo] = []

                # 页面的章节列表是倒序的（最新在前），reversed 后才是阅读顺序（升序），
                # idx+1 作为 number 保证排序与原始顺序一致。
                # 不从标题中解析数字是因为 DogeManga 的标题格式极不统一，
                # 正则解析错误率高，用位置索引更可靠。
                for idx, link in enumerate(reversed(links)):
                    raw_title = link.find("span", class_="text-center")
                    raw_title = raw_title.text if raw_title else ""
                    raw_title = _RE_TRIM.sub("", raw_title)
                    raw_title = _RE_EMOJI.sub("", raw_title)
                    title     = _normalise_title(raw_title)
                    href      = link["href"]

                    chapters.append(ChapterInfo(
                        source_chapter_id=href,
                        number=float(idx + 1),
                        title=title,
                        content_type=content_type,
                    ))

                if chapters:
                    groups.append(ContentGroup(
                        content_type=content_type,
                        label=label,
                        chapters=chapters,
                    ))

        return MangaDetail(
            source_manga_id=source_manga_id,
            name=name,
            artist=artist,
            cover_url=cover_url,
            is_completed=is_completed,
            groups=groups,
        )

    except Exception as exc:
        logger.error("Failed to parse manga detail for %s: %s", source_manga_id, exc)
        return 501


def get_chapter_images(
    chapter: ChapterInfo,
    cf_dict: dict,
    error_state: dict,
) -> list[tuple[str, str]] | int:
    """
    Returns list of (page_label, image_url) in reading order.
    Returns 429 | 502 | 503 on error.

    error_state: shared mutable dict with keys
        g_error_flag  bool
        g_error_count int
        g_wait_time   int   (base seconds for 429 back-off)
    """
    session = make_session(cf_dict)
    url     = chapter.source_chapter_id
    if not url.startswith("http"):
        url = f"{BASE_URL}{url}"

    # 页面的 img alt 属性格式为 "第 N 页"（简繁体混用），用它作为文件名
    # 比序号更可读，且与原项目命名方案兼容（阅读器按文件名排序）。
    find_page = re.compile(r"第\s\d+\s[页頁]")

    try:
        resp = session.get(url, timeout=30)
    except requests.RequestException as exc:
        logger.error("Chapter page request failed: %s", exc)
        return 503

    if resp.status_code == 429:
        _handle_429(error_state, chapter.title)
        return 429

    soup = BeautifulSoup(resp.text, "lxml")

    try:
        site_reader    = soup.find("div", class_="site-reader")
        # data-page-image-url 是懒加载属性，src 在未滚动时可能为占位图。
        # 必须用这个自定义属性而非 src 才能拿到真实图片 ID。
        img_collection = site_reader.find_all("img", attrs={"data-page-image-url": True})
    except Exception as exc:
        logger.error("Failed to parse chapter page: %s", exc)
        return 503

    pages: list[tuple[str, str]] = []
    for tag in img_collection:
        try:
            page_labels = find_page.findall(tag.get("alt", ""))
            img_id      = tag["data-page-image-url"].split("/")[-1]
            label       = page_labels[0] if page_labels else f"page_{len(pages)+1}"
            img_url     = f"{BASE_URL}/images/pages/{img_id}?l=zh"
            pages.append((label, img_url))
        except Exception as exc:
            logger.warning("Skipped malformed img tag: %s", exc)
            return 502

    return pages


def download_image(
    label: str,
    url: str,
    dest_path: str,
    cf_dict: dict,
    error_state: dict,
) -> bool:
    """
    Download a single image to dest_path.
    Blocks if another thread has set error_state["g_error_flag"].
    Returns True on success.
    """
    # 其他并发章节遇到 429 会设置 g_error_flag=True，此处轮询等待退避结束，
    # 避免在服务端已触发限流时继续发送请求使情况恶化。
    # sleep(0.5) 是为了不让 CPU 空转；0.5s 比图片请求间隔短得多，延迟可接受。
    while error_state.get("g_error_flag"):
        time.sleep(0.5)

    session = make_session(cf_dict)
    try:
        resp = session.get(url, timeout=30)
    except requests.RequestException as exc:
        logger.warning("Image download failed (%s): %s", url, exc)
        return False

    if resp.status_code == 429:
        # 递归重试：退避结束后从头重试本张图片。
        # g_error_count 上限为 6，最大退避约 250s，防止无限递归导致栈溢出。
        _handle_429(error_state, label)
        return download_image(label, url, dest_path, cf_dict, error_state)

    try:
        with open(dest_path, "wb") as f:
            f.write(resp.content)
    except OSError as exc:
        logger.error("Could not write image to %s: %s", dest_path, exc)
        return False

    # 1-2s 随机延迟模拟正常浏览行为，降低被识别为爬虫的概率。
    time.sleep(1 + random.random())
    return True


# ─── Helpers ────────────────────────────────────────────────────────────────

def _handle_429(error_state: dict, context: str) -> None:
    error_state["g_error_flag"] = True
    # 上限 6 次：第 6 次退避约 240-250s，再往上意义不大且会阻塞过久。
    if error_state["g_error_count"] < 6:
        error_state["g_error_count"] += 1

    wait = error_state["g_wait_time"] * error_state["g_error_count"] + int(random.random() * 10)
    logger.warning("%s: 429 encountered, backing off %ds", context, wait)
    time.sleep(wait)
    # 退避结束后重置 flag，等待中的其他线程会在下次 while 检查时继续执行。
    error_state["g_error_flag"] = False
