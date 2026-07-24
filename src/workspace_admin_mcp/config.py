"""Runtime configuration, loaded from environment variables.

Everything is driven by env vars so the same code runs identically on a laptop
(stdio transport) and on Cloud Run (streamable-http transport).
"""

from __future__ import annotations

import os
from dataclasses import dataclass


def _as_bool(value: str | None, default: bool) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    """Immutable server configuration."""

    admin_subject: str | None
    """Admin user to impersonate via domain-wide delegation (DWD)."""

    credentials_file: str | None
    """Path to the service-account key JSON (GOOGLE_APPLICATION_CREDENTIALS)."""

    customer_id: str
    """Workspace customer id; 'my_customer' resolves to the caller's domain."""

    read_only: bool
    """When True (default) all write tools refuse to execute."""

    default_dry_run: bool
    """When True (default) write tools simulate instead of applying, unless overridden per call."""

    transport: str
    """MCP transport: 'stdio' for local clients, 'streamable-http' for Cloud Run."""

    host: str
    port: int

    @classmethod
    def from_env(cls, env: dict[str, str] | None = None) -> Settings:
        env = env if env is not None else dict(os.environ)
        return cls(
            admin_subject=env.get("WORKSPACE_ADMIN_SUBJECT") or None,
            credentials_file=env.get("GOOGLE_APPLICATION_CREDENTIALS") or None,
            customer_id=env.get("WORKSPACE_CUSTOMER_ID", "my_customer"),
            read_only=_as_bool(env.get("WORKSPACE_READ_ONLY"), True),
            default_dry_run=_as_bool(env.get("WORKSPACE_DRY_RUN"), True),
            transport=env.get("MCP_TRANSPORT", "stdio"),
            host=env.get("HOST", "0.0.0.0"),
            port=int(env.get("PORT", "8080")),
        )
