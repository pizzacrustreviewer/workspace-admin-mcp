from workspace_admin_mcp.config import Settings


def test_defaults_are_safe():
    s = Settings.from_env({})
    assert s.read_only is True
    assert s.default_dry_run is True
    assert s.customer_id == "my_customer"
    assert s.transport == "stdio"


def test_env_overrides_and_bool_parsing():
    s = Settings.from_env(
        {
            "WORKSPACE_READ_ONLY": "false",
            "WORKSPACE_DRY_RUN": "0",
            "WORKSPACE_ADMIN_SUBJECT": "admin@corp.com",
            "MCP_TRANSPORT": "streamable-http",
            "PORT": "9090",
        }
    )
    assert s.read_only is False
    assert s.default_dry_run is False
    assert s.admin_subject == "admin@corp.com"
    assert s.transport == "streamable-http"
    assert s.port == 9090
