"""Write guardrails.

Admin tooling can suspend accounts and change group membership, so writes are
off by default. Callers must explicitly opt in via WORKSPACE_READ_ONLY=false,
and each write tool additionally supports a per-call dry run.
"""

from __future__ import annotations

from .config import Settings

READ_ONLY_MESSAGE = (
    "Refused: the server is running in read-only mode. "
    "Set WORKSPACE_READ_ONLY=false to enable write operations."
)


def write_allowed(settings: Settings) -> bool:
    return not settings.read_only


def resolve_dry_run(settings: Settings, dry_run: bool | None) -> bool:
    """A per-call value wins; otherwise fall back to the server default."""
    return settings.default_dry_run if dry_run is None else dry_run
