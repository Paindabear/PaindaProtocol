import asyncio
import websockets
import logging
import json
from typing import Any, Callable, Dict, Optional, Set
from .frame import encode_frame, decode_frame, PPMode
from .diff import patch

logger = logging.getLogger("painda")

class PPClient:
    def __init__(self, url: str):
        self.url = url
        self.ws: Optional[websockets.WebSocketClientProtocol] = None
        self._listeners: Dict[str, Set[Callable]] = {}
        self._connected = asyncio.Event()
        self.state: Any = None

    async def connect(self):
        """Establish connection to the PaindaProtocol server."""
        async with websockets.connect(self.url) as websocket:
            self.ws = websocket
            self._connected.set()
            logger.info(f"Connected to {self.url}")
            
            # Message loop
            async for message in websocket:
                if isinstance(message, bytes):
                    try:
                        header, data = decode_frame(message)
                        await self._handle_pp_frame(header, data)
                    except Exception as e:
                        logger.error(f"Failed to decode PP frame: {e}")
                else:
                    # Initial handshake/JSON mode
                    try:
                        data = json.loads(message)
                        await self._emit_local("message", data)
                    except:
                        pass

    async def emit(self, event: str, payload: Any, mode: PPMode = PPMode.EVENT):
        """Send an event to the server."""
        await self._connected.wait()
        
        message = {
            "type": event,
            "payload": payload
        }
        
        frame = encode_frame(mode, message)
        await self.ws.send(frame)

    def on(self, event: str, callback: Optional[Callable] = None):
        """
        Register an event listener.
        Can be used as a direct call or as a decorator:
        @client.on("event")
        def handler(data): ...
        """
        if callback is None:
            def decorator(func):
                self.on(event, func)
                return func
            return decorator

        if event not in self._listeners:
            self._listeners[event] = set()
        self._listeners[event].add(callback)

    async def _handle_pp_frame(self, header: Any, data: Any):
        """Route incoming PP frames to listeners."""
        # Feature: Automatic state management for Mode 2
        if header.mode == PPMode.STATE:
            self.state = patch(self.state, data.get("payload", data))
            await self._emit_local("state:updated", self.state)
            
        event_type = data.get("type", "message")
        payload = data.get("payload", data)
        await self._emit_local(event_type, payload)

    async def _emit_local(self, event: str, payload: Any):
        """Trigger local callbacks."""
        if event in self._listeners:
            for cb in self._listeners[event]:
                if asyncio.iscoroutinefunction(cb):
                    await cb(payload)
                else:
                    cb(payload)

    def __del__(self):
        if self.ws:
            asyncio.create_task(self.ws.close())
