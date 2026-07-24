"""Google Admin SDK Directory API client.

A thin, typed wrapper that returns compact summaries instead of the raw (huge)
API payloads — which keeps tool output readable for an LLM. Google libraries are
imported lazily so the package (and the unit tests) don't require credentials or
network access just to import.
"""

from __future__ import annotations

from functools import cached_property
from typing import Any

from .config import Settings

READ_SCOPES = [
    "https://www.googleapis.com/auth/admin.directory.user.readonly",
    "https://www.googleapis.com/auth/admin.directory.group.readonly",
]
WRITE_SCOPES = [
    "https://www.googleapis.com/auth/admin.directory.user",
    "https://www.googleapis.com/auth/admin.directory.group",
]


class WorkspaceDirectory:
    """Wrapper over the Admin SDK `directory_v1` service."""

    def __init__(self, settings: Settings) -> None:
        self._settings = settings

    @cached_property
    def _service(self):  # pragma: no cover - requires real credentials
        from google.oauth2 import service_account
        from googleapiclient.discovery import build

        if not self._settings.credentials_file:
            raise RuntimeError("GOOGLE_APPLICATION_CREDENTIALS is not set.")

        scopes = READ_SCOPES if self._settings.read_only else READ_SCOPES + WRITE_SCOPES
        creds = service_account.Credentials.from_service_account_file(
            self._settings.credentials_file, scopes=scopes
        )
        if self._settings.admin_subject:
            # Domain-wide delegation: act as a real admin user.
            creds = creds.with_subject(self._settings.admin_subject)
        return build("admin", "directory_v1", credentials=creds, cache_discovery=False)

    # --- users -------------------------------------------------------------
    def list_users(self, query: str | None = None, max_results: int = 50) -> list[dict[str, Any]]:
        resp = (
            self._service.users()
            .list(
                customer=self._settings.customer_id,
                query=query,
                maxResults=max_results,
                orderBy="email",
            )
            .execute()
        )
        return [_user_summary(u) for u in resp.get("users", [])]

    def get_user(self, user_key: str) -> dict[str, Any]:
        return _user_summary(self._service.users().get(userKey=user_key).execute())

    def suspend_user(self, user_key: str, suspended: bool = True) -> dict[str, Any]:
        updated = (
            self._service.users()
            .update(userKey=user_key, body={"suspended": suspended})
            .execute()
        )
        return _user_summary(updated)

    # --- groups ------------------------------------------------------------
    def list_groups(
        self, user_key: str | None = None, max_results: int = 50
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {"maxResults": max_results}
        if user_key:
            params["userKey"] = user_key
        else:
            params["customer"] = self._settings.customer_id
        resp = self._service.groups().list(**params).execute()
        return [_group_summary(g) for g in resp.get("groups", [])]

    def list_group_members(self, group_key: str, max_results: int = 200) -> list[dict[str, Any]]:
        resp = self._service.members().list(groupKey=group_key, maxResults=max_results).execute()
        return [_member_summary(m) for m in resp.get("members", [])]

    def add_group_member(self, group_key: str, email: str, role: str = "MEMBER") -> dict[str, Any]:
        member = (
            self._service.members()
            .insert(groupKey=group_key, body={"email": email, "role": role})
            .execute()
        )
        return _member_summary(member)

    def remove_group_member(self, group_key: str, email: str) -> None:
        self._service.members().delete(groupKey=group_key, memberKey=email).execute()


def _user_summary(u: dict[str, Any]) -> dict[str, Any]:
    return {
        "primaryEmail": u.get("primaryEmail"),
        "name": (u.get("name") or {}).get("fullName"),
        "suspended": u.get("suspended", False),
        "orgUnitPath": u.get("orgUnitPath"),
        "isAdmin": u.get("isAdmin", False),
        "lastLoginTime": u.get("lastLoginTime"),
    }


def _group_summary(g: dict[str, Any]) -> dict[str, Any]:
    return {
        "email": g.get("email"),
        "name": g.get("name"),
        "directMembers": g.get("directMembersCount"),
    }


def _member_summary(m: dict[str, Any]) -> dict[str, Any]:
    return {
        "email": m.get("email"),
        "role": m.get("role"),
        "type": m.get("type"),
        "status": m.get("status"),
    }
