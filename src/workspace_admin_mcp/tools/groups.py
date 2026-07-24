"""Group membership tools (read + guarded write)."""

from __future__ import annotations

import json

from ..audit import audit
from ..config import Settings
from ..safety import READ_ONLY_MESSAGE, resolve_dry_run, write_allowed


def list_groups_impl(
    client, settings: Settings, user_key: str | None = None, max_results: int = 50
) -> str:
    groups = client.list_groups(user_key=user_key, max_results=max_results)
    audit(
        tool="workspace_list_groups",
        actor=settings.admin_subject or "unknown",
        args={"user_key": user_key, "max_results": max_results},
        outcome=f"{len(groups)} groups",
        dry_run=False,
    )
    return json.dumps(groups, indent=2)


def list_group_members_impl(
    client, settings: Settings, group_key: str, max_results: int = 200
) -> str:
    members = client.list_group_members(group_key, max_results=max_results)
    audit(
        tool="workspace_list_group_members",
        actor=settings.admin_subject or "unknown",
        args={"group_key": group_key},
        outcome=f"{len(members)} members",
        dry_run=False,
    )
    return json.dumps(members, indent=2)


def modify_membership_impl(
    client,
    settings: Settings,
    *,
    action: str,
    group_key: str,
    email: str,
    role: str = "MEMBER",
    dry_run: bool | None = None,
) -> str:
    assert action in {"add", "remove"}
    dry_run = resolve_dry_run(settings, dry_run)
    actor = settings.admin_subject or "unknown"
    tool = f"workspace_{action}_group_member"
    args = {"group_key": group_key, "email": email, "role": role}

    if not write_allowed(settings):
        audit(tool=tool, actor=actor, args=args, outcome="refused_read_only", dry_run=dry_run)
        return READ_ONLY_MESSAGE

    if dry_run:
        audit(tool=tool, actor=actor, args=args, outcome="dry_run", dry_run=True)
        verb = "add to" if action == "add" else "remove from"
        return (
            f"[dry-run] Would {verb} {group_key}: {email}. "
            "Re-run with dry_run=false to apply."
        )

    if action == "add":
        result = client.add_group_member(group_key, email, role=role)
        outcome = "applied"
        payload = json.dumps(result, indent=2)
    else:
        client.remove_group_member(group_key, email)
        outcome = "applied"
        payload = f"Removed {email} from {group_key}."

    audit(tool=tool, actor=actor, args=args, outcome=outcome, dry_run=False)
    return payload


def register(mcp, client, settings: Settings) -> None:
    @mcp.tool()
    def workspace_list_groups(user_key: str | None = None, max_results: int = 50) -> str:
        """List groups. With `user_key`, list only groups that user belongs to."""
        return list_groups_impl(client, settings, user_key=user_key, max_results=max_results)

    @mcp.tool()
    def workspace_list_group_members(group_key: str, max_results: int = 200) -> str:
        """List the members of a group by its email address."""
        return list_group_members_impl(client, settings, group_key, max_results=max_results)

    @mcp.tool()
    def workspace_add_group_member(
        group_key: str, email: str, role: str = "MEMBER", dry_run: bool | None = None
    ) -> str:
        """Add a member to a group. Guarded write (see workspace_suspend_user)."""
        return modify_membership_impl(
            client,
            settings,
            action="add",
            group_key=group_key,
            email=email,
            role=role,
            dry_run=dry_run,
        )

    @mcp.tool()
    def workspace_remove_group_member(
        group_key: str, email: str, dry_run: bool | None = None
    ) -> str:
        """Remove a member from a group. Guarded write (see workspace_suspend_user)."""
        return modify_membership_impl(
            client, settings, action="remove", group_key=group_key, email=email, dry_run=dry_run
        )
