"""
DogeMangaSource — concrete MangaSource implementation.

cf_dict 和 error_state 是实例变量而非类变量。虽然当前一次只运行一个任务，
但若将来升级为多源并发，类变量会导致所有任务共享同一份状态并互相干扰。
"""
import logging

from app.sources.base import MangaSource, SearchResult, MangaDetail, ChapterInfo
from app.sources.dogemanga import scraper

logger = logging.getLogger(__name__)


class DogeMangaSource(MangaSource):
    source_id    = "dogemanga"
    display_name = "DogeManga"

    def __init__(self):
        # cf_dict 在整个 source 实例生命周期内持久保存 CloudFlare 凭证，
        # FlareSolverr 获取到新凭证后直接 mutate 这个 dict，所有后续请求
        # 通过 make_session(cf_dict) 自动注入，无需额外传参。
        self.cf_dict: dict = {
            "cf_activate":        False,
            "cf_clearance_value": "",
            "cf_userAgent":       "",
            "updateTime":         None,
        }
        # error_state 在所有 scraper 函数间共享，实现跨图片/跨章节的 429 协调：
        # 某一张图遇到 429 设置 g_error_flag=True 后，同一章节内其他正在循环的
        # 图片下载会暂停等待（download_image 开头的 while 循环），
        # 直到退避结束、flag 重置为 False 才继续。
        self.error_state: dict = {
            "g_error_flag":  False,
            "g_error_count": 0,
            "g_wait_time":   40,   # base seconds for 429 back-off
        }

    # ── Called by DownloadManager before each task to apply current settings ──

    def apply_settings(self, settings: dict) -> None:
        """
        Update runtime state from admin_settings values.

        settings = {
            "flaresolverr_enabled": bool,
            "flaresolverr_url":     str,
            "error_backoff_base":   int,
        }
        """
        self.error_state["g_wait_time"] = int(settings.get("error_backoff_base", 40))

        if not settings.get("flaresolverr_enabled", False):
            # 管理员关闭了 FlareSolverr：清除激活标志，后续请求不注入 CF 凭证。
            # 不清除 cf_clearance_value 本身，以便重新启用时能沿用已有凭证。
            self.cf_dict["cf_activate"] = False

    def refresh_cf(self, flaresolverr_url: str) -> None:
        from app.sources.dogemanga.session import refresh_cf_bypass
        refresh_cf_bypass(self.cf_dict, flaresolverr_url, "https://dogemanga.com")

    def reset_error_state(self) -> None:
        # 只重置计数器，不重置 g_wait_time（由 apply_settings 管理）。
        # 若不重置，上一个任务积累的 g_error_count 会让下一个任务第一次
        # 遇到 429 时就等待异常长的时间。
        self.error_state["g_error_flag"]  = False
        self.error_state["g_error_count"] = 0

    # ── MangaSource interface ─────────────────────────────────────────────────

    def search(self, query: str, cf_dict: dict | None = None) -> list[SearchResult]:
        return scraper.search(query, cf_dict or self.cf_dict)

    def get_manga_detail(
        self, source_manga_id: str, cf_dict: dict | None = None
    ) -> MangaDetail | int:
        return scraper.get_manga_detail(source_manga_id, cf_dict or self.cf_dict)

    def get_chapter_images(
        self,
        source_manga_id: str,
        chapter: ChapterInfo,
        cf_dict: dict | None = None,
    ) -> list[tuple[str, str]] | int:
        # error_state 始终使用实例自身的，不允许外部传入覆盖，
        # 保证状态归属清晰（属于这个 source 实例，不会被调用方污染）。
        return scraper.get_chapter_images(
            chapter,
            cf_dict or self.cf_dict,
            self.error_state,
        )
