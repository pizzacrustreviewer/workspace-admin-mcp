from __future__ import annotations

import pytest

from workspace_admin_mcp.config import Settings


class FakeDirectory:
    """In-memory stand-in for WorkspaceDirectory — no network, no credentials."""

    def __init__(self) -> None:
        self.suspended: dict[str, bool] = {}
        self.added: list[tuple[str, str, str]] = []
        self.removed: list[tuple[str, str]] = []

    def list_users(self, query=None, max_results=50):
        return [{"primaryEmail": "ada@example.com", "suspended": False}]

    def get_user(self, user_key):
        return {"primaryEmail": user_key, "suspended": self.suspended.get(user_key, False)}

    def suspend_user(self, user_key, suspended=True):
        self.suspended[user_key] = suspended
        return {"primaryEmail": user_key, "suspended": suspended}

    def list_groups(self, user_key=None, max_results=50):
        return [{"email": "team@example.com", "name": "Team"}]

    def list_group_members(self, group_key, max_results=200):
        return [{"email": "ada@example.com", "role": "MEMBER"}]

    def add_group_member(self, group_key, email, role="MEMBER"):
        self.added.append((group_key, email, role))
        return {"email": email, "role": role}

    def remove_group_member(self, group_key, email):
        self.removed.append((group_key, email))


def make_settings(**overrides) -> Settings:
    base = dict(
        admin_subject="admin@example.com",
        credentials_file=None,
        customer_id="my_customer",
        read_only=True,
        default_dry_run=True,
        transport="stdio",
        host="0.0.0.0",
        port=8080,
    )
    base.update(overrides)
    return Settings(**base)


@pytest.fixture
def fake_client() -> FakeDirectory:
    return FakeDirectory()
