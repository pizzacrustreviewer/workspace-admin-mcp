import json

from workspace_admin_mcp.tools.groups import modify_membership_impl
from workspace_admin_mcp.tools.users import list_users_impl, suspend_user_impl

from .conftest import make_settings


def test_list_users_returns_json(fake_client):
    out = list_users_impl(fake_client, make_settings())
    assert json.loads(out)[0]["primaryEmail"] == "ada@example.com"


def test_suspend_refused_in_read_only(fake_client):
    out = suspend_user_impl(fake_client, make_settings(read_only=True), "x@example.com")
    assert "read-only" in out
    assert fake_client.suspended == {}  # nothing changed


def test_suspend_dry_run_does_not_mutate(fake_client):
    s = make_settings(read_only=False, default_dry_run=True)
    out = suspend_user_impl(fake_client, s, "x@example.com")
    assert "[dry-run]" in out
    assert fake_client.suspended == {}


def test_suspend_applies_when_enabled(fake_client):
    s = make_settings(read_only=False, default_dry_run=False)
    out = suspend_user_impl(fake_client, s, "x@example.com")
    assert fake_client.suspended["x@example.com"] is True
    assert json.loads(out)["suspended"] is True


def test_remove_member_applies_when_enabled(fake_client):
    s = make_settings(read_only=False, default_dry_run=False)
    modify_membership_impl(
        fake_client, s, action="remove", group_key="team@example.com", email="ada@example.com"
    )
    assert fake_client.removed == [("team@example.com", "ada@example.com")]
