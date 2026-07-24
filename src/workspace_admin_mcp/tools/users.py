"""User lifecycle tools (read + guarded write)."""

from __future__ import annotations

import json

from ..audit import audit
from ..config import Settings
from ..safety import READ_ONLY_MESSAGE, resolve_dry_run, write_allowed


def list_users_impl(
    client, settings: Settings, query: str | None = None, max_results: int = 50
) -> str:
    users = client.list_users(query=query, max_results=max_results)
    audit(
        tool="workspace_list_users",
        actor=settings.admin_subject or "unknown",
        args={"query": query, "max_results": max_results},
        outcome=f"{len(users)} users",
        dry_run=False,
    )
    return json.dumps(users, indent=2)


def get_user_impl(client, settings: Settings, user_key: str) -> str:
    user = client.get_user(user_key)
    audit(
        tool="workspace_get_user",
        actor=settings.admin_subject or "unknown",
        args={"user_key": user_key},
        outcome="ok",
        dry_run=False,
    )
    return json.dumps(user, indent=2)


def suspend_user_impl(
    client,
    settings: Settings,
    user_key: str,
    suspended: bool = True,
    dry_run: bool | None = None,
) -> str:
    dry_run = resolve_dry_run(settings, dry_run)
    actor = settings.admin_subject or "unknown"
    args = {"user_key": user_key, "suspended": suspended}

    if not write_allowed(settings):
        audit(
            tool="workspace_suspend_user",
            actor=actor,
            args=args,
            outcome="refused_read_only",
            dry_run=dry_run,
        )
        return READ_ONLY_MESSAGE

    if dry_run:
        audit(
            tool="workspace_suspend_user",
            actor=actor,
            args=args,
            outcome="dry_run",
            dry_run=True,
        )
        return (
            f"[dry-run] Would set suspended={suspended} on {user_key}. "
            "Re-run with dry_run=false to apply."
        )

    result = client.suspend_user(user_key, suspended=suspended)
    audit(tool="workspace_suspend_user", actor=actor, args=args, outcome="applied", dry_run=False)
    return json.dumps(result, indent=2)


def register(mcp, client, settings: Settings) -> None:
    @mcp.tool()
    def workspace_list_users(query: str | None = None, max_results: int = 50) -> str:
        """List Workspace users. `query` accepts Admin SDK search syntax, e.g.
        "isSuspended=true" or "orgUnitPath=/Sales"."""
        return list_users_impl(client, settings, query=query, max_results=max_results)

    @mcp.tool()
    def workspace_get_user(user_key: str) -> str:
        """Get one user's directory profile by primary email or unique id."""
        return get_user_impl(client, settings, user_key)

    @mcp.tool()
    def workspace_suspend_user(
        user_key: str, suspended: bool = True, dry_run: bool | None = None
    ) -> str:
        """Suspend (or, with suspended=false, restore) a user — a core offboarding
        step. Guarded: refused unless WORKSPACE_READ_ONLY=false, and defaults to a
        dry run unless dry_run=false."""
        return suspend_user_impl(client, settings, user_key, suspended=suspended, dry_run=dry_run)
