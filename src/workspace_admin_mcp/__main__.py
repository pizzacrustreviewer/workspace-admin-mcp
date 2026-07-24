"""Console entrypoint: `workspace-admin-mcp` / `python -m workspace_admin_mcp`."""

from __future__ import annotations

from .audit import configure_logging
from .auth import WorkspaceDirectory
from .config import Settings
from .server import build_server


def main() -> None:
    configure_logging()
    settings = Settings.from_env()
    server = build_server(settings, WorkspaceDirectory(settings))
    server.run(transport=settings.transport)


if __name__ == "__main__":
    main()
