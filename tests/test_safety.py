from workspace_admin_mcp.safety import resolve_dry_run, write_allowed

from .conftest import make_settings


def test_write_blocked_in_read_only():
    assert write_allowed(make_settings(read_only=True)) is False
    assert write_allowed(make_settings(read_only=False)) is True


def test_resolve_dry_run_prefers_explicit_value():
    s = make_settings(default_dry_run=True)
    assert resolve_dry_run(s, None) is True
    assert resolve_dry_run(s, False) is False
    assert resolve_dry_run(make_settings(default_dry_run=False), None) is False
