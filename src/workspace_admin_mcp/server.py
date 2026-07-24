"""MCP server assembly.

`build_server` takes an explicit client so tests can inject a fake; production
uses `create_default_server`, which wires in the real Admin SDK client.
"""

from __future__ import annotations

from mcp.server.fastmcp import FastMCP

from .auth import WorkspaceDirectory
from .config import Settings
from .tools import groups, users


def build_server(settings: Settings, client) -> FastMCP:
    mcp = FastMCP("workspace-admin-mcp", host=settings.host, port=settings.port)
    users.register(mcp, client, settings)
    groups.register(mcp, client, settings)
    return mcp


def create_default_server() -> FastMCP:
    settings = Settings.from_env()
    return build_server(settings, WorkspaceDirectory(settings))
