"""Structured audit logging.

Every tool call — read or write, applied or simulated — emits one JSON line.
This mirrors the audit-first pattern used for production Workspace automation:
you should always be able to answer "who did what, when, and was it real?"

IMPORTANT: the MCP stdio transport uses *stdout* for the protocol, so all log
output must go to *stderr* to avoid corrupting the stream.
"""

from __future__ import annotations

import json
import logging
import sys
from datetime import datetime, timezone
from typing import Any

_logger = logging.getLogger("workspace_admin_mcp.audit")


def configure_logging(level: int = logging.INFO) -> None:
    """Send all package logs to stderr as plain (already-JSON) lines."""
    handler = logging.StreamHandler(stream=sys.stderr)
    handler.setFormatter(logging.Formatter("%(message)s"))
    root = logging.getLogger("workspace_admin_mcp")
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)


def audit(
    *,
    tool: str,
    actor: str,
    args: dict[str, Any],
    outcome: str,
    dry_run: bool,
) -> dict[str, Any]:
    """Emit one structured audit record and return it (handy for tests)."""
    record = {
        "ts": datetime.now(timezone.utc).isoformat(),
        "event": "tool_call",
        "tool": tool,
        "actor": actor,
        "args": args,
        "outcome": outcome,
        "dry_run": dry_run,
    }
    _logger.info(json.dumps(record))
    return record
