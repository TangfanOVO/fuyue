#!/usr/bin/env python3
"""Loopback adapter for tsuru0805/engawa-mcp (MIT), pinned by upstreams/engawa-mcp.lock.json."""
from __future__ import annotations

import argparse
import asyncio
import inspect
import os
from typing import Any, Callable

import uvicorn
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

import engawa_mcp
import engawa_mcp.server as engawa

CALL_LOCK = asyncio.Lock()
TOOLS: dict[str, Callable[..., Any]] = {
    "web_read": engawa.web_read,
    "rss_read": engawa.rss_read,
    "shelf": engawa.shelf_list,
    "shelf_add": engawa.shelf_add,
    "shelf_suggest": engawa.shelf_suggest,
    "shelf_remove": engawa.shelf_remove,
    "sky_tonight": engawa.sky_tonight,
    "apod": engawa.apod,
    "daily_art": engawa.daily_art,
    "arxiv_new": engawa.arxiv_new,
    "daily_poem": engawa.daily_poem,
    "on_this_day": engawa.on_this_day,
}

async def health(_request: Request) -> JSONResponse:
    return JSONResponse({"ok": True, "name": "engawa-mcp", "version": getattr(engawa_mcp, "__version__", "unknown"), "commit": os.getenv("ENGAWA_UPSTREAM_COMMIT", "unknown"), "license": "MIT", "tools": list(TOOLS)})

async def call_tool(request: Request) -> JSONResponse:
    action = request.path_params["action"]
    function = TOOLS.get(action)
    if function is None:
        return JSONResponse({"ok": False, "error": "unknown_action"}, status_code=404)
    raw = await request.body()
    if len(raw) > 8_000:
        return JSONResponse({"ok": False, "error": "payload_too_large"}, status_code=413)
    try:
        arguments = await request.json() if raw else {}
    except ValueError:
        return JSONResponse({"ok": False, "error": "invalid_json"}, status_code=400)
    if not isinstance(arguments, dict) or len(arguments) > 10:
        return JSONResponse({"ok": False, "error": "object_required"}, status_code=400)
    try:
        async with CALL_LOCK:
            result = function(**arguments)
            if inspect.isawaitable(result):
                result = await result
    except TypeError as exc:
        return JSONResponse({"ok": False, "error": f"bad_arguments: {str(exc)[:180]}"}, status_code=400)
    except Exception as exc:  # Upstream failures are returned, never replaced by sample content.
        return JSONResponse({"ok": False, "error": f"{type(exc).__name__}: {str(exc)[:180]}"}, status_code=502)
    return JSONResponse({"ok": True, "action": action, "result": result})

def build_app() -> Starlette:
    return Starlette(routes=[Route("/health", health), Route("/tool/{action:str}", call_tool, methods=["POST"])])

def main() -> None:
    parser = argparse.ArgumentParser(description="Fuyue isolated Engawa sidecar")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8179)
    args = parser.parse_args()
    if args.host not in {"127.0.0.1", "::1", "localhost"}:
        raise SystemExit("Engawa sidecar must bind to loopback")
    uvicorn.run(build_app(), host=args.host, port=args.port, log_level="info")

if __name__ == "__main__":
    main()
