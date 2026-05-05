import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

logger = logging.getLogger(__name__)

ws_router = APIRouter()


class WSManager:
    def __init__(self):
        self._connections: list[WebSocket] = []

    async def connect(self, ws: WebSocket) -> None:
        await ws.accept()
        self._connections.append(ws)
        logger.debug("WS client connected (%d total)", len(self._connections))

    def disconnect(self, ws: WebSocket) -> None:
        if ws in self._connections:
            self._connections.remove(ws)
        logger.debug("WS client disconnected (%d remaining)", len(self._connections))

    async def broadcast(self, event: str, data: dict) -> None:
        if not self._connections:
            return
        message = json.dumps({"event": event, "data": data})
        dead = []
        for ws in self._connections:
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws)


@ws_router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    manager: WSManager = ws.app.state.ws_manager
    await manager.connect(ws)
    try:
        while True:
            await ws.receive_text()   # keep connection alive; we only push, not pull
    except WebSocketDisconnect:
        manager.disconnect(ws)
