import json

from workspace_admin_mcp.audit import audit


def test_audit_record_is_complete_and_serializable():
    record = audit(
        tool="workspace_suspend_user",
        actor="admin@example.com",
        args={"user_key": "x@example.com"},
        outcome="applied",
        dry_run=False,
    )
    assert record["event"] == "tool_call"
    assert record["tool"] == "workspace_suspend_user"
    assert record["actor"] == "admin@example.com"
    assert record["dry_run"] is False
    assert "ts" in record
    # Must round-trip as JSON (it is emitted as a JSON log line).
    json.loads(json.dumps(record))
