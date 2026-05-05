from app.sources.base import MangaSource


class SourceRegistry:
    def __init__(self):
        self._sources: dict[str, MangaSource] = {}

    def register(self, source: MangaSource) -> None:
        self._sources[source.source_id] = source

    def get(self, source_id: str) -> MangaSource | None:
        return self._sources.get(source_id)

    def all(self) -> list[MangaSource]:
        return list(self._sources.values())
