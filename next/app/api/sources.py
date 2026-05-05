from fastapi import APIRouter, Request, HTTPException
from app.schemas.manga import SearchResultOut

router = APIRouter(prefix="/sources", tags=["sources"])


@router.get("")
async def list_sources(request: Request):
    registry = request.app.state.source_registry
    return [{"source_id": s.source_id, "display_name": s.display_name} for s in registry.all()]


@router.get("/{source_id}/search")
async def search_manga(source_id: str, q: str, request: Request) -> list[SearchResultOut]:
    registry = request.app.state.source_registry
    source   = registry.get(source_id)
    if source is None:
        raise HTTPException(404, f"Source '{source_id}' not found")

    results = source.search(q, source.cf_dict)
    return [SearchResultOut(**vars(r)) for r in results]
